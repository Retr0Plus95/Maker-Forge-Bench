# Maker Forge Bench: 3D board view, parts library and UI

*Written 2026-11-12. Status: **draft for the owner's review**. It builds on the release-1 design,
`2026-11-12-maker-forge-bench-design.md`, and changes the roadmap from 0.3 on (section 10).*

## 1. What the owner asked for

**Said**
- "What does the fume box need for the bench project to be better": make those files.
- Start building the next stage.
- A **3D view of the perfboard with the schematic in the background**. Pressing a part shows
  where it goes and why, both in 3D and as text, so makers can follow along.
- Makers can make **their own adjustments**. Asked what that means, the owner chose
  **dragging parts to other holes in 3D**, with the connections checked the way `pcb.py` checks
  them, saved as a new layout.
- **Spend time on the UI**, reusing what the website and Maker Forge already have.
- **Start saving accurate parts and components**, for the 3D view now and the inventory app later.
- A **datasheet shortcut, or the file itself, right there on the part**.
- **Suggested routing of cables**, always with **different options** to pick from.
- **"Most options and easy to use"**: change, undo and save your work everywhere.
- Where a 3D-engine or UI improvement helps **Shape and Bench both**, make it for both.

**Assumed** (the owner can correct any of these)
- The board view and its editor live **inside Bench**. The roadmap's separate Layout app keeps only
  "start a new board from a circuit" and stripboard, for later.
- Perfboard (one pad per hole) first; stripboard later.
- The fume extractor stays the first and test project.

## 2. What the fume extractor repo gets

| File | What it holds | Status |
|---|---|---|
| `forge-project.json` | The six sheets, and all 37 parts (32 on the board, 5 on the panel) with value, job ("why"), and which way round the polarised ones go | **Written**, not committed: the owner commits and pushes |
| `hardware/layout/export_board.py` | Writes the project file's `board` section (section 3) from `board.py`, leaving every other section as it is. `check.sh` runs it, so the file can never drift from the layout | Release 0.3 |
| `build` section of the project file | The build order from guide §13 as steps, each with its "why" (buses first while the board is empty; the socket before the chip; the underside parts for short legs; power-up checks before the chip) | Release 0.3 |
| `"part"` on each part | A link to its entry in the parts library (section 4), such as `"part": "1N5402G"` | Release 0.3 |
| `checks` section | The bring-up measurements from guide §7, with expected values | Release 1.4 (already on the roadmap) |

The repo's rules still apply: `check.sh` must pass, the layout stays in `board.py`, and the
`test_checker.py` cases stay at 8/8.

## 3. The board section

Written by `export_board.py`. It uses the same model as `board.py`: holes are (column, row),
counted from 1 at the top left, at a 2.54 mm pitch.

```json
"board": {
  "format": "perfboard",
  "source": "hardware/layout/board.py",
  "pitch": 2.54, "cols": 32, "rows": 20, "hole": 1.0,
  "parts": {
    "R6":  { "type": "res", "pins": { "1": [28, 16], "2": [28, 17] }, "body": "2", "side": "top" },
    "D1":  { "type": "diode_stand", "pins": { "K": [2, 2], "A": [2, 4] }, "body": "A", "D": 5.4, "side": "top" },
    "U1":  { "type": "module", "pins": { "INp": [4, 2], "INn": [4, 4], "OUTp": [8, 6], "OUTn": [8, 4] }, "keepout": [0.6, 7.4, 9.3, 14.1], "side": "top" },
    "C5":  { "type": "underside", "pins": { "1": [17, 13], "2": [18, 13] }, "side": "bottom" }
  },
  "buses":   [ { "row": 2, "from": 2, "to": 32, "net": "P12V", "label": "+12 V", "side": "bottom" } ],
  "links":   [ { "path": [[22, 1], [22, 3], [25, 3], [25, 7], [26, 8]], "side": "bottom" } ],
  "bridges": [ { "holes": [[26, 8], [26, 9]], "side": "bottom" } ],
  "nets":    { "P12V": [["J0", "1"], ["D1", "K"]] },
  "spare":   ["2", "3", "13"]
}
```

- **Part types:** the same as `pcb.py`: `res`, `cer`, `elec`, `header`, `underside`, `diode_stand`,
  `module`, `dip`, `to92`. A type Bench doesn't know yet is drawn as a plain labelled box.
