# Maker Forge Bench

A soldering drawing viewer for any electronics project: zoom into schematics and board layouts,
find a part, flip to the solder side, tick off what's done, and ask Claude about a part. It runs in
your browser on PC, phone and tablet, with no account and no uploads.

It's part of **Maker Forge**, a suite of hobbyist apps that share one project file, alongside
Shape, today's [Maker Forge](https://github.com/Retr0Plus95/Maker-Forge) 3D app. It will live at
`forge.retr0plus.se/bench/`.

**Status:** release 0.1 works on a PC, from a local folder: sheet tabs, zoom and pan, Find part,
flip to the solder side, and auto-refresh. Phone, tablet and the website come in 0.3 and 1.0.

## Try it

You need Python 3.10 or newer. In this folder:

```
python dev.py "path/to/your/project folder"
```

Then open the address it prints (`http://127.0.0.1:8765/`). Every SVG, PNG and JPG drawing in that
folder gets a tab. Zoom with the mouse wheel or `+` / `-`, drag to move around, and press `0` to
fit the sheet. Type a part in **Find part** (`/`), then Enter or `n` / `N` to go from match to match.
Press `f` (or the button) to flip a layout to the solder side. A sheet reloads by itself when its
drawing changes, keeping your zoom.

To run the checks: `npm install` once, then `bash check.sh` (Git Bash on Windows). The browser
checks use Chrome or Edge; set `BENCH_BROWSER` to a browser's path to pick another.

- Design for release 1: [`docs/design/2026-11-12-maker-forge-bench-design.md`](docs/design/2026-11-12-maker-forge-bench-design.md)
- Roadmap, including ideas for future suite apps: [`ROADMAP.md`](ROADMAP.md)

MIT licence: see [`LICENSE`](LICENSE).
