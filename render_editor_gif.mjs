#!/usr/bin/env node

import { spawn } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const input = join(root, "index.html");
const output = join(root, "assets", "anagramator-demo.gif");
const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const width = 1440;
const height = 720;
const fps = 15;
const duration = 7;
const frameCount = fps * duration;

const work = mkdtempSync(join(tmpdir(), "anagramator-editor-gif-"));
const profile = join(work, "chrome-profile");
const frames = join(work, "frames");
mkdirSync(profile);
mkdirSync(frames);

function waitForDevTools(process) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(
      () => reject(new Error("Chrome DevTools timeout")),
      15000,
    );
    process.stderr.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    process.once("exit", (code) => {
      reject(new Error(`Chrome exited early (${code})`));
    });
  });
}

class CDP {
  constructor(url) {
    this.ws = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.addEventListener("open", resolve, { once: true });
      this.ws.addEventListener("error", reject, { once: true });
    });
    this.ws.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }

  call(method, params = {}) {
    const id = this.nextId++;
    this.ws.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  close() {
    this.ws.close();
  }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited ${code}`));
    });
  });
}

const chrome = spawn(
  chromePath,
  [
    "--headless=new",
    "--disable-gpu",
    "--hide-scrollbars",
    "--allow-file-access-from-files",
    "--force-device-scale-factor=1",
    `--window-size=${width},${height}`,
    "--remote-debugging-port=0",
    `--user-data-dir=${profile}`,
    "about:blank",
  ],
  { stdio: ["ignore", "ignore", "pipe"] },
);

try {
  const browserWs = await waitForDevTools(chrome);
  const port = new URL(browserWs).port;
  const pageUrl = pathToFileURL(input).href;
  const target = await (
    await fetch(
      `http://127.0.0.1:${port}/json/new?${encodeURIComponent(pageUrl)}`,
      { method: "PUT" },
    )
  ).json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.call("Page.enable");
  await cdp.call("Runtime.enable");
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await cdp.call("Emulation.setEmulatedMedia", {
    media: "screen",
    features: [{ name: "prefers-color-scheme", value: "light" }],
  });
  await new Promise((resolve) => setTimeout(resolve, 500));

  const readiness = await cdp.call("Runtime.evaluate", {
    expression:
      "typeof window.setAnimationPhaseForCapture === 'function' && !!document.querySelector('#stage svg')",
    returnByValue: true,
  });
  if (!readiness.result.value) {
    throw new Error("The editor preview did not initialize");
  }

  for (let frame = 0; frame < frameCount; frame++) {
    const phase = frame / fps;
    await cdp.call("Runtime.evaluate", {
      expression: `window.setAnimationPhaseForCapture(${phase})`,
      returnByValue: true,
    });
    const shot = await cdp.call("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    writeFileSync(
      join(frames, `frame-${String(frame).padStart(4, "0")}.png`),
      Buffer.from(shot.data, "base64"),
    );
    if (frame % fps === 0) {
      process.stdout.write(`Captured ${frame + 1}/${frameCount}\r`);
    }
  }
  process.stdout.write(`Captured ${frameCount}/${frameCount}\n`);
  cdp.close();

  const framePaths = readdirSync(frames)
    .filter((name) => name.endsWith(".png"))
    .sort()
    .map((name) => join(frames, name));
  rmSync(output, { force: true });
  await run("gifski", [
    "--quiet",
    "--extra",
    "--fps",
    String(fps),
    "--width",
    "1200",
    "--quality",
    "95",
    "--motion-quality",
    "95",
    "--lossy-quality",
    "95",
    "--repeat",
    "0",
    "--output",
    output,
    ...framePaths,
  ]);
  console.log(`${output} (${(statSync(output).size / 1024 / 1024).toFixed(2)} MB)`);
} finally {
  if (chrome.exitCode === null) {
    chrome.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => chrome.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 1000)),
    ]);
    if (chrome.exitCode === null) {
      chrome.kill("SIGKILL");
      await new Promise((resolve) => chrome.once("exit", resolve));
    }
  }
  rmSync(work, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
