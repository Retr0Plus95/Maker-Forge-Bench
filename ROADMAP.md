# Maker Forge Bench roadmap

*Written 2026-11-12, with names, hosting and future apps updated the same day. Rewritten on
2026-11-14 with the plan to build around KiCad: real 3D parts, a shared parts library, and one
design app for schematics and boards. A plan, not a promise: each release gets its own pull request
and can be reordered. The design for release 1 is in
`docs/design/2026-11-12-maker-forge-bench-design.md`.*

**Names:** **Maker Forge** is the suite and its home page. This app is **Maker Forge Bench**
("Bench"). **Shape** is today's Maker Forge 3D app, which takes the name Maker Forge Shape at 2.0.
Every app is "Maker Forge" plus one plain word for what it does.

Ideas marked **★ New** were added while writing this roadmap. The others came from the design chat.

## What stays true in every release

- **Free and MIT, no account.** Nothing that works today moves behind a login or a price.
- **Your files stay on your device.** Nothing is uploaded and nothing tracks you. Other websites are
  only contacted when you ask (a GitHub link, your own Claude key).
- **Safe with anyone's drawings.** Every file is cleaned before it's shown.
- **Works at the bench.** Big touch targets, readable at arm's length, Easy reading, phone and tablet.
- **Plain words.** Every release updates the manual and says what it fixed.

## Where this is going (agreed 2026-11-14)

The goal: the suite ends up able to design a whole board from scratch, then build it, test it and
fit it in its case, with many of the features people know from KiCad and SolidWorks. It's built
**around KiCad, not as a copy of it.** KiCad is free and very good at copper boards, so the suite
reads and writes KiCad's files, and owns what KiCad doesn't do: perfboard and stripboard, the parts
you have, building step by step, testing, and the board in its box.

