# Maker Forge Bench

A soldering drawing viewer for any electronics project: zoom into schematics and board layouts,
find a part, see what it is and why it's there, flip to the solder side, tick off what's done, and
ask Claude about a part. It runs in your browser on PC, phone and tablet, with no account and no
uploads.

It's part of **Maker Forge**, a suite of hobbyist apps that share one project file, alongside
Shape, today's [Maker Forge](https://github.com/Retr0Plus95/Maker-Forge) 3D app. It will live at
`forge.retr0plus.se/bench/`.

**Status:** release 0.4.1 works on a PC, from a local folder. Phone and tablet, GitHub links and the
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
  to go from match to match. Finding a part opens its card. It also knows **lines** (`+5 V`, `0 V`)
  and **values** (`100 nF`, `10k`).
- **Part cards:** click a part's label on a drawing. The card says what it is, why it's there and
  which way round it goes, opens its datasheet, and lists every sheet it's on. With a board in the
  project file it also says **what each pin connects to** (`pin 2 → TACHA_F: J2 3, R12 1`, each
  part one click away), **which holes it goes in** on sheet 4, and **which build step** it's in.
- **Build steps:** the build order, one step at a time, with why, what to do, and that step's parts
  ringed on the drawing. Space / Shift+Space to move, and "Tick all in this step".
- **3D board** (`b`): the perfboard in 3D over the dimmed schematic, every part labelled, the wiring
  underneath (which you can hide). Click a part to open its card: its holes light up and it lifts.
  Double-click to turn to it. The open step's parts glow blue. `t` and `u` show the top and the
  underside, and the camera is remembered.
- **Build checklist:** tick parts as you solder them, and their labels turn green on every sheet.
  Progress saves itself, and **Save progress as file** moves it to another device. "Only not
  soldered" hides what's done; polarised parts say "Way round matters".
- **What to wire:** every connection the circuit needs, one group per line (`+5 V: buck module OUT+,
  C2 +, chip pin 7, chip pin 20, …`). Tick each leg as it's soldered to its line, on the list or on
  the part card. It doesn't depend on where your parts sit, so it works on a board you laid out
  yourself. **Show** rings a line's parts; **Copy as text** and printing give you the list on paper.
- **Chip pins:** "Show pins" on a chip's or header's card draws it pin by pin with each pin's line,
  seen from the **top** or from **underneath** (where the two rows swap sides).
- **Your board, from your photos:** put photos of your own board in the project folder (for
  example `my-board/`). On a photo, **My board** lines it up: tap the chip's pin 1 and pin 14, and
  Bench marks every chip pin, green when it's wired and orange when not. Place any part by tapping
  its holes from its card; it then shows on the top and underside photos alike.
- **Before power:** meter checks from the project's own supplies (a beep test to 0 V, each supply
  measured with the chip out) to tick before the chip goes in.
- **Your notes:** a note on any part ("used a 4.7k here"), kept with your progress, and Claude
  sees it too.
- **Ask Claude:** in the part card, Copy for Claude or Open claude.ai. In the Claude app, Claude reads
  the part you've selected straight from the page.
- **Flip** (`f`) shows a layout from the solder side. **Side by side** shows two sheets at once on a
  wide screen.
- **Easy reading:** dark or light, high contrast, the clear Atkinson Hyperlegible font, larger text,
  less motion.
- **Undo everything:** `Ctrl+Z` and `Ctrl+Y`, or the Undo and Redo buttons. A sheet reloads by itself
  when its drawing changes, keeping your zoom.
- **Moving around:** `1`–`9` pick sheets, the zoom badge fits the sheet when clicked, Bench opens on
  the sheet you last looked at, and `?` lists every shortcut.
- **At the bench:**
  - **Full screen** and **Keep screen on**, so the screen doesn't go dark while you solder.
  - **Hide panel** (`p`) for more drawing room; any panel section folds away from its heading.
  - **Turn photo** (`r`) for a sideways photo.
  - `s` marks the open part soldered.
  - **Shopping list**: what to buy and how many, which you can copy or save as a spreadsheet.
  - **Start over**, which asks twice and can be undone.
  - Easy reading can follow your computer's light or dark setting.

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

The [Solder Fume Extractor](https://github.com/Retr0Plus95/Solder-Fume-Extractor) has a full example,
including a `board` section (every part's holes, the buses, links, bridges and connections) and a
`build` section (the steps and their reasons), both generated from its layout data by its
`hardware/layout/export_board.py`.
The design's §6 lists every field.

## Checks

`npm install` once, then `bash check.sh` (Git Bash on Windows). It must end `ALL CHECKS PASSED`.
The browser checks use Chrome or Edge; set `BENCH_BROWSER` to a browser's path to pick another.

- Design for release 1: [`docs/design/2026-11-12-maker-forge-bench-design.md`](docs/design/2026-11-12-maker-forge-bench-design.md)
- Design for the board view, parts library and UI: [`docs/design/2026-11-12-board-view-parts-ui-design.md`](docs/design/2026-11-12-board-view-parts-ui-design.md)
- Roadmap, including ideas for future suite apps: [`ROADMAP.md`](ROADMAP.md)

MIT licence: see [`LICENSE`](LICENSE). The Atkinson Hyperlegible font is under the SIL Open Font
Licence: see [`FONTS-LICENSE.md`](FONTS-LICENSE.md). three.js r128 is MIT: see [`THREE-LICENSE`](THREE-LICENSE).