- **Link paths** may bend at half-holes, as `board.py`'s do (for example `[30.5, 1.6]`).
- **Sides:** buses, links, bridges and the four underside parts are on the solder side, exactly as
  sheet 4 draws them.

## 4. The parts library: accurate components

**What it's for:** one place that says what a part *is*:
- its body for the 3D view: shape, size, lead spacing, lead thickness, height above the board;
- its markings: band, stripe, notch, flat face;
- its basic ratings;
- the identity the inventory app will use later: part number, generic name, datasheet.

**Files**
- `library/packages/<id>.json`: a body shape. The fume extractor needs about 14:
  - DO-201AD, TO-92 and DIP-28 (600 mil);
  - radial electrolytics D8 / D6.3 / D5;
  - an axial resistor (0207), a standing resistor and a ceramic disc;
  - HC-49S, a 5 mm LED, a 2.54 mm pin header, a 4-pin fan header, and the MP1584EN module board.
- `library/parts/<id>.json`: a real part, such as the 1N5402G, which points to its package and adds
  its ratings, datasheet, marking and polarity.

**Accuracy rules.** These matter more than coverage:
- Every number carries its `source`: the manufacturer's datasheet (link and date read), a JEDEC
  outline, or "measured by the owner".
- Every number also carries its `basis`: `max`, `typical` or `measured`.
- A part is `"verified": true` only after its numbers have been checked against that source. Until
  then the 3D view shows a **"typical size"** badge on it, so nobody mistakes a guess for a measurement.
- The owner's own measurements win: D1's legs are about 1.3 mm, so its holes need opening up.
- The library is cross-checked against `pcb.py`'s body sizes. Where they disagree, the difference
  is reported to the owner rather than silently fixed in either place.

**Where it lives:** in Bench's repo for now (`library/`, MIT). The future Parts app (inventory)
reads the same files and adds "how many I have, and where" on top. If it later needs its own repo,
the format moves unchanged.

## 5. The board view (3D)

**Screen**
- A **Board** tab sits next to the sheet tabs.
- The **schematic stays in the background**, dimmed. That's the existing sheet viewer (SFE-01 by
  default), so it's searchable and can be ringed.
- The **3D board floats over it** on a transparent canvas.
- The **part card** sits in a side panel on PC and tablet, and in a bottom sheet on a phone.

**The 3D scene**
- The perfboard has its holes and copper pads.
- Parts are built from their library package: cylinders, boxes and legs at the right holes,
  heights and colours. A standing resistor puts its body over the `body` pin, as sheet 4 does, and
  the module sits on its foam pad with its outline kept clear.
- The solder side holds the bare-wire buses (coloured by net, as sheet 4 does), the insulated links,
  the bridges and the underside parts.
- **Flip** (`f`) turns the board over to the solder side, as the 2D flip does.

**Pressing a part**
- The part lifts slightly and glows, its holes light up on the board, and the same part is
  **ringed on the schematic behind**.
- The card shows:
  - **What:** value and library part, and a "typical size" badge if it isn't verified.
  - **Where:** the holes ("28,16 → 28,17"), the side and the orientation.
  - **Why:** its role.
  - The polarity warning, and which build step it belongs to.
  - **Datasheet:** one button that opens the datasheet. It uses a local file if the project has one
    (`"datasheetFile": "docs/datasheets/1N5402G.pdf"`, opened from the project folder, and shown
    inside Bench once 1.2 reads PDFs), and otherwise the library's link to the manufacturer's page.
    Bench links to datasheets rather than copying them into its own repo: manufacturers' copyright
    usually allows linking but not redistribution, and a maker keeping their own copy in their
    project is their choice.
  - **Pinout:** for parts whose pins matter (Q1, U2, the headers), a small labelled drawing of the
    pins seen from above, matching how the part sits on this board.

**Follow along (step mode)**
- The `build` steps run in order, for example "Step 4 of 6: the DIP socket, notch LEFT".
- Earlier steps show solid, the current step is highlighted, and later steps are ghosted.
- Next and Back work with the space bar, buttons and a foot pedal. Each step ties into the build
  checklist's ticks from 0.2.

**As text too:** the same steps and parts appear as an ordered list beside the 3D view. It's
readable, printable and searchable, and it's what a screen reader uses.