- **One shared parts library, the Maker Forge Library,** used by every app (see "The apps in the
  suite"). Each part has its symbol, footprint, 3D model, pins, datasheet and a how-to page.
- **One design app, Maker Forge Circuit,** with two workspaces: Schematic and Board. Perfboard and
  stripboard first, copper boards later. It saves `forge-project.json`, which Bench builds from.
  (Circuit and Layout were two ideas; they're one app now, the way KiCad keeps the schematic and
  the board in one project.)
- **Copper boards go through KiCad first.** Bench can import KiCad projects (1.2, an option for
  people who design in KiCad), and Circuit writes KiCad files so KiCad can make the factory files.
  You never have to open KiCad yourself. The suite's own copper editor and factory files come
  last.

**Taken from KiCad:** the schematic with its electrical rules check (ERC); the board with its
ratsnest (the lines that show what still needs joining) and design rules check (DRC); a symbol,
footprint and 3D model linked for every part; cross-probing (pick a part in one view and it lights
in the other); the parts list (BOM) and netlist; factory files (Gerbers, drill, placement), first by
writing KiCad files and later our own; and a circuit simulator (KiCad's own ngspice, built into
Circuit later).

**Taken from SolidWorks:** assemblies (the board in its case), clash checks, exploded views, 2D
drawings, variants (the same board with different parts fitted), standard hardware (screws,
standoffs, nuts). From SolidWorks Electrical: the wiring harness, wire numbers and wires routed in
3D. And a light viewer anyone can open, like eDrawings, which is what Bench already is.

### The order from here
1. **Bench 0.9 Real parts:** the shared library's first version, KiCad's 3D models and a better 3D
   view, all working on the website with nothing running on your computer.
2. **Bench 1.0 Launch.**
3. **Maker Forge Circuit:** schematic, then a perfboard or stripboard board, then KiCad files and a
   factory pack, then simulation built in.
4. **The board in its box, with Shape (2.0):** assemblies, clash checks, and the wiring off the
   board.
5. **Maker Forge Parts, last:** browse the parts you have, a shopping list to print, and finding
   parts online. (Moved last by the owner on 2026-11-14. The shared library itself starts in Bench
   0.9, so the other apps don't wait for it.)

**Long term:** Circuit's own copper board editor and its own factory files.

Bench's own tools (1.1 to 1.4) and the smaller apps (Calc, Pins, Serial, Labels) come as smaller
releases between these, when a build needs them.

## The stages

| Stage | Releases | What it is for |
|---|---|---|
| Build the viewer | 0.1 to 1.0 | The soldering viewer, finished and published |
| Bench tools | 1.1 to 1.4 | Calculators on part cards, more file types, guided building, testing and fault-finding |
| The Maker Forge suite | 2.0 and on | The home page, Bench, Shape and the website working as one project |
| More apps | any time | Learn and plan, design, build, test, share: see "The apps in the suite". Circuit comes first, Parts last |

---

## Stage 1: build the viewer (0.1 to 1.0)

### 0.1 First look (PC, inside the Claude app) — done 2026-11-12
- **Checked (2026-11-12):** KiCad 9 SVG exports draw text as lines, but also keep every label as
  invisible text in the same place, so Find part works on them and PDF stays in 1.2 (design §11).
- Open a folder through `dev.py`, with auto-refresh.
- SVG cleaner with its nasty-file tests.
- Sheet tabs, zoom and pan with mouse and keys, fit to screen.
- Find part across all sheets.
- Flip a layout sheet to the solder side.
- Tested on: the fume extractor's five sheets.

### 0.2 Know your parts — done 2026-11-12
- The project file v1 (`forge-project.json`), plus guessing parts when there is no project file.
- Part cards with polarity warnings, and **★ New: a datasheet button** (the project's own PDF or the
  maker's page).
- The same part highlighted on every sheet, and two sheets side by side.
- Build checklist, saved per project and revision, with export and import.
- Ask Claude: in the Claude app (Claude reads your selection), Copy for Claude, open claude.ai.
- **★ New: Maker Forge's family look** with Easy reading (themes, high contrast, clear font, text size,
  less motion), and **undo and redo for every change**.
- The fume extractor repo gets its `forge-project.json`.

### 0.3 Board view — done 2026-11-12
- The fume extractor's `forge-project.json` gains its board and build steps, generated from
  `board.py` and `build_steps.py` by `export_board.py` (its `check.sh` runs it).
- Part cards: **what each pin connects to**, the holes on sheet 4, standing and underside parts, the
  build step.
- **Build steps** one at a time, with why and the parts ringed; Space to go on; tick all in a step.
- **The 3D board** over the dimmed schematic: click a part, step highlighting, top and underside.
- Still to come from the board-view design: the parts library with verified sizes, pinout drawings,
  and the owner's own placement in `board.py`.

### 0.4 Your board — done 2026-11-13
Asked for while building the fume extractor on a board laid out by hand (design
`docs/design/2026-11-13-your-board-design.md`):
- **What to wire:** every connection, one group per line, each leg ticked as it's soldered.
- **Chip pins:** chips and headers drawn pin by pin, from the top or underneath.
- **Your board, from your photos:** two taps line a photo up; the chip's pins are marked wired or
  not; parts are placed by tapping their holes and show on the top and underside photos alike.
- **30 improvements:**
  - Find by line and value, a "Show" for each line, and the wiring list as text and in print.
  - Checklist: a filter, a polarity badge, and names that open the card.
  - Your notes on parts, and "next part in this step".
  - Step progress, "Show in 3D", and checks before power.
  - 3D: lit holes, the part lifting, a wiring toggle, double-click to focus, keys, merged links and
    the camera remembered.
  - Help on `?`, number keys for sheets, a zoom badge, the last sheet remembered, "updated HH:MM",
    "Brighter" photos, and clearer errors.

### 0.4.1 Basics — done 2026-11-13
The owner asked for "any basic missing feature along the way":
- Panel sections fold away, the side panel hides (`p`), Full screen, and Keep screen on.
- Turn a photo (`r`); its marks turn with it.
- Shopping list (copy or CSV), Start over (asks twice, undoable), and `s` to mark the open part soldered.
- Take a part off your board, and open or close every wiring line at once.
- A theme that follows the system, and shortcut keys in the button tooltips.

### 0.5 Make it yours — done 2026-11-13
Asked for as "50 basic and medium improvements and 10 big ones", with the 3D "much better: more
accurate models, easier to use and much more functions" (design `docs/design/2026-11-13-release-0.5-design.md`).
- **The 10 big ones:**
  - B1 move parts by dragging on your photo;
  - B2 Check my board;
  - B3 suggested wires;
  - B4 your board in 3D;
  - B5 the parts library;
  - B6 the guided continuity test;
  - B7 datasheet-accurate 3D models;
  - B8 the 3D look and controls (view cube, smooth camera, hover);
  - B9 3D tools (explode, X-ray, cut-away, measure, step playback, PNG and STL);
  - B10 history (build log, named versions).
- **50 improvements, plus touch and a command palette:**
  - links to parts;
  - colour bands and capacitor codes;
  - calculators, shopping and report extras;
  - checklist and wiring filters;
  - compact mode, a resizable panel, "what's new" and Try again.
- Still to come: a JS port of pcb.py's full checks, and verified sizes for every library part.

### 0.6 Where it goes — done 2026-11-13
- Hole names like your board's, from what's printed by three chip pins, shown on cards, checks,
  wires, the continuity test, a photo hover tip and the 3D board's edges.
- Suggest a spot: the part's shape four ways round, scored by wire length and neighbours, best
  three shown dashed.
- Underside parts soldered onto their own line's legs are no longer called clashes.
- Save my board as a file, open a board file.
- Design: `docs/design/2026-11-13-release-0.6-design.md`.

### 0.7 Everywhere — done 2026-11-13
Open a project from anywhere and use Bench on a phone, ready for the website.
Design: `docs/design/2026-11-13-release-0.7-design.md`.
- Open a public GitHub repo by pasting its link (one call to GitHub for the file list, the files
  from raw.githubusercontent.com), or a folder picked in the browser. `dev.py` also runs without
  a folder, and then shows the start screen.
- **★ Links straight to a part.**
  `forge.retr0plus.se/bench/?repo=Retr0Plus95/Solder-Fume-Extractor&sheet=SFE-04&part=R6`
  opens right at R6, and Copy link keeps the repo. A repo link wins, even under `dev.py`.
- **★ Built-in examples** on the start screen, like Shape's *Start from*: the fume extractor (the
  RGB Lamp Controller joins once it has drawings).
- Phone and tablet layouts: a Menu that folds the tools, the sheets as a sideways strip, a
  bottom-sheet panel with a handle (tap or swipe), no sideways scrolling. Tested at 375 × 812 with
  touch.
- Your own Claude key (or Ollama on this computer), the same way Shape does it: AI help in Easy
  reading, and Ask here in the part card.
- (Keep screen on arrived in 0.4.1; pinch and two-finger pan in 0.5.)

### 0.8 True to life — done 2026-11-14
Truer 3D parts, your parts as you fitted them, and an easier screen.
Design: `docs/design/2026-11-13-release-0.8-design.md`.
- **3D parts drawn to their datasheets:** a new turned (lathe) shape for resistors, capacitors,
  diodes and LEDs (with the LED's flat side by its cathode); the real PDIP leg with its shoulder;
  TO-220 with its tab and hole; header strips; crystal flanges; the electrolytic's vents, stripe
  and printed value.
- **Looks like** on each part card: the colour, size, mount, socket or header you really fitted,
  or another part in its place (an L7805 for the MP1584 buck module, drawn wired to the module's
  holes, with a plain warning about the heat). Kept with your progress and undoable.
- **The panel in tabs:** Guide · Board · Wiring · Checks · Parts, each with its count, the part
  card on top of every tab, and **All** for every section in one list as before.
- **The guide:** one step at a time in bigger words, a progress bar, each part with its value and
  where it goes (your hole names when they're on) and a tick, and a big **Done, next step**.
- **Adjust the steps:** move a step, skip one, add your own, or go back to the project's steps.
- **A compact header:** Calculators, Keep screen on and Full screen wait in the Menu on every
  screen; on a computer the Menu also has Save progress, Shopping list, Build log, Versions and
  Keyboard shortcuts. (The Compact density in Easy reading arrived in 0.4.1; it now tightens the
  tabs and the guide too.)
- **★ New, along the way:** the build checklist's part names and the step list are plain text
  again, and the panel's main buttons (Ask here, Use this spot, Beeped) stand out again: a panel
  style had overridden them all.

### 0.9 Real parts
Real 3D parts from KiCad's free library and a better 3D view. It all works on the website, with
nothing running on your computer. Design: `docs/design/2026-11-14-release-0.9-design.md`.
- **The Maker Forge Library, first version:** one list of parts that every app will share. Each
  part has its pins, its footprint (the hole spacing), its 3D model, and where it came from with its
  licence. Symbols and how-to pages join it with Parts and Circuit. It starts inside Bench and
  moves to its own home once Circuit needs it.
- **About 150 common through-hole parts in true 3D,** converted once from KiCad's library and
  shipped with Bench, with KiCad's credit: resistors, capacitors, diodes, LEDs, transistors,
  regulators, chips and sockets, headers, screw terminals, crystals, pots, buttons and connectors.
  Bench still paints its own colour bands, values and stripes on them. Looks like gets a model
  picker, and you can use your own `.glb` model for a part, kept on your device.
- **A better 3D view:** truer light and materials, board colours, solder joints, polarity marks,
  the camera following the guide, find a part in 3D, saved views, a height check for the case,
  Check my board shown in 3D, export to GLB and OBJ, a turntable video, and a loading bar.
- *(Opening KiCad projects was planned here too, and moved to 1.2 as an option the same day.)*

### 1.0 Launch
- Security review of the cleaner and the browser rules. Real-phone and real-tablet test. User
  manual inside the app.
- Live at `forge.retr0plus.se/bench/`, listed on the Workbench page (work done in the website repo).
- **★ New: "Report a problem with this drawing."** Opens a new GitHub issue on the project's repo,
  with the sheet and part already filled in. Builders who spot a mistake can tell you in one click.

---

## Stage 2: bench tools (1.1 to 1.4)

### 1.1 Calculators on the part cards
The calculators themselves are their own app, **Maker Forge Calc** (see "The apps in the suite"),
because they're useful without any project. Bench and Calc share one small formulas file, so their
answers always match. Bench adds the calculations that belong to a part:
- **★ New: Resistor colour bands on every resistor's part card** ("10 k = brown, black, orange"),
  so you can pick the right one out of the bag.
- **Hot-part warning** on a part card when the project file gives the voltage or current: "0.6 W in
  a ¼ W resistor".
- **★ New: Power budget:** adds up what every part in the project draws, and checks the regulator,
  fuse and battery against it.
- **★ New: "How this part works"** on every part card, opening the right page of the Parts library.
- **Open in Calc**, with the part's values already filled in.

### 1.2 More files, and offline
- **PDF**, with its text searchable. KiCad's PDF exports keep text, which fixes the KiCad risk for good.
- **★ Import a KiCad project** (an option for people who design in KiCad; decided 2026-11-14;
  design `docs/design/2026-11-14-kicad-import-design.md`):
  - Bench reads KiCad's files itself, in the browser: part cards, connections, a 3D board with real
    parts, and build steps made for you.
  - **GitHub runs KiCad for you:** add one ready-made file to the repo, and on every push GitHub's
    computers make the exact sheets, the exact 3D board, KiCad's error checks and factory files.
    Bench on the website picks them up. Nothing runs on your computer.
  - KiCad's error checks in plain words, with **Show me**, **Ask AI how to fix** and **Ignore**.
  - **Factory files:** one zip of the Gerbers, drill files, parts list and placement file, ready to
    upload to a board maker.
  - Or Bench on your computer (`dev.py`) with KiCad installed does the same, for folders that
    aren't on GitHub.
- **Install on phone and tablet**, and work with no internet at the bench.
- **One-file download**, like Shape's releases.
- **★ New: Print the checklist and wire list** on paper, with tick boxes, for builders who prefer it.

### 1.3 Guided building
- **Step-by-step mode:** goes through the build order (bare-wire buses → links → bridges → parts →
  chip), zooming to one item at a time: "Link 18: 24,10 → 28,12 (PWMCTL)". Space bar or a big
  button for the next one. **★ New: works with a cheap Bluetooth page-turner or foot pedal**, so
  your hands stay on the iron.
- **Hole finder:** type `28,12` and a crosshair lands on that hole, with its row and column lit.
- **★ New: Pre-power checklist**, built from the project's polarized parts: "D1 band to +12 V row?
  C1A/C1B stripes to 0 V? Q1 flat face down? U2 notch left?" This turns the BEFORE FIRST
  POWER-UP box on your sheet 4 into something you tick, and it works for any project.
- Wire-list rows in the build checklist, not just parts.
- **★ New: Notes and photos on a part:** "R4's legs were bent, check the joint", kept with your
  progress.
- Optional: say "next" or "where is R6" out loud (where the browser supports speech).

### 1.4 Test and find faults
- **Highlight a connection:** click +5 V or a pin, and every hole and wire on that connection
  lights up, ready for continuity checks with your meter. This needs connection data: a KiCad
  project (1.2 reads its connections), or `board.py` for the fume extractor.
- **★ New: Measurement log with expected values.** Bring-up checks come from the project file
  ("U1 output: 5.00 V ± 0.05"). Type what your meter shows, and anything out of range turns red.
  The log can go along with a question to Claude. Later, Maker Forge Serial can fill in readings
  straight from the board.
- **Photo check:** add a photo of your board, and Claude compares it with the layout, pointing out a
  missing link or a backwards diode.
- **★ New: Revision compare, with ticks that know what changed.** Load two versions of a project
  (two commits on GitHub, such as Rev C and Rev D) and see exactly what moved. Any part you already
  soldered that the new revision changed gets flagged: "R4 moved two holes since you soldered it."
  This is what makes changing drawings on the fly *while you build* safe.

---

## Stage 3: the Maker Forge suite (2.0 and on)

The SolidWorks idea: separate apps, with one project file and one address between them. Each item
needs work in the other app's own repo and Claude session.

### 2.0 The home, and board to box
- **The Maker Forge home at forge.retr0plus.se.** This is the assembly: open a project and see every
  piece of it (drawings and build progress from Bench, the case from Shape, and later the parts),
  each with a button that opens it in its app.
- **★ New: What's next, across every app:** "3 parts left to solder, the case lid isn't printed yet."
- **Today's Maker Forge becomes Maker Forge Shape**, at `forge.retr0plus.se/shape/`. That's work in
  Maker Forge's own repo and session, plus the website's `forge-update`. Old links are redirected.
- **★ New: One Claude key for the whole suite.** The apps share an address, so a visitor enters it
  once.
- **Bench → Shape:** the project file's `board` section (board outline, mounting holes, where the
  fans, LCD, pot and connectors sit) opens in Shape's project-box maker. Change the board, and the
  box can follow. This is the link SolidWorks users pay extra for.
- **Shape → Bench:** the box's printed parts appear in the project, so the build checklist can
  include "fit the board on its standoffs".
- **★ New (2026-11-14): The board in its box, the SolidWorks way.** The board with its real 3D
  parts sits in the case as one assembly: a clash check ("C1 hits the lid by 2 mm"), an exploded
  view, and standard screws, standoffs and nuts from the Maker Forge Library.
- **★ New (2026-11-14): The wiring off the board.** Each wire from the board to the fans, the LCD,
  the pot and the sockets, with its colour, thickness, length (measured in the case), the connector
  pins at each end and a wire number, routed in 3D. Labels prints the wire tags.

### 2.1 Publish
- **★ New: Project page from the project file.** retr0plus.se builds a project's page (drawings,
  parts list, downloads) from its `forge-project.json`, with an **Open in Maker Forge Bench** button.
- **★ New: Build log export.** Your checklist history, notes and measurements become a build-log
  entry on the website's Logs or Journal page. Once Maker Forge Journal exists, this goes through it.

---

## The apps in the suite

**The test for a new app:** it has to be useful on its own, without the other apps. If it isn't, it
becomes a feature of an app that already exists.

The apps follow a project from first idea to finished build, the way SolidWorks has a workspace for
each job:

| Part of a project | App | What it does | Status |
|---|---|---|---|
| **Learn and plan** | **Parts** | Browse every part in 3D and the ones you have, what to buy, and where to find it online | Planned, last |
| | **Calc** | Electronics calculators | Idea |
| | **Pins** | Plan a microcontroller's pins | Idea |
| **Design** | **Circuit** | Draw the circuit, simulate it and lay out the board: perfboard and stripboard first, copper later | Planned, after Bench 1.0 |
| | **Shape** | 3D-printed cases and parts | Exists (today's Maker Forge) |
| **Build** | **Bench** | Read the drawings and build the board | This repo |
| | **Labels** | Labels for bins, wires and front panels | Idea |
| **Test** | **Serial** | Talk to the board and graph what it says | Idea |
| **Share** | **Journal** | A build notebook, published to retr0plus.se | Idea |
| | **Live** | A stream page for OBS | Idea |
| **The whole project** | **Maker Forge** (home) | The assembly: every piece of one project | Planned for 2.0 |

**The Maker Forge Library ★ New (2026-11-14)** isn't an app: it's one set of parts that Bench,
Parts, Circuit and Shape all read. Each part has a symbol (for Circuit), a footprint (holes and
pads), a 3D model, its pins, a datasheet link and a how-to page. Where the parts come from:
- **KiCad's libraries,** free to share with a credit (CC-BY-SA 4.0, with an exception that leaves
  your own designs yours);
- **mechanical hardware** we draw ourselves: screws, standoffs, nuts and washers;
- **Fritzing's parts,** once their licence is checked;
- **your own STEP, WRL or GLB files,** which stay on your device.

It starts inside Bench in 0.9 and moves to its own home once Circuit needs it.

Copper boards go through KiCad first: Circuit writes KiCad files, and Bench opens KiCad projects.
Circuit's own copper editor comes last (see "The order from here").

**Considered, and kept as features instead:** the power budget (Bench 1.1, using Calc's formulas),
project cost (the home page, once Parts knows prices), front panels (Labels and Shape together),
off-board wiring (the board in its box, 2.0), reading circuits (Bench is the reader) and Layout
(now Circuit's Board workspace).

### Learn and plan

#### Maker Forge Parts: know your components
Two halves that work alone or together.

**★ New: The library, or how to use each component.** One page for each kind of part, in plain
words, starting with the ones a hobbyist meets first: resistors, capacitors (ceramic and
electrolytic), diodes, LEDs, Zener diodes, transistors (NPN and PNP), MOSFETs, voltage regulators,
potentiometers, switches and buttons, relays, fuses, crystals, chips and sockets, connectors, fans
and motors, buzzers and displays. Each page covers:
- what it does, and a typical circuit it's used in;
- how to recognise it and read its value or markings;
- which way round it goes;
- how to test it with a multimeter;
- common mistakes ("an LED with no resistor");
- the calculator in Calc that goes with it.

Where the same part comes with different pin orders (some small transistors do), the page says so
and points to the exact part's datasheet.

**★ New (2026-11-14): The library in 3D.** Browse every part in the Maker Forge Library: turn its 3D
model, measure it, see its footprint and pins, and open its datasheet and how-to page. It's the same
library Bench and Circuit use, so a part you look at here is the part they draw.

**★ New: Identify a part from a photo.** Photograph a resistor's bands or a chip's markings, and
Claude (with your own key) reads the value or part number and opens its page. It's shown as a
guess for you to check.

**My parts, or what you have on hand.** *(This was "2.3 Parts inventory".)*
- A list of the parts you own and which bin each is in. The fume extractor notes already track
  "1N4007 and 1N4002 on hand".
- A project's parts list then shows **"have 3 × 1N5402G, need 1"**, and what's missing becomes a
  shopping list.
- **★ New (2026-11-14): Browse what you have.** Search and filter your parts by kind, value,
  package or bin, each with its 3D model and a photo if you add one, how many are left, and a
  warning when one runs low.
- **★ New (2026-11-14): Add parts quickly:** type them, scan the barcode or QR code on the bag with
  a phone's camera, or bring in an order file from the shop (LCSC, Mouser, DigiKey and AliExpress
  orders can all be saved as CSV).
- **★ New (2026-11-14): Start a project from what you have.** Pick parts from your bins, and they go
  to Circuit, which can suggest a layout from them.

**★ New (2026-11-14): What to buy, and where.**
- **One shopping list:** what your projects need and you don't have, what's running low, and
  anything you add yourself. Grouped by shop, with how many to buy.
- **Print it** with tick boxes for the shop counter, copy it, or save it as CSV, including the
  parts-list file a shop's upload page takes (LCSC, Mouser and DigiKey all accept one). Bench's
  own shopping list (0.4.1) hands over to this once Parts exists.
- **Find it online:** a **Find online** button on any part opens the search page of the shops you
  pick (big distributors such as LCSC, Mouser, DigiKey and Farnell, your local hobby shop,
  AliExpress, eBay) with the value or part number already filled in. These are plain links:
  nothing is sent anywhere until you click.
- **Later: prices and stock in the list,** fetched with your own free key from a shop or a parts
  search service (Mouser, DigiKey, Octopart), the way your own Claude key works, and only when you
  ask. *Check first:* which of them answer a browser directly. For any that don't, a small helper
  on your computer (like Bench's `dev.py`) does the looking up.
- **Later: find a replacement.** AI (your Claude key or Ollama) suggests parts that could stand in
  for one you can't get, shown as a guess to check against the datasheets.
- **★ New: Filament too:** spools, colours and how much is left, so the 3D-printing side uses it
  as well.

**Connects:** Bench's part cards open the library page and show have and need. Labels prints the bin
labels. Shape says how much filament a print takes.

**Order:** Parts is the last app in "The order from here". Within it: browsing the library and
your parts first, then the shopping list with printing and Find online, then prices and stock.

#### Maker Forge Calc: electronics calculators
*(These were planned as Bench 1.1. They're useful without any project, so they're an app of their
own, and Bench uses them.)*

Each one shows its working in plain words, not just the answer.
- **Resistor colour code**, both ways: bands → value and value → bands.
- **Ohm's law and power.** It warns when a resistor would run hot ("0.6 W in a ¼ W resistor").
- **LED series resistor:** supply, LED colour and current → resistor and its wattage.
- **Voltage divider**, both ways, with the nearest standard values (E12/E24).
- **★ New: Capacitor code reader:** `104` → 100 nF, `22p`, `4n7`, and the voltage letters.
- **Fuse and wire size:** current → fuse rating and wire thickness. Your fume extractor's 1 A / 2 A
  fuse question is exactly this.
- **★ New: Battery life:** capacity and current draw → hours. Shape already has this for boxes, so
  share the formula.
- **★ New: RC timing and the 555 timer:** resistor and capacitor → delay or frequency, and back.
- **★ New: Unit converter** for the ones that trip people up: mA and A, µF, nF and pF, kΩ and MΩ.
- **Links that open a calculator already filled in**, such as
  `forge.retr0plus.se/calc/led?supply=12&color=red`. Bench, Parts and the library pages use them.

#### Maker Forge Pins: plan the microcontroller's pins ★ New
- Pick a chip (ATmega328P, ESP32 and Raspberry Pi Pico to start), give each pin a job, and it warns
  about clashes: two jobs on one pin, PWM on a pin that can't do it, or a pin the chip needs at
  start-up (the ESP32's strapping pins).
- Writes the pin list for the firmware (the `#define` lines) and a pin table for the drawings, so
  the code and the schematic agree.
- **Connects:** U2's part card in Bench shows the pin table. Serial labels its graphs with pin names.
  Circuit draws the chip with its pins already named.
- **Useful on its own** because you plan the pins before any drawing exists.

### Design

#### Maker Forge Circuit: draw the circuit and lay out the board ★ New
*(Circuit and Layout were two ideas until 2026-11-14. They're one app now, with two workspaces on
one project, the way KiCad keeps its schematic and board editors together.)*

- **Schematic:** draw the circuit with parts from the Maker Forge Library. Wires snap into place,
  and it points out mistakes as you draw (its electrical rules check): an LED with no resistor, a
  pin connected to nothing, two outputs wired together, a chip with no power.
- **Board:** perfboard and stripboard first, which is what `board.py`, `pcb.py` and `render.py` do
  for the fume extractor, as an app for any project. Place parts on the grid, follow the ratsnest
  (lines showing what still needs joining), draw links and wires, and mark stripboard track cuts.
  It checks as you go (its design rules check): a missing connection, a short, two legs in one
  hole. Copper boards come later.
- **Cross-probing:** pick a part or a connection in one workspace and it lights up in the other,
  and in Bench.
- **★ Suggest a layout.** Circuit places the schematic's parts (scored like Bench 0.6's Suggest a
  spot), and AI (your Claude key or Ollama) explains the layout and gives tips. It's a suggestion
  you move around and keep. Once Parts exists, it can start from the parts in your bins.
- **★ New (2026-11-14): Simulate it, built in (a later step).** A **Simulate** button runs the
  circuit in ngspice, the free simulator KiCad uses, running in the browser:
  - the voltage at every point and the current through every part, shown right on the schematic;
  - an LED lit or not, and a part running hot flagged (with Calc's formulas);
  - a graph over time, like an oscilloscope: a 555 blinking, a capacitor charging, a PWM signal;
  - **live:** turn a pot or flip a switch on the schematic and watch the numbers change.
  - **Connects:** the voltages it expects go to Bench's measurement log (1.4), so you can compare
    them with your meter on the real board.
  - Chips that run code (like the fume extractor's ATmega328P) are simulated as their connections
    only. Running the firmware stays with Wokwi, which Circuit links to.
  - *Check first:* ngspice's size when built for the browser (other projects already run it
    there), and its licence.
- **What it makes:**
  - `forge-project.json`, with the drawings, board, build steps, parts and connections Bench builds
    from, and the board outline Shape uses for the case;
  - the parts list (BOM) and the netlist;
  - **KiCad files** (`.kicad_sch` and `.kicad_pcb`), so a board can move on to KiCad;
  - **a factory pack** (Gerbers, drill, parts list and placement files) made by KiCad's
    command-line tool, on GitHub or on your computer, the way Bench 1.2 does it;
  - a circuit for other simulators too: KiCad's own, Falstad or Wokwi.
- **★ Variants** (from SolidWorks): the same board with different parts fitted, like the fume
  extractor with or without its USB port.
- **Long term:** its own copper board editor (tracks, filled areas, two layers) and its own factory
  files, so KiCad becomes a choice rather than a step.
- **Useful on its own** for any small circuit and any perfboard or stripboard build. KiCad is
  awkward for perfboard; free desktop tools such as VeroRoute and DIY Layout Creator exist. This one
  runs in the browser, on a tablet too, and is tied to the rest of the project.
- *Check first:* which KiCad file version to write, and that KiCad's command-line tool makes the
  factory files from a written board without opening KiCad.

#### Maker Forge Shape: 3D-printed cases and parts
Today's Maker Forge, with its own roadmap (fully parametric at its 2.0). It takes the Shape name at
this roadmap's 2.0, above.

### Build

#### Maker Forge Bench: read the drawings and build the board
This app: stages 1 and 2 above.

#### Maker Forge Labels: print labels for everything ★ New
- Bin labels with a QR code that opens the part in Parts on your phone.
- Wire tags from Bench's wire list, and cable markers.
- Front-panel labels for a case (LCD, knob, switch), placed from the project's `board` section.
- Prints on paper or sticker sheets, exports SVG for a laser or vinyl cutter, and makes a
  raised-text plate for Shape to 3D-print.
- **Useful on its own** for labelling anything, with or without a project.

### Test

#### Maker Forge Serial: talk to the board ★ New
- A serial monitor and live graph in the browser for Arduino-type boards, such as the fume
  extractor's ATmega328P. It uses the browser's Web Serial feature, which works in Chrome and Edge
  on a PC, but not in Firefox or Safari, or on an iPhone or iPad.
- Saves what the board printed with the project, so you can read a session back later or send it
  with a question to Claude.
- **Connects:** Bench's measurement log (1.4) takes readings straight from the board and shows the
  project's bring-up checks as pass or fail.
- *Check first:* whether uploading firmware from the browser is practical for AVR chips. Until then,
  the Arduino IDE does that.

Bench's own test tools (1.4) cover the meter side: connection highlighting, the measurement log and
the photo check.

### Share

#### Maker Forge Journal: a notebook for every project ★ New
- Notes, photos (kept on your device), time spent and what went wrong, across every project.
- The entries you choose are published to the Logs or Journal page on retr0plus.se.
- **Connects:** Bench's ticks, notes and measurements, and Shape's prints, arrive as entries by
  themselves. This takes over Bench's build log export (2.1).

#### Maker Forge Live: stream your build ★ New
- One clean page for OBS that shows what you're doing in any app: "Soldering R6, 10 k, step 31 of
  50" from Bench, or "Printing the case lid, 43 %" from your printer bridge on retr0plus.se.
- It replaces Bench's own stream view (planned as 2.2), because it isn't tied to one app. It fits
  next to the OBS overlays already in the website's `overlays/` folder.

### Suggested order
Circuit comes first and Parts last (see "The order from here"). The smaller apps fit between:
1. **Calc:** small, useful to everyone, and Bench's part cards (1.1) use its formulas.
2. **Serial:** finishes the testing side of Bench (1.4).
3. **Pins:** ready before the next new electronics project.
4. **Labels:** once Parts exists, for the bin QR codes and the wire tags.
5. **Journal:** once at least two apps have something to write into it.
6. **Live:** whenever streaming builds becomes a priority.

---

## Decisions for the owner

**Decided on 2026-11-12**
1. The app's name: **Maker Forge Bench**, in the **Maker Forge** suite.
2. Hosting: the folder `forge.retr0plus.se/bench/`, which keeps the plan's last free website spare.
3. The project file's name: `forge-project.json`.

**Decided on 2026-11-14**
6. Build around KiCad, and let the suite design a whole board from scratch in time.
7. One design app, **Maker Forge Circuit**, with Schematic and Board workspaces (Layout joins it).
8. One shared parts library for every app, the **Maker Forge Library**.
9. 3D: whole KiCad boards through KiCad's own export, plus about 150 common parts converted and
   shipped with Bench, and a better 3D view all round.
10. The order: Bench 0.9 Real parts, Bench 1.0, Circuit, the board in its box, then Parts. The
    copper editor is long term.
11. Simulation built into Circuit, as a later step, using ngspice in the browser.
12. Parts is an app of its own, and comes last: browse what you have, a shopping list to print,
    and finding parts online.
13. KiCad import is an option for people who bring KiCad projects, in 1.2, with GitHub able to run
    KiCad so nothing has to run on your computer. 0.9 is the real parts and the 3D view.

**Still open**
4. Languages: English only at first, or Swedish too.
5. The order of the smaller apps (Calc, Pins, Serial, Labels, Journal, Live) around the main plan.

## Not planned

- **Racing KiCad on big copper boards.** The suite will design whole boards, but for large or
  many-layer copper boards KiCad stays the better tool, and Circuit hands them over as KiCad files.
  *(Until 2026-11-14 this said "not a KiCad replacement" and kept the suite's builders small.)*
- **Writing our own simulator engine.** Circuit's built-in simulation runs ngspice, KiCad's free
  engine, instead. Firmware simulation stays with Wokwi.
- **Opening SolidWorks files.** Their format is closed. STEP files are the bridge: KiCad writes
  them, and Shape can read them later.
- **A slicer.** PrusaSlicer and OrcaSlicer already do it; Shape's models go to them.
- **A code editor.** VS Code and the Arduino IDE already do it.
- **Accounts, cloud storage or syncing through a server.** Moving progress between devices is done
  with a file, so no server is needed.
- **Adverts or tracking**, ever.
