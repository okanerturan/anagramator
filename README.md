# Anagramator

Paste two phrases. If their letters and numbers match, Anagramator shows how each character moves from one phrase to the other. The comparison and animation run in the browser, so the text never leaves the page.

[Open Anagramator](https://okturan.github.io/anagramator/)

The live page is an editor with separate panels for text, motion, appearance, export settings, and the animation preview.

## Generated output

The media below comes from the repository's standalone video renderer. It demonstrates the same 103-letter transformation, but it is not a screenshot or recording of the editor interface.

[![Final frame from the standalone 103-letter anagram demo](assets/anagramator-poster.png)](assets/anagramator-demo.mp4)

[Watch the eight-second, 1920×1080 MP4](assets/anagramator-demo.mp4), or see the smaller inline preview:

![Standalone demo of a long phrase rearranging into its matching target](assets/anagramator-preview.gif)

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

## Rebuild the demo video

The checked-in MP4 is generated from `anagram.json` at 1920×1080, 30 FPS, and eight seconds long. On macOS with Swift and FFmpeg installed:

```sh
python3 render_anagram.py
```

`render_svg_gif.mjs` is a separate helper for turning an exported animated SVG into a GIF. It expects Google Chrome and FFmpeg.
