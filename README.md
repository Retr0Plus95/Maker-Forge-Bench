# Maker Forge Bench

A soldering drawing viewer for any electronics project: zoom into schematics and board layouts,
find a part, see what it is and why it's there, flip to the solder side, tick off what's done, and
ask Claude about a part. It runs in your browser on PC, phone and tablet, with no account and no
uploads.

It's part of **Maker Forge**, a suite of hobbyist apps that share one project file, alongside
Shape, today's [Maker Forge](https://github.com/Retr0Plus95/Maker-Forge) 3D app. It will live at
`forge.retr0plus.se/bench/`.

**Status:** release 1.0.5 works on PC, phone and tablet, from a local folder, a public GitHub repo,
or a folder picked in the browser. See the roadmap for what comes next.

## Try it

You need Python 3.10 or newer. In this folder:

```
python dev.py "path/to/your/project folder"
```

Then open the address it prints (`http://127.0.0.1:8765/`). Started without a folder
(`python dev.py`), it opens a start screen: paste a GitHub link, open a folder on this computer,
or try an example. A link like `http://127.0.0.1:8765/?repo=owner/name` opens a public GitHub
repo straight away.

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
- **3D board** (`b`): the perfboard in 3D over the dimmed schematic.
  - **Models:** every part is drawn from its datasheet size. That includes resistors with their
    real colour bands, ceramics printed with their code, and electrolytics with sleeve, stripe and
    vent. The chip sits in its socket with notch, legs and name, and the fan headers have their
    wall and key. There's a solder joint under every leg.
  - **Look:** studio lighting with soft shadows.
  - **Moving around:** a view cube in the corner, Top, Underside, Front, Side, 3/4 and Fit. Arrow
    keys turn the board, hover names a part, click selects it (outlined, its holes lit) and
    double-click flies to it.
  - **Tools:** exploded view, X-ray, a cut-away, measure in mm and holes, play the build steps,
    build up to this step, labels on or off, and save a picture (PNG) or the board as STL.
  - **My board** shows your own placement instead of sheet 4.
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
- **Parts library:** pin names for the ATmega328P (with the Arduino numbers), the MP1584 module,
  common transistors, diodes, LEDs, electrolytics, crystals and fan headers. Each comes with which
  way round it goes, how to use it, and its source. The card also shows a resistor's colour bands,
  a ceramic's printed code, and pictures of which way round.
- **Continuity test:** the meter's beep test, pair by pair, from the project's own connections
  (should beep / must not beep), with faults kept and explained.
- **Your board, more:**
  - drag a placed part to move it;
  - **Check my board** finds two legs in one hole, parts on top of each other, and risky
    neighbours;
  - **suggested wires** underneath, three shapes per line.
- **Where it goes (0.6):**
  - **Hole names like your board's:** type what's printed by three chip pins (like L21, L8, O21)
    and every hole gets its name: on part cards ("On your board: + at L15, − at L14"), in Check my
    board, the suggested wires, the continuity test, a hover tip on the photo, and along the edges
    of your board in 3D. Boards that skip letters, and columns after Z, work too.
  - **Suggest a spot:** for any part, Bench tries its shape four ways round near what it connects
    to and shows the best three, dashed on the photo, with the reason ("on U2 pin 7 and pin 8").
    Use this spot places it in one undo step.
  - **Save my board as file / Open a board file:** line-ups, placements, wire shapes and hole
    names in one file. The photos stay in your folder.
- **Everywhere (0.7):**
  - **From GitHub:** paste a public repo's link (`github.com/owner/name`, or a link to a folder in
    it) and Bench reads its drawings and `forge-project.json` from GitHub. Links keep the repo:
    `?repo=owner/name&sheet=SFE-04&part=R6`. The badge says "From GitHub"; click it to read the
    repo again and reload only what changed. GitHub lets a browser open about 60 repos an hour
    without signing in.
  - **From a folder:** Open a folder reads one on this computer; nothing is uploaded. To see
    changes, open it again (with Python, `dev.py` refreshes by itself).
  - **Examples** on the start screen, starting with the Solder Fume Extractor.
  - **Phones and tablets:** under 760 px wide the tools fold into a **Menu** (Undo, Redo and Find
    stay), the sheets are a strip you swipe sideways, and the panel is a sheet at the bottom: tap
    or swipe its handle for taller or shorter. Tap a part on the drawing to open its card.
  - **Ask here:** in Easy reading, **AI help (optional)** connects your own Claude API key or a
    model on this computer through Ollama. Then a part card's Ask box gets **Ask here**, and the
    answer shows in the card. Your key stays in this browser: in memory, or in its storage if
    you tick Remember. It's never put in a progress file, a board file or a link, and using it
    is billed to your Anthropic account.
