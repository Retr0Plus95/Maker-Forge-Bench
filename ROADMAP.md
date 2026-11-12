# Bench Forge roadmap

*Written 2026-11-12. A plan, not a promise: each release gets its own pull request and can be
reordered. The design for release 1 is in `docs/design/2026-11-12-bench-forge-design.md`.*

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
| The Forge suite | 2.0 and on | Bench Forge, Maker Forge and the website working as one project |

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
- **★ New: Links straight to a part.** `…/?repo=Retr0Plus95/Solder-Fume-Extractor&sheet=SFE-04&part=R6`
  opens right at R6. Good for sending a friend "look here", and for buttons on your website.
- **★ New: Built-in examples**, like Maker Forge's *Start from*: the fume extractor, plus the RGB Lamp
  Controller once it has drawings.
- Your own Claude key (or Ollama), the same way Maker Forge does it.

### 1.0 Launch
- Security review of the cleaner and the address rules. Real-phone and real-tablet test. User
  manual inside the app.
- Live at `bench.retr0plus.se`, listed on the Workbench page (work done in the website repo).
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
- **★ New: Battery life:** capacity and current draw → hours. Maker Forge already has this for
  boxes, so share the formula.

### 1.2 More files, and offline
- **PDF**, with its text searchable. KiCad's PDF exports keep text, which fixes the KiCad risk for good.
- **KiCad parts list (BOM CSV)** as a parts source, so KiCad projects get part cards without
  writing a project file.
- **Install on phone and tablet**, and work with no internet at the bench.
- **One-file download**, like Maker Forge's releases.
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
  The log can go along with a question to Claude.
- **Photo check:** add a photo of your board, and Claude compares it with the layout, pointing out a
  missing link or a backwards diode.
- **★ New: Revision compare, with ticks that know what changed.** Load two versions of a project
  (two commits on GitHub, such as Rev C and Rev D) and see exactly what moved. Any part you already
  soldered that the new revision changed gets flagged: "R4 moved two holes since you soldered it."
  This is what makes changing drawings on the fly *while you build* safe.

---

## Stage 3: the Forge suite (2.0 and on)

The SolidWorks idea: separate apps, one project file between them. Each item needs work in the
other app's own repo and Claude session.

### 2.0 Board to box
- **Bench Forge → Maker Forge:** the project file's `board` section (board outline, mounting holes,
  where the fans, LCD, pot and connectors sit) opens in Maker Forge's project-box maker. Change the
  board, and the box can follow. This is the link SolidWorks users pay extra for.
- **Maker Forge → Bench Forge:** the box's printed parts appear in the project, so the build
  checklist can include "fit the board on its standoffs".

### 2.1 Publish
- **★ New: Project page from the project file.** retr0plus.se builds a project's page (drawings,
  parts list, downloads) from its `forge-project.json`, with an **Open in Bench Forge** button.
- **★ New: Build log export.** Your checklist history, notes and measurements become a build-log
  entry on the website's Logs or Journal page.

### 2.2 Stream the build
- **★ New: Stream view for OBS.** A clean page showing the part or step you're on, as a browser source
  next to your camera. Your website already has OBS overlays in `overlays/`, so this fits there.
  Viewers see "Soldering R6, 10 k, step 31 of 50".

### 2.3 Parts inventory (a new app in the suite)
- **★ New:** a list of the parts you own (the fume extractor notes already track "1N4007 and 1N4002
  on hand"). A project's parts list then shows **"have 3 × 1N5402G, need 1"**, and what's missing
  becomes a shopping list. It's its own app because it's useful even without a project.

---

## Decisions for the owner

1. The app's real name (design §13).
2. Hosting: its own one.com website `bench.retr0plus.se`, if the plan still has one free.
3. The project file's name: `forge-project.json`, or another.
4. Languages: English only at first, or Swedish too.
5. A suite name, if you want one: the "Forge" family (Maker Forge, Bench Forge, ...), or your own.

## Not planned

- **A schematic or PCB editor.** KiCad does that for free; Bench Forge reads its output.
- **Accounts, cloud storage or syncing through a server.** Moving progress between devices is done
  with a file, so no server is needed.
- **Adverts or tracking**, ever.