## 6. Making it yours: moving parts

- **Drag a part:** it snaps from hole to hole, keeping its pins together. `R` (or a button) turns
  it in 90° steps.
- **Wires:** add a link (click a hole, then another) or remove one. Buses and bridges can be edited
  the same way.
- **Live check:** `board-check.js` is a port of `pcb.py`'s `check()`, with no page code. It runs:
  - the electrical check: every connection complete, no two connections touching, spare chip pins
    tied to nothing;
  - the physical checks P1–P8: one leg per hole, no leg under another part, no bodies overlapping,
    real lead spans, underside parts on a joint or bus, bridges between neighbours only, no link
    across another connection's joint, everything inside the board.

  Problems show at once, in plain words, on the part and in a list ("R6's leg lands in the hole C4
  uses"). A part stays red while it breaks a rule.
- **Suggested routes, always with options.** When a connection is open (after moving a part, or
  for a new link), **Suggest routes** offers about three alternative wire paths to pick from, each
  drawn as a preview with a one-line reason: "shortest, 2 bends", "fewest crossings over the bare
  buses", "stays clear of the socket". They're found on the hole grid (A*, half-hole bends as in
  `board.py`) under the same rules the checker enforces, so a suggestion never crosses another
  connection's joint. Picking one adds it as a normal link, and it can still be dragged afterwards.
- **Off-board cables** (fans, panel, LCD, power) get the same treatment in a later release: suggested
  routes and lengths through the case, once 2.0 knows the case from Shape.
- **Undo and redo** for every change.
- **Saving never touches the project's own layout.** Changes are saved as *the maker's version* in
  the browser (per project and revision). They can be exported as their own `forge-project.json`,
  with a **list of what changed** against the original ("R6 moved one hole down; link 23 added").
- **Kept in step with `pcb.py`:** `export_board.py --tests` exports the fume extractor's board and
  `test_checker.py`'s eight broken boards as JSON. Bench's checker must pass the real board and
  catch all eight, under the same rule. The Python stays the reference in the fume repo.
- **Later:** an importer that turns an exported version back into `board.py`, for the owner's own
  layout changes.

## 6a. Working well: many options, easy to use, nothing lost

These rules apply to every screen, starting with 0.2:
- **Every change can be undone and redone** (`Ctrl+Z` / `Ctrl+Y`, plus buttons). That covers
  ticks, notes, moved parts, flips and settings, with a history you can step back through.
- **Work saves itself** in the browser as you go, per project and revision. **Save as file** and
  **Open file** exist everywhere, so work moves between devices or into the repo. A small "Saved"
  mark shows it happened.
- **Versions:** a maker can keep several named versions of their board ("as drawn", "my build",
  "with a bigger C1") and switch between them.
- **Options with good defaults:** the common choice is one click, and more choices sit one step away
  in a clearly labelled panel. Every suggestion (routes, part swaps, build order) comes with
  alternatives to pick from.

## 7. The UI: one family with Maker Forge, a bench accent from the website

Every app in the suite should feel like the same family. Maker Forge already has a finished app UI,
so Bench takes its system, and takes its accent colour from the website.

- **Same tokens and switches as Maker Forge:**
  - colours `--bg --panel --panel2 --ink --muted --line --accent --accent-ink --accent-soft
    --stage-top --stage-bot --field --danger --warn --good`, plus `--r` and `--shadow`;
  - on `<html>`: `data-theme="light|dark"`, `data-contrast="high"`, `data-font="clear"` (Atkinson
    Hyperlegible) and `data-motion="reduce"`;
  - the same words in the Easy reading settings as Maker Forge's.
- **Bench's accent is solder gold**, the website's ENIG pad colour (`#d4a54a`, lighter in dark
  mode), on Maker Forge's neutral panels. Shape keeps its teal. **Dark is the default at the bench.**
- **Controls:** Maker Forge's segmented buttons, top tabs, panels and focus rings, with touch
  targets of at least 44 px.
- **Fonts:** Atkinson Hyperlegible 400/700, copied from Maker Forge's `fonts/` with its OFL licence
  and served by Bench itself. The CSP gains `font-src 'self'`.