- **True to life (0.8):**
  - **The panel in tabs:** **Guide · Board · Wiring · Checks · Parts**, each with how much is done
    (Guide 3/10). The part card stays on top of every tab. **All** shows every section in one long
    list, as before. Finding a line opens Wiring; My board opens Board. Arrow keys move between
    tabs.
  - **The guide:** the open step in bigger words, with a progress bar, each part with its value
    and where it goes (with hole names on, where on your board) and a tick, and a big
    **Done, next step** that ticks the step's parts in one undo step and opens the next one. With
    no step open, one button starts at step 1 or carries on where you left off. Your note, Print
    this step and Next step by itself are folded under one line.
  - **Adjust steps:** move a step up or down, skip one you don't need, add a step of your own after
    the open one, or go back to the project's steps. Kept with your progress, undoable.
  - **Looks like:** on a part card, set what you really fitted: an electrolytic's size, a
    resistor's colour or upright mount, a socket or not, a ceramic's style, an LED's colour, a
    female header, the TO-220's facing, or another part in its place (an L7805 for the MP1584
    buck module, with a warning about the heat). The 3D board and Check my board follow.
  - **Truer 3D parts:** resistors, capacitors, diodes and LEDs are turned shapes from their
    datasheets; the chip has its real legs; TO-220, headers and the crystal are to size.
  - **The Menu on a computer too:** Calculators, Keep screen on and Full screen are in it, with
    Save progress, Shopping list, Build log, Versions and Keyboard shortcuts.
- **Real parts (0.9):**
  - **Real 3D parts:** the 3D board draws each part from the **Maker Forge Library**, 193
    through-hole parts converted once from KiCad's free 3D models (CC-BY-SA 4.0, see
    [`src/library/LICENSE-KICAD-3D.md`](src/library/LICENSE-KICAD-3D.md)), plus models made for
    Bench where KiCad has none (the MP1584 buck module, a 9 mm pot, a 12 mm button). Bench still
    paints its own colour bands, values and stripes on them, and bends a capacitor's legs when its
    holes are wider than the model's. **Parts: Real or Simple** in the 3D bar: Simple is Bench's
    own drawing, quicker on a slow phone. A loading bar counts the models in. Nothing runs on your
    computer: the models come with the page.
  - **A 3D model in Looks like:** each part card lists the models that fit its holes (straight
    first, then with bent legs), models in the project (`.glb`, and KiCad's `.wrl` through
    `dev.py`), and **Use my own model…**: a `.glb` up to 5 MB, kept in this browser.
  - **Board colours:** green, black, blue, red, white, purple, perfboard or stripboard, kept per
    project.
  - **Your progress in 3D:** the parts you've ticked get shiny solder joints underneath; the rest
    show bare legs.
  - **Which way round:** a mark over each + leg, cathode and pin 1.
  - **The camera follows you:** opening a guide step turns the view to its parts (or over, for the
    wiring underneath), and Find flies to the part it found.
  - **Saved views:** name the view and keep up to nine per project.
  - **Height check:** the tallest part on each side, and **Lid at __ mm** lights up what pokes
    through: ready for the board in its box.
  - **Check my board in 3D:** with My board showing, its problems are red marks on the board
    (warnings amber); click one to open it.
  - **Save GLB, Save OBJ and Turntable video** next to Save picture and Save STL. Shadows switch
    off with Reduce motion and on small screens.
