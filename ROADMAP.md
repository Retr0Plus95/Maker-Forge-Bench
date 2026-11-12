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
| Bench tools | 1.1 to 1.4 | Calculators, more file types, guided building, testing and fault-finding |
| The Maker Forge suite | 2.0 and on | The home page, Bench, Shape and the website working as one project, then new apps |

---

## Stage 1: build the viewer (0.1 to 1.0)

### 0.1 First look (PC, inside the Claude app)
- **Check first:** whether KiCad SVG exports keep their text as text (design §11). The answer decides
  whether PDF support moves earlier.
- Open a folder through `dev.py`, with auto-refresh.
- SVG cleaner with its nasty-file tests.
- Sheet tabs, zoom and pan with mouse and keys, fit to screen.
- Find part across all sheets.
- Flip a layout sheet to the solder side.
- Tested on: the fume extractor's five sheets.

### 0.2 Know your parts
- The project file v1 (`forge-project.json`), plus guessing parts when there is no project file.
- Part cards with polarity warnings.
- The same part highlighted on every sheet, and two sheets side by side.
- Build checklist, saved per project and revision, with export and import.
- Ask Claude: in the Claude app (Claude reads your selection), Copy for Claude, open claude.ai.
- The fume extractor repo gets its `forge-project.json`.

### 0.3 Everywhere
- Phone and tablet layouts: pinch, two-finger pan, a sheet menu.
- Easy reading, light and dark themes, **★ New: Keep screen on** at the bench.
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

### 1.1 Calculators
Each one shows its working in plain words, not just the answer.
- **Resistor colour code**, both ways: bands → value and value → bands. **★ New: on every resistor's
  part card too** ("10 k = brown, black, orange"), so you can pick the right one out of the bag.
- Ohm's law and power. It warns when a resistor would run hot ("0.6 W in a ¼ W resistor").
- LED series resistor: supply, LED colour and current → resistor and its wattage.
- Voltage divider, both ways, with the nearest standard values (E12/E24).
- **★ New: Capacitor code reader:** `104` → 100 nF, `22p`, `4n7`, and the voltage letters.
- Fuse and wire size: current → fuse rating and wire thickness. Your fume extractor's 1 A / 2 A
  fuse question is exactly this.
- **★ New: Battery life:** capacity and current draw → hours. Shape already has this for boxes, so
  share the formula.
- **★ New: Power budget:** adds up what every part in the project draws, and checks the regulator,
  fuse and battery against it.

### 1.2 More files, and offline
- **PDF**, with its text searchable. KiCad's PDF exports keep text, which fixes the KiCad risk for good.
- **KiCad parts list (BOM CSV)** as a parts source, so KiCad projects get part cards without
  writing a project file.
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

## Future apps in the suite

**The test for a new app:** it has to be useful on its own, without the other apps. If it isn't, it
becomes a feature of an app that already exists. That's why the calculators belong to Bench, and the
parts inventory is an app of its own.

**Considered, and kept as features instead:** the power budget (a Bench calculator, 1.1), project
cost (the home page, once Parts knows prices), front panels (Labels and Shape together) and
off-board wiring (Bench's wire list).

### Maker Forge Parts: what you have on hand
*(This was "2.3 Parts inventory".)*
- A list of the parts you own and which bin each is in. The fume extractor notes already track
  "1N4007 and 1N4002 on hand".
- A project's parts list then shows **"have 3 × 1N5402G, need 1"**, and what's missing becomes a
  shopping list.
- **★ New: Filament too:** spools, colours and how much is left, so the 3D-printing side uses it
  as well.
- **Connects:** Bench's part cards and checklist show have and need. Shape says how much filament a
  print takes. Labels prints the bin labels.

### Maker Forge Serial: talk to the board ★ New
- A serial monitor and live graph in the browser for Arduino-type boards, such as the fume
  extractor's ATmega328P. It uses the browser's Web Serial feature, which works in Chrome and Edge
  on a PC, but not in Firefox or Safari, or on an iPhone or iPad.
- Saves what the board printed with the project, so you can read a session back later or send it
  with a question to Claude.
- **Connects:** Bench's measurement log (1.4) takes readings straight from the board and shows the
  project's bring-up checks as pass or fail.
- *Check first:* whether uploading firmware from the browser is practical for AVR chips. Until then,
  the Arduino IDE does that.

### Maker Forge Pins: plan the microcontroller's pins ★ New
- Pick a chip (ATmega328P, ESP32 and Raspberry Pi Pico to start), give each pin a job, and it warns
  about clashes: two jobs on one pin, PWM on a pin that can't do it, or a pin the chip needs at
  start-up (the ESP32's strapping pins).
- Writes the pin list for the firmware (the `#define` lines) and a pin table for the drawings, so
  the code and the schematic agree.
- **Connects:** U2's part card in Bench shows the pin table. Serial labels its graphs with pin names.
- **Useful on its own** because you plan the pins before any drawing exists.

### Maker Forge Labels: print labels for everything ★ New
- Bin labels with a QR code that opens the part in Parts on your phone.
- Wire tags from Bench's wire list, and cable markers.
- Front-panel labels for a case (LCD, knob, switch), placed from the project's `board` section.
- Prints on paper or sticker sheets, exports SVG for a laser or vinyl cutter, and makes a
  raised-text plate for Shape to 3D-print.
- **Useful on its own** for labelling anything, with or without a project.

### Maker Forge Journal: a notebook for every project ★ New
- Notes, photos (kept on your device), time spent and what went wrong, across every project.
- The entries you choose are published to the Logs or Journal page on retr0plus.se.
- **Connects:** Bench's ticks, notes and measurements, and Shape's prints, arrive as entries by
  themselves. This takes over Bench's build log export (2.1).

### Maker Forge Live: stream your build ★ New
- One clean page for OBS that shows what you're doing in any app: "Soldering R6, 10 k, step 31 of
  50" from Bench, or "Printing the case lid, 43 %" from your printer bridge on retr0plus.se.
- It replaces Bench's own stream view (planned as 2.2), because it isn't tied to one app. It fits
  next to the OBS overlays already in the website's `overlays/` folder.

### Suggested order
1. **Parts:** the most everyday use, and both Labels and Bench build on it.
2. **Serial:** finishes the testing side of Bench (1.4).
3. **Pins:** ready before the next new electronics project.
4. **Labels:** once Parts exists, for the bin QR codes.
5. **Journal:** once at least two apps have something to write into it.
6. **Live:** whenever streaming builds becomes a priority.

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

- **A schematic or PCB editor.** KiCad does that for free; Bench reads its output.
- **A circuit simulator.** Falstad's circuit simulator and Wokwi already do it for free in the
  browser; Bench can link to them.
- **A slicer.** PrusaSlicer and OrcaSlicer already do it; Shape's models go to them.
- **A code editor.** VS Code and the Arduino IDE already do it.
- **Accounts, cloud storage or syncing through a server.** Moving progress between devices is done
  with a file, so no server is needed.
- **Adverts or tracking**, ever.