- **3D:** the same stack as Maker Forge: **three.js r128**, a renderer with a transparent
  background, OrbitControls and Raycaster picking, and the same stage colours and lights, so a
  board in Bench and a case in Shape look alike. That makes 2.0's board-to-box easy.
  - Unlike Maker Forge, it's self-hosted as ES modules (`src/vendor/three-r128/`, MIT licence kept,
    with a hash noted) and loaded from no CDN, so Bench keeps `script-src 'self'`.
- **Not copied:** Maker Forge's one-file build with inline scripts. Bench keeps its strict rules.
- **Improvements go both ways.** When Bench builds a 3D or UI piece that Shape could use (part
  picking that lifts and glows, the undo history, step mode, the datasheet button, a faster way to
  draw many small parts), it's written so it can move into Maker Forge. That change is made in
  Maker Forge's own repo by its own Claude session, never from Bench's.
- **The website's full PCB look** (purple board, cut corners) stays on the website: Bench's
  Workbench entry and the project pages use it. Inside the app, the Maker Forge family look wins.

## 8. Security

- Project files and makers' versions from visitors are **untrusted data**:
  - they're parsed as JSON and checked for types and limits (at most 200 × 200 holes, 2,000 parts
    and 100 pins a part, with string lengths capped);
  - text is only ever shown with `textContent`.
- Library files ship with Bench, but they're checked the same way.
- If WebGL isn't available, Bench says so and shows the 2D layout sheet and the text list instead.

## 9. Testing

- **Fume repo (Python):** `export_board.py` round-trip. Every part, pin, bus, link, bridge and net
  in `board.py` must appear in the board section. `check.sh` runs it.
- **Unit (Node):**
  - `board-check.js` passes the fume board and catches the 8 broken boards, under the same rule
    as `pcb.py`;
  - the library files are checked: every number has a source and a basis;
  - project-file limits, and the "what changed" list.
- **Browser (Edge or Chrome, headless WebGL):**
  - the board view draws the fume board;
  - pressing R6 (found from its 3D position) shows its card with the role from the project file;
  - step mode ghosts later steps;
  - dragging R6 down one hole makes the checker name the broken connection; undo restores it;
  - export holds the change and the change list;
  - there's no sideways scrolling at 375 px, and no console errors or CSP violations.
- **By hand:** the owner's real board against the 3D view, part by part.

## 10. Releases (roadmap change)

| Release | What |
|---|---|
| **0.2 Know your parts** (as planned) | The project file (reading the fume extractor's new `forge-project.json`), part cards with the **datasheet button**, the same part on every sheet, the build checklist, Ask Claude. **Plus the UI family refresh** (Maker Forge's tokens and themes, Easy reading, fonts, the gold accent) and the **undo, autosave and save-as-file rules** (section 6a). |
| **0.3 Board view** | `export_board.py` and the `build` section in the fume repo, parts library v1 (the fume extractor's packages and parts, verified against datasheets), the 3D board with the schematic behind, part cards with where, why and pinout, step mode, and the text list. |
| **0.4 Make it yours** | Drag and turn parts, add and remove links, **suggested routes with options**, the live checker kept in step with `pcb.py`, named versions saved and exported with a change list. |
| **0.5 Everywhere** (was 0.3) | Phone and tablet, GitHub repos, built-in examples, your own Claude key. |
| **1.0 Launch** | As planned. |

## 11. Risks

| Risk | Plan |
|---|---|
| Older phones without WebGL | The 2D sheet and the text list always work |
| Checker drift between Python and JS | The parity tests (section 6) fail if they drift |
| Getting every dimension right takes time | Unverified sizes are labelled "typical size"; verification is a 0.3 task, part by part |
| The editor (0.4) is the biggest step | It's its own release, so the follow-along view (0.3) ships first |
| three.js r128 is from 2021 | It matches Maker Forge for the suite. Upgrading both apps together is a later, separate step |

## 12. Decisions for the owner

1. **The board view and its editor inside Bench**, with the perfboard part of the Layout app folding
   in. (Recommended.)
2. **UI direction:** the Maker Forge family with the website's gold accent (recommended), or the
   website's full PCB look inside the app too.
3. **The parts library** in Bench's repo for now (recommended), or its own repo from the start.
4. ~~The fume repo commit~~ **Settled 2026-11-12:** the owner said to commit and push from now on,
   so `forge-project.json` and its changelog line are pushed.