- **Taken from Maker Forge Shape (1.0):**
  - **Wire to cut** (Wiring tab): every link with where it runs, its line and "cut 15 mm, strip 5 mm
    at each end", every bare-wire bus with its length, and totals in plain words ("Insulated wire: 44
    links, about 1.3 m in all"). The suggested wires on your own board get the same, with a colour
    hint per line: red for supplies, black for 0 V. Link numbers match sheet 4's wire list. **Copy as
    text** for paper.
  - **Boards and modules:** 62 of Shape's boards and modules (Arduino, Raspberry Pi, ESP32 and
    ESP8266, power converters, relays, motor drivers, sensors) in the Maker Forge Library as small 3D
    models at their real size, with their mounting holes and ports. A part whose value names one
    ("Arduino Nano Every", "LM2596") gets its model, a card line ("Module: 45 × 18 mm, no mounting
    holes, mini-USB on the left edge") and the whole group in Looks like. Pins come from KiCad's
    footprints for the Nano, Feather, Pico and D1 mini, and from Seeed's drawing for the XIAO.
  - **Send to Shape** (Menu, and Tools in the 3D view): your board's size, mounting holes, screw
    size, tallest part, ports at the edges and LEDs and buttons on top go straight into Shape's Your
    parts, ready for its box maker. Sending again replaces it. It works at forge.retr0plus.se, where
    both apps share this browser's storage; anywhere else the dialog says so and sends nothing.
- **At the bench (1.0.1):**
  - **Welcome back** says where you left off.
  - **Time left** is worked out from your own speed.
  - **Iron reminder**, if you turn it on.
  - **Sort your parts first**, step by step.
  - **Joints and solder** on the shopping list.
  - **Tools** for each step and a soldering tip on each card.
  - **"I don't have this one yet"** skips a part until it comes.
  - **Undo by tap** after a tick, and a small buzz on Android.
  - **Mix-up warning** for resistors that look alike.
  - **Bridge risk** for neighbouring joints underneath on different lines.
- **Find a fault (1.0.2, Checks):** pick what you see ("the fans always run at full speed"), and Bench walks you
  through meter checks from the board's own connections, showing where each probe goes. Claude helps when the checks
  run out.
- **Wires from the drawing (1.0.3, Wiring):** a drawing with a wire table (W1, W2…) gives a list of wires to tick,
  with its checks and notes. Bench says what's wrong or missing in the drawing, and asks for what it can't read.
- **How to build it (1.0.4, Guide):** Bench reads the project's README and shows its wiring, assembly and first
  power-up as steps to tick, each with its wires and a picture cut from the drawing, behind a mains safety list.
- **The case (1.0.5, Case tab):** every STL and 3MF in the project is a part to print. Each one shows:
  - its size;
  - about how much plastic it takes (grams and metres of 1.75 mm filament);
  - whether it fits your printer (pick yours, or type your bed's size), and if it's too big as it lies, whether
    another side would fit;
  - what the README's table says it is and how to print it (a `File | What it is | Print` table, any README in the
    project);
  - a small picture;
  - a **Printed** tick;
  - **Look in 3D**: the part on your bed inside the build volume, green when it fits and red when it doesn't.

  Bench also says when a file isn't a model, has gaps in its surface, is inside out or looks like the wrong units.
  **Copy as text** gives the list for paper. A 3MF is opened by the browser itself, with nothing to install.
- **What you have (1.0.5, Guide):** one card with every piece of the build, from parts soldered to case parts
  printed. Each shows how far it's got and opens its tab, and "Left to do" sums up the rest.
- **History:** a build log with times and time spent, named versions of your progress, and a
  build report to download.
- **Find anything** with `Ctrl+K`. Links open right at a part (`?sheet=SFE-04&part=R8`).
  Calculators: LED resistor, Ohm's law, divider.
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
- Design for 0.7 Everywhere (GitHub, folders, phones, AI help): [`docs/design/2026-11-13-release-0.7-design.md`](docs/design/2026-11-13-release-0.7-design.md)
- Design for 0.8 True to life (3D parts, Looks like, tabs and the guide): [`docs/design/2026-11-13-release-0.8-design.md`](docs/design/2026-11-13-release-0.8-design.md)
- Design for 0.9 Real parts (the Maker Forge Library, KiCad's 3D models, a better 3D view): [`docs/design/2026-11-14-release-0.9-design.md`](docs/design/2026-11-14-release-0.9-design.md)
- Design for 1.0 Launch (Wire to cut, Shape's boards and modules, Send to Shape): [`docs/design/2026-11-15-release-1.0-design.md`](docs/design/2026-11-15-release-1.0-design.md)
- Roadmap, including ideas for future suite apps: [`ROADMAP.md`](ROADMAP.md)

MIT licence: see [`LICENSE`](LICENSE). The Atkinson Hyperlegible font is under the SIL Open Font
Licence: see [`FONTS-LICENSE.md`](FONTS-LICENSE.md). three.js r128 is MIT: see [`THREE-LICENSE`](THREE-LICENSE).
The 3D models converted from KiCad's library are CC-BY-SA 4.0, by the KiCad library team: see
[`src/library/LICENSE-KICAD-3D.md`](src/library/LICENSE-KICAD-3D.md). The models made for Bench are MIT,
and so are the boards and modules made from Maker Forge Shape's data.
