# Maker Forge Bench roadmap

*Written 2026-11-12, with names, hosting and future apps updated the same day. A plan, not a
promise: each release gets its own pull request and can be reordered. The design for release 1 is
in `docs/design/2026-11-12-maker-forge-bench-design.md`.*

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

## The stages

| Stage | Releases | What it is for |
|---|---|---|
| Build the viewer | 0.1 to 1.0 | The soldering viewer, finished and published |
| Bench tools | 1.1 to 1.4 | Calculators on part cards, more file types, guided building, testing and fault-finding |
| The Maker Forge suite | 2.0 and on | The home page, Bench, Shape and the website working as one project |
| More apps | any time | Learn and plan, design, build, test, share: see "The apps in the suite" |

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

### 0.7 Everywhere (was 0.3)
- Phone and tablet layouts: pinch, two-finger pan, a sheet menu.
- **★ New: Keep screen on** at the bench. (Easy reading and themes arrived in 0.2.)
- Open a public GitHub repo by pasting its link.
- **★ New: Links straight to a part.**
  `forge.retr0plus.se/bench/?repo=Retr0Plus95/Solder-Fume-Extractor&sheet=SFE-04&part=R6`
  opens right at R6. Good for sending a friend "look here", and for buttons on your website.
- **★ New: Built-in examples**, like Shape's *Start from*: the fume extractor, plus the RGB Lamp
  Controller once it has drawings.
- Your own Claude key (or Ollama), the same way Shape does it.

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
- **KiCad parts list (BOM CSV)** as a parts source, so KiCad projects get part cards without
  writing a project file.
- **★ New: Read KiCad schematic files directly.** KiCad saves schematics (`.kicad_sch`) as plain
  text, so Bench can read every part and every connection from them, with no export step. That
  gives part cards and connection highlighting (1.4) without a project file. *Check first:* how much
  work drawing the sheet itself is. Reading the parts and connections is worth it on its own.
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
  lights up, ready for continuity checks with your meter. This needs connection data: KiCad's
  netlist, or `board.py` for the fume extractor.
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
| **Learn and plan** | **Parts** | What each component is, how to use it, and which ones you have | Idea |
| | **Calc** | Electronics calculators | Idea |
| | **Pins** | Plan a microcontroller's pins | Idea |
| **Design** | **Circuit** | Draw small circuits (schematics) | Idea |
| | **Layout** | Perfboard and stripboard layouts | Idea |
| | **Shape** | 3D-printed cases and parts | Exists (today's Maker Forge) |
| **Build** | **Bench** | Read the drawings and build the board | This repo |
| | **Labels** | Labels for bins, wires and front panels | Idea |
| **Test** | **Serial** | Talk to the board and graph what it says | Idea |
| **Share** | **Journal** | A build notebook, published to retr0plus.se | Idea |
| | **Live** | A stream page for OBS | Idea |
| **The whole project** | **Maker Forge** (home) | The assembly: every piece of one project | Planned for 2.0 |

Copper circuit boards and large schematics stay in KiCad (see "Not planned").

**Considered, and kept as features instead:** the power budget (Bench 1.1, using Calc's formulas),
project cost (the home page, once Parts knows prices), front panels (Labels and Shape together),
off-board wiring (Bench's wire list) and reading circuits (Bench is the reader).

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

**★ New: Identify a part from a photo.** Photograph a resistor's bands or a chip's markings, and
Claude (with your own key) reads the value or part number and opens its page. It's shown as a
guess for you to check.

**My parts, or what you have on hand.** *(This was "2.3 Parts inventory".)*
- A list of the parts you own and which bin each is in. The fume extractor notes already track
  "1N4007 and 1N4002 on hand".
- A project's parts list then shows **"have 3 × 1N5402G, need 1"**, and what's missing becomes a
  shopping list.
- **★ New: Filament too:** spools, colours and how much is left, so the 3D-printing side uses it
  as well.

**Connects:** Bench's part cards open the library page and show have and need. Labels prints the bin
labels. Shape says how much filament a print takes.

**Order:** the library first, because every visitor can use it with nothing to type in. The
inventory comes second.

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

#### Maker Forge Circuit: draw small circuits ★ New
- A simple schematic builder for small circuits, about 50 parts or fewer, made for beginners. Parts
  come from the Parts library, wires snap into place, and it points out common mistakes as you
  draw: an LED with no resistor, a pin connected to nothing, two outputs wired together.
- Saves the drawing (as SVG, which Bench reads) and the list of connections (the netlist) in the
  project file. Layout builds on that list, and Bench uses it to highlight a connection (1.4).
- Exports a netlist for KiCad, for when a project outgrows it. *Check first:* which KiCad netlist
  format to write.
- Maybe later: **Try it in Falstad**, which opens the circuit in Falstad's free simulator.
- **Useful on its own** for sketching any small circuit.
- **The biggest app on this list**, so it comes late. Layout works without it first, using a
  netlist from KiCad or one typed in.

#### Maker Forge Layout: perfboard and stripboard layouts ★ New
- What `board.py`, `pcb.py` and `render.py` do for the fume extractor, as an app for any project.
  Place parts on a perfboard or stripboard grid, draw links and wires, and mark stripboard track
  cuts.
- Checks the layout against the circuit's connections as you go, the way `pcb.py` checks the fume
  extractor: a missing connection, a short, two parts in one hole.
- Produces the layout drawing and the build order that Bench uses for step-by-step mode (1.3), and
  the board outline that Shape uses for the case.
- KiCad is built for copper boards and is awkward for perfboard and stripboard. Free desktop tools
  such as VeroRoute and DIY Layout Creator exist. This one runs in the browser, on a tablet too,
  and is tied to the rest of the project.
- **Useful on its own** for any perfboard or stripboard build.

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
1. **Calc:** small, useful to everyone, and Bench's part cards (1.1) use its formulas.
2. **Parts:** the library first, then the inventory.
3. **Serial:** finishes the testing side of Bench (1.4).
4. **Pins:** ready before the next new electronics project.
5. **Layout:** turns the fume extractor's layout tools into an app for every project.
6. **Labels:** once Parts exists, for the bin QR codes.
7. **Circuit:** the biggest, so it comes once Layout has proved the connection list.
8. **Journal:** once at least two apps have something to write into it.
9. **Live:** whenever streaming builds becomes a priority.

---

## Decisions for the owner

**Decided on 2026-11-12**
1. The app's name: **Maker Forge Bench**, in the **Maker Forge** suite.
2. Hosting: the folder `forge.retr0plus.se/bench/`, which keeps the plan's last free website spare.
3. The project file's name: `forge-project.json`.

**Still open**
4. Languages: English only at first, or Swedish too.
5. Which future apps to keep, and in what order.

## Not planned

- **A KiCad replacement.** Copper circuit boards and large schematics stay in KiCad, which does
  them for free, and Bench reads its output. The suite's own builders stay small: Circuit for small
  schematics, and Layout for perfboard and stripboard.
- **A circuit simulator.** Falstad's circuit simulator and Wokwi already do it for free in the
  browser. Bench and Circuit can link to them.
- **A slicer.** PrusaSlicer and OrcaSlicer already do it; Shape's models go to them.
- **A code editor.** VS Code and the Arduino IDE already do it.
- **Accounts, cloud storage or syncing through a server.** Moving progress between devices is done
  with a file, so no server is needed.
- **Adverts or tracking**, ever.
