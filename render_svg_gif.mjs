#!/usr/bin/env node

import { spawn } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const source = process.argv[2];
const output = process.argv[3];
if (!source || !output) {
  console.error("Usage: render_svg_gif.mjs input.svg output.gif");
  process.exit(2);
}

const chromePath = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const work = mkdtempSync(join(tmpdir(), "anagram-gif-"));
const profile = join(work, "chrome-profile");
const frames = join(work, "frames");
mkdirSync(profile);
mkdirSync(frames);

function waitForDevTools(process) {
  return new Promise((resolve, reject) => {
    let buffer = "";
    const timeout = setTimeout(() => reject(new Error("Chrome DevTools timeout")), 15000);
    process.stderr.on("data", (chunk) => {
      buffer += chunk.toString();
      const match = buffer.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (match) {
        clearTimeout(timeout);
        resolve(match[1]);
      }
    });
    process.once("exit", (code) => reject(new Error(`Chrome exited early (${code})`)));
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
    return new Promise((resolve, reject) => this.pending.set(id, { resolve, reject }));
  }
  close() { this.ws.close(); }
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("exit", (code) => code === 0 ? resolve() : reject(new Error(`${command} exited ${code}`)));
  });
}

const chrome = spawn(chromePath, [
  "--headless=new",
  "--disable-gpu",
  "--hide-scrollbars",
  "--allow-file-access-from-files",
  "--force-device-scale-factor=1",
  "--window-size=1104,804",
  "--remote-debugging-port=0",
  `--user-data-dir=${profile}`,
  "about:blank",
], { stdio: ["ignore", "ignore", "pipe"] });

try {
  const browserWs = await waitForDevTools(chrome);
  const port = new URL(browserWs).port;
  const target = await (await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(pathToFileURL(source).href)}`, { method: "PUT" })).json();
  const cdp = new CDP(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.call("Page.enable");
  await cdp.call("Runtime.enable");
  await cdp.call("Emulation.setDeviceMetricsOverride", {
    width: 1104,
    height: 804,
    deviceScaleFactor: 1,
    mobile: false,
  });
  await new Promise((resolve) => setTimeout(resolve, 350));
  await cdp.call("Runtime.evaluate", {
    expression: `(() => {
      const labels = new Set(["SOURCE", "TARGET", "✓ ANAGRAM"]);
      for (const node of document.querySelectorAll("text")) {
        if (labels.has(node.textContent.trim())) node.remove();
      }
      const background = document.querySelector("svg > rect");
      if (background) background.setAttribute("fill", "#05070c");
      for (const node of document.querySelectorAll('text[opacity=".16"]')) {
        node.setAttribute("opacity", ".29");
        node.setAttribute("fill", "#9eabc0");
      }
      for (const node of document.querySelectorAll("g > text")) {
        node.setAttribute("font-weight", "700");
        node.style.paintOrder = "stroke fill";
        node.style.stroke = "#05070c";
        node.style.strokeWidth = "0.7px";
      }
    })()`,
  });

  const fps = 12;
  const duration = 7;
  const frameCount = fps * duration;
  for (let frame = 0; frame < frameCount; frame++) {
    const time = frame / fps;
    await cdp.call("Runtime.evaluate", {
      expression: `(() => { const s = document.documentElement; s.pauseAnimations(); s.setCurrentTime(${time}); return s.getCurrentTime(); })()`,
      returnByValue: true,
    });
    const shot = await cdp.call("Page.captureScreenshot", {
      format: "png",
      fromSurface: true,
      captureBeyondViewport: false,
    });
    writeFileSync(join(frames, `frame-${String(frame).padStart(4, "0")}.png`), Buffer.from(shot.data, "base64"));
    if (frame % 12 === 0) process.stdout.write(`Captured ${frame + 1}/${frameCount}\r`);
  }
  process.stdout.write(`Captured ${frameCount}/${frameCount}\n`);
  cdp.close();

  const palette = join(work, "palette.png");
  await run("ffmpeg", [
    "-y", "-v", "warning", "-framerate", String(fps),
    "-i", join(frames, "frame-%04d.png"),
    "-vf", "palettegen=max_colors=256:stats_mode=diff", palette,
  ]);
  await run("ffmpeg", [
    "-y", "-v", "warning", "-framerate", String(fps),
    "-i", join(frames, "frame-%04d.png"), "-i", palette,
    "-lavfi", "paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle",
    "-loop", "0", output,
  ]);
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
