# VibeMark

VibeMark is a local-first Chrome extension for frontend AI coding. It adds a lightweight annotation layer to any normal webpage so you can point, measure, draw, and copy precise UI context for coding assistants.

It is built for the moment when "move this a little" is not enough. VibeMark captures coordinates, element boxes, CSS selectors, viewport metadata, screenshots, and notes so an AI coding agent can understand exactly what you mean.

## Features

- Live cursor coordinates in viewport space and full-page space.
- Hovered element dimensions and best-effort CSS selector.
- Rectangles, ovals, lines, arrows, pen strokes, and text annotations.
- `Shift` constraints for squares, circles, vertical lines, and vertical arrows.
- Click-to-pin measurement in select mode.
- `Command + C` / `Ctrl + C` to copy pinned coordinates or the selected annotation.
- AI-ready `Copy` output with markdown plus raw JSON.
- Clean annotated screenshot export.
- Layer-style annotation panel with selection, dragging, arrow-key nudging, and Delete/Backspace removal.
- Works on localhost, staging, and deployed production pages.

## Install In Chrome

1. Clone or download this repository.
2. Open `chrome://extensions`.
3. Turn on `Developer mode`.
4. Click `Load unpacked`.
5. Select the repository folder.
6. Open any regular `http` or `https` webpage.
7. Click the VibeMark extension icon.
8. Click `Start Annotation Layer`.

After changing extension files locally, return to `chrome://extensions`, refresh the extension, and refresh the target webpage.

To test `examples/test-page.html` directly as a local file, enable `Allow access to file URLs` for the extension in `chrome://extensions`.

## Basic Usage

- Use the pointer tool to inspect elements and coordinates.
- Click in pointer mode to pin the current location and element info.
- Press `Command + C` on macOS or `Ctrl + C` elsewhere to copy the pinned measurement.
- Draw shapes or text to mark requested frontend changes.
- Open `Panel` to manage annotations like lightweight layers.
- Click a layer card to select an annotation.
- Drag the selected annotation on the page to move it.
- Use arrow keys to nudge by `1px`.
- Use `Shift + Arrow` to nudge by `10px`.
- Press `Delete` or `Backspace` to remove the selected annotation.
- Click `Copy` to copy a full AI-ready change request.
- Click `Shot` to download a screenshot with annotations.
- Click `Clear` to remove all annotations.

## Toolbar

- Pointer: inspect and pin coordinates.
- Rectangle: draw a rectangle; hold `Shift` for a square.
- Oval: draw an oval; hold `Shift` for a circle.
- Line: draw a line; hold `Shift` for a vertical line.
- Arrow: draw an arrow; hold `Shift` for a vertical arrow.
- Pen: freehand drawing.
- Text: add a text note.
- Color dots: choose annotation color.
- Slider: adjust stroke width.
- Panel: show or hide the annotation layer panel.
- Copy: copy an AI-ready prompt and raw JSON.
- Shot: download an annotated screenshot.
- Clear: remove all annotations.
- X: close the annotation layer.

## Coordinate Terms

- `cursor viewport`: the cursor position relative to the currently visible browser viewport.
- `cursor page`: the cursor position relative to the full document, including scroll offset.
- `viewport`: the visible browser area in CSS pixels.
- `dpr`: device pixel ratio. Retina screens commonly report `2`.
- `element`: the hovered element's viewport box: `x`, `y`, `width`, and `height`.
- `selector`: a best-effort CSS selector for the hovered element.
- `pinned`: the last click-to-pin measurement in pointer mode.

## Why Not Just Use Existing Annotation Tools?

Tools such as MarkUp, BugHerd, PerfectPixel, page rulers, and visual feedback extensions are useful, but many are centered on screenshots, comments, QA workflows, or pixel measurement alone.

VibeMark focuses on AI coding handoff:

- Coordinates and selectors are visible, pinned, and copyable.
- Annotations include structured geometry, not just a screenshot mark.
- The output is designed for coding assistants, with markdown and JSON in one payload.
- It works directly on already deployed pages as well as localhost.
- The panel behaves like a simple annotation layer list, so marks can be selected, moved, nudged, and deleted.
- Screenshots hide VibeMark's own UI, leaving only the page and your marks.

## Browser Limits

Chrome extensions cannot inject into browser-owned pages such as `chrome://...`, the Chrome Web Store, or some restricted internal pages. Some cross-origin iframes and closed Shadow DOM components may also hide their internal DOM from content scripts. VibeMark can still annotate the visible page area around those regions.

## Project Structure

- `manifest.json`: Chrome extension manifest.
- `popup.html`: extension popup.
- `src/popup.js`: popup behavior.
- `src/popup.css`: popup styling.
- `src/content.js`: annotation layer, measurements, export, and panel logic.
- `src/overlay.css`: injected overlay UI styling.
- `src/background.js`: screenshot and download helpers.
- `assets/icon.svg`: icon source.
- `assets/icon-*.png`: generated extension icons.
- `scripts/generate_icons.py`: icon generation script.
- `examples/test-page.html`: local test page.

## Development

Regenerate icon PNGs after editing `assets/icon.svg` or `scripts/generate_icons.py`:

```bash
python3 scripts/generate_icons.py
```

Reload the extension in `chrome://extensions` after making code changes.

## License

MIT
