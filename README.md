# Anagramator

Paste two phrases. If their letters and numbers match, Anagramator shows how each character moves from one phrase to the other. The comparison and animation run in the browser, so the text never leaves the page.

[Open Anagramator](https://okturan.github.io/anagramator/)

[![Anagramator editor with text, motion, appearance, export, and live-preview panels](assets/anagramator-editor.png)](https://okturan.github.io/anagramator/)

This is the actual editor, captured from `index.html` at 1440×720. The GIF below shows the rendered 103-letter transformation without the editor controls.

![A 103-letter phrase rearranging into its perfect anagram](assets/anagramator-demo.gif)

## What it does

- Reports the extra or missing characters when the two inputs do not match.
- Animates up to 400 matched characters with adjustable timing and spacing.
- Includes five color themes, six font choices, light and dark modes, and a case-adaptation option.
- Exports a self-contained animated SVG or a looping GIF at 8, 12, or 16 frames per second.
- Runs as one HTML file with no build step and no server-side code.

## Run it locally

Open `index.html` directly, or serve the folder if your browser limits local font requests:

```sh
python3 -m http.server 8000
```

Then visit `http://localhost:8000`.

Run the analyzer checks with:

```sh
node test.mjs
```

The default Classic Mono font works offline. The other five font choices are loaded from Google Fonts and need a network connection. Large, high-frame-rate GIF exports can take a while because every frame is rendered and encoded in the browser.

## Rebuild the demo GIF

The checked-in GIF is generated from `anagram.json` at 1200×676 from a 15 FPS input, and is eight seconds long. It uses gifski's cross-frame palettes and temporal dithering at quality 95. On macOS with Swift, FFmpeg, and gifski installed:

```sh
python3 render_anagram.py
```

`render_svg_gif.mjs` is a separate helper for turning an exported animated SVG into a GIF. It expects Google Chrome and FFmpeg.
