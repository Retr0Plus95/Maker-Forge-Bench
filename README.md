# Maker Forge Bench

A soldering drawing viewer for any electronics project: zoom into schematics and board layouts,
find a part, see what it is and why it's there, flip to the solder side, tick off what's done, and
ask Claude about a part. It runs in your browser on PC, phone and tablet, with no account and no
uploads.

It's part of **Maker Forge**, a suite of hobbyist apps that share one project file, alongside
Shape, today's [Maker Forge](https://github.com/Retr0Plus95/Maker-Forge) 3D app. It will live at
`forge.retr0plus.se/bench/`.

**Status:** release 0.2 works on a PC, from a local folder. Phone and tablet, GitHub links and the
website come later (see the roadmap).

## Try it

You need Python 3.10 or newer. In this folder:

```
python dev.py "path/to/your/project folder"
```

Then open the address it prints (`http://127.0.0.1:8765/`).

- **Sheets:** every SVG, PNG and JPG drawing in the folder gets a tab. Zoom with the mouse wheel or
  `+` / `-`, drag to move around, and press `0` to fit.
- **Find part** (`/`): type a part, a net or a hole (`R6`, `PWMCTL`, `28,12`), then Enter or `n` / `N`
  to go from match to match. Finding a part opens its card.
- **Part cards:** click a part's label on a drawing. The card says what it is, why it's there and
  which way round it goes, opens its datasheet, and lists every sheet it's on.
- **Build checklist:** tick parts as you solder them, and their labels turn green on every sheet.
  Progress saves itself, and **Save progress as file** moves it to another device.
- **Ask Claude:** in the part card, Copy for Claude or Open claude.ai. In the Claude app, Claude reads
  the part you've selected straight from the page.
- **Flip** (`f`) shows a layout from the solder side. **Side by side** shows two sheets at once on a
  wide screen.
- **Easy reading:** dark or light, high contrast, the clear Atkinson Hyperlegible font, larger text,
  less motion.
- **Undo everything:** `Ctrl+Z` and `Ctrl+Y`, or the Undo and Redo buttons. A sheet reloads by itself
  when its drawing changes, keeping your zoom.

## Describe your project: `forge-project.json`

Bench works on any folder of drawings, guessing parts from labels like `R6` or `U2 ATmega328P`.
A small `forge-project.json` at the top of the folder tells it more: sheet names in your order,
and each part's value, job and orientation. Only `format`, `version` and `name` are required:

```json
{
  "format": "forge-project",
  "version": 1,
  "name": "My Lamp",
  "revision": "Rev A",
  "sheets": [
    { "id": "S1", "title": "Schematic", "file": "docs/schematic.svg", "kind": "schematic" },
    { "id": "S2", "title": "Perfboard layout", "file": "docs/layout.svg", "kind": "layout" }
  ],
  "parts": [
    { "ref": "D1", "value": "1N4007", "type": "diode", "polarized": true,
      "orientation": "Band toward the +12 V row.", "role": "Stops a reversed supply doing damage.",
      "datasheet": "https://example.com/1n4007.pdf" },
    { "ref": "R1", "value": "10k", "type": "resistor", "role": "Pull-up on the reset pin.",
      "datasheetFile": "docs/datasheets/resistor.pdf" }
  ]
}
```

The [Solder Fume Extractor](https://github.com/Retr0Plus95/Solder-Fume-Extractor) has a full example.
The design's §6 lists every field.

## Checks

`npm install` once, then `bash check.sh` (Git Bash on Windows). It must end `ALL CHECKS PASSED`.
The browser checks use Chrome or Edge; set `BENCH_BROWSER` to a browser's path to pick another.

- Design for release 1: [`docs/design/2026-11-12-maker-forge-bench-design.md`](docs/design/2026-11-12-maker-forge-bench-design.md)
- Design for the board view, parts library and UI: [`docs/design/2026-11-12-board-view-parts-ui-design.md`](docs/design/2026-11-12-board-view-parts-ui-design.md)
- Roadmap, including ideas for future suite apps: [`ROADMAP.md`](ROADMAP.md)

MIT licence: see [`LICENSE`](LICENSE). The Atkinson Hyperlegible font is under the SIL Open Font
Licence: see [`FONTS-LICENSE.md`](FONTS-LICENSE.md).
