# Import a KiCad project — design (planned for Bench 1.2)

Date: 2026-11-14. First written as part of Bench 0.9, then moved out the same day. The owner has
never used KiCad, and doesn't want Bench to depend on running anything on their computer. They
asked for KiCad import "just as the option for people importing their projects from there". So
this is an option for people who already design in KiCad. It sits in 1.2 "More files" (my call:
the people it's for arrive once the website is live at 1.0, and 1.0 comes sooner this way).

A step-by-step plan for most of this was written as tasks 5–10 of the 0.9 plan (commit `02a11fe`,
`docs/plans/2026-11-14-release-0.9-real-parts.md` at that commit). Reuse it when 1.2 is planned,
adding the GitHub way (§3).

## Intent and the why

Many open electronics projects on GitHub are made in KiCad. Opening them straight from a link gives
those builders Bench's part cards, guide and 3D board. Bench also turns KiCad's error checks into
something a beginner can follow: **Show me**, and **Ask AI how to fix**. Nobody should need KiCad
open, or Bench running on their computer, for any of it.

## Goals

1. A folder or repo with a `.kicad_pro` opens in Bench: part cards, connections, a 3D board with
   the library's real parts, and build steps made for you. This works on the website, in the
   browser alone.
2. The exact sheets, the exact 3D board, KiCad's checks (ERC and DRC) and factory files, made by
   KiCad itself in one of two ways:
   - **on GitHub** (the main way): nothing runs on your computer;
   - **on your computer**, through `dev.py` with KiCad installed (for folders not on GitHub).
3. KiCad's checks in plain words, with Show me, Ask AI how to fix, and Ignore.

## Non-goals

- Drawing a schematic from `.kicad_sch` in the browser (sheets come from KiCad's export). Maybe
  later.
- Bench's own ERC or DRC (Circuit will have its own). Editing or writing KiCad files (that's
  Circuit).
- A server of our own running KiCad. It would cost money and break "your files stay on your
  device".
- The guided continuity test on KiCad boards (1.4).

## Anti-goals

- KiCad import getting in the way of people who don't use KiCad.
- Anything uploaded anywhere the user didn't put it. The GitHub way only uses the user's own repo.
- `dev.py` writing into the project folder.

## 1. Read in the browser, always

**Finding it:**
- A folder or repo with a `.kicad_pro` is a KiCad project.
- The file lists (`dev.py`, a picked folder, GitHub) include `.kicad_pro`, `.kicad_sch` and
  `.kicad_pcb`, read as text, up to 20 MB each.
- A `forge-project.json` wins, and KiCad fills what it leaves out.
- A repo with several KiCad projects opens the first by name, and the Menu offers the others.

**The reader** (`src/sexpr.js`, `src/kicad.js`):
- A small reader for KiCad's bracketed text, with limits on depth (200), size and count. It's
  tested against broken and nasty files, like the SVG cleaner.
- From `.kicad_pcb`:
  - each footprint's reference, value, name, position, rotation, side, through-hole or
    surface-mount, and "not fitted" (DNP);
  - its pads with number, position, drill and net name;
  - its 3D model path with offset, scale and rotation. Footprints name `.step` files under
    `${KICAD9_3DMODEL_DIR}` (6–8 in older files, `${KISYS3DMOD}` in KiCad 5), so matching a
    library model ignores the variable and the extension;
  - the board outline from `Edge.Cuts`, and the thickness.

  KiCad 5's `(module …)` reads like `(footprint …)`.
- From `.kicad_sch` and its sub-sheets: each symbol's reference, value, footprint, datasheet,
  library name, DNP and "leave out of the parts list".

**What Bench makes of it:**
- **Part cards:**
  - the value;
  - the type, guessed from the library and footprint names;
  - the datasheet button;
  - what each pin connects to, from the pad nets.
- **The checklist:** "not fitted" parts are listed apart.
- **Build steps made for you**, when there are none. Surface-mount parts come first, then
  through-hole parts from the lowest up:
  1. links;
  2. resistors and diodes;
  3. chips and chip sockets;
  4. small capacitors;
  5. transistors and regulators;
  6. LEDs;
  7. headers;
  8. electrolytics;
  9. connectors and big parts.

  The steps are adjustable as in 0.8.
- **The panel tabs:** Wiring hides (a copper board has nothing to hand-wire).
- **The 3D board:**
  - the outline extruded to the board's thickness, with copper rings for the pads;
  - each footprint's library model, placed with its offset, turn and scale, and mirrored on the
    bottom;
  - a grey box labelled "no 3D model" where the model isn't in the library;
  - pads only for DNP parts and footprints with no model;
  - a net in a part card lights its pads.

## 2. KiCad's own outputs, and where Bench finds them

The same set from either way. Bench reads them the same way, whoever made them:
- the sheets: `sch export svg`;
- the board's top and bottom: `pcb export svg --mode-single --exclude-drawing-sheet
  --fit-page-to-board`, with `--mirror` for the bottom;
- the exact 3D board: `pcb export glb --subst-models --no-dnp --include-tracks --include-pads
  --include-zones --include-silkscreen --include-soldermask`;
- the checks: `sch erc --format json --severity-all` and
  `pcb drc --format json --schematic-parity --severity-all`;
- factory files: `pcb export gerbers`, `drill`, `pos --format csv --units mm` and
  `sch export bom`, zipped as `<name>-factory-files.zip`;
- `bench-out.json`: the KiCad version, when the outputs were made, the source commit (GitHub) or
  the files' times (`dev.py`), and the list of files.

The exact 3D board: its parts are GLB nodes named by reference (55 of 63 on KiCad's
`pic_programmer` demo). Bench makes each a pickable part. It's scaled from glTF's metres to
Bench's millimetres.

## 3. GitHub runs KiCad for you (the main way)

- **Setting it up:**
  - The Menu's **Set up KiCad on GitHub** shows a ready-made workflow file,
    `.github/workflows/maker-forge-bench.yml`, with **Copy** and plain steps: add the file to your
    repo, and allow Actions to write.
  - The file needs `permissions: contents: write`, to push the outputs to a branch of the same
    repo.
- **On every push** that changes a KiCad file:
  - it runs in KiCad's official container image (the 9.0 one) and makes §2's outputs;
  - it force-pushes them to a branch called `maker-forge-bench`, which holds only the latest
    outputs, so the repo doesn't grow with every run.
- **On the website:**
  - opening the repo, Bench asks GitHub for that branch's file list (one call, like today's) and
    reads the outputs from `raw.githubusercontent.com`, which Bench's CSP already allows;
  - if `bench-out.json`'s commit is older than the repo's latest change to a KiCad file, Bench
    says the outputs are from an older version, with when they were made.
- **Cost and limits:** free for public repos; private repos use their monthly free minutes. The
  outputs show up a few minutes after a push.
- *Check first:* the container image's exact name and tag, how long a run takes, and the GLB's
  size. Keep it under 25 MB; if it's bigger, make it again without zones.

## 4. On your computer, with `dev.py` and KiCad (the extra way)

For folders that aren't on GitHub:
- **Finding KiCad:** `dev.py --kicad PATH`, otherwise PATH, otherwise KiCad's usual folders.
  `kicadcli.py` runs §2's commands.
- **The cache:**
  - kept outside the project: `%LOCALAPPDATA%\MakerForgeBench\kicad`, or
    `~/.cache/maker-forge-bench/kicad`;
  - keyed by the project's path and each input file's size and time;
  - trimmed past 500 MB.
- **Safely:**
  - a list of arguments, no shell;
  - files inside the folder only, one job at a time, a 120-second limit;
  - Windows-native paths. Folder names with spaces and "ö" must work.
- **While it works:** the page says what KiCad is doing ("making the 3D board, about 15 s"). When
  a KiCad file changes, the outputs are made again.

## 5. KiCad's checks, in plain words

- The Checks tab gets **KiCad checks**: errors first. Each has a plain-words title, with KiCad's
  own words under it. For example:
  - `pin_not_connected`: "A pin is connected to nothing";
  - `power_pin_not_driven`: "Nothing powers this power pin (KiCad wants a PWR_FLAG here)";
  - `clearance`: "Copper too close together";
  - `unconnected_items`: "Not joined yet";
  - `footprint_symbol_mismatch`: "The board and the schematic disagree about this part";
  - `footprint_link_issues`: "This part's footprint can't be found";
  - `lib_footprint_mismatch`: "This footprint differs from the library's".

  Unknown types keep KiCad's words.
- **Show me:** an ERC finding opens its sheet and rings the spot. A DRC finding marks it in 3D or
  on the board sheet.
  - KiCad 9.0.6's ERC file gives positions 100 times too small (0.3175 for 31.75 mm on the
    `pic_programmer` demo); DRC's are right.
  - Bench checks ERC positions against the symbols they name, and scales them only when they're
    off by 100, so a later, fixed KiCad still works.
  - The sheet SVGs' `viewBox` is the schematic's own millimetres.
- **Ask AI how to fix:**
  - sends only the finding, its parts and their connections to the AI set up in Easy reading;
  - the answer is shown as advice, and the files are never changed.
- **Ignore this one:** kept with your progress, and undoable.

## 6. Tests

- **Unit:**
  - the reader, with nasty files;
  - KiCad 9 and KiCad 5 boards;
  - footprints turned and on the bottom side;
  - symbols across sub-sheets;
  - the build-order rule;
  - checks to findings, with the ×100 rule both ways.
- **A test KiCad project** made by a script from KiCad 9's own libraries, with 13 parts:
  - one part not fitted, one surface-mount, one on the bottom side turned 45°, and one whose
    model isn't in the library;
  - KiCad's outputs are recorded beside it, so the tests run without KiCad.
- **Python:**
  - `kicadcli.py` with a fake `kicad-cli`: finding it, the cache key, timeouts, and paths outside
    the folder refused;
  - a folder named `my board ö`;
  - the workflow file is valid YAML and runs the same commands as `kicadcli.py`.
- **Browser:**
  - the project read in the browser alone;
  - with recorded outputs served as GitHub would serve them (the existing GitHub mock): sheets,
    the exact 3D board, checks with Show me, Ask AI and Ignore;
  - the "older version" note;
  - with `dev.py` and recorded outputs.

## Calls I made

- KiCad import goes in 1.2 "More files", after the launch.
- GitHub is the main way to get KiCad's own outputs; `dev.py` is the extra way.
- The outputs go on a separate branch, `maker-forge-bench`, holding only the latest set.
- `forge-project.json` wins over KiCad files.
- Factory files come with KiCad import (it costs little once KiCad runs).
