# Maker Forge Bench: design for release 1

*Written 2026-11-12, with names and hosting updated the same day. Status: **draft for the owner's
review**. Nothing is built yet.*

*Names: **Maker Forge** is the suite. This app is **Maker Forge Bench**, or "Bench" for short. It
was called "Bench Forge" while it only had a working name. Today's Maker Forge 3D app becomes
**Maker Forge Shape** at 2.0. Until then it keeps its current name, but this document calls it
**Shape**, so the two meanings of "Maker Forge" can't be mixed up.*

## 1. What it is, and who it's for

A drawing viewer for **soldering**: it shows a project's schematics and board layout next to the
bench, so you can zoom into any corner, find a part, flip the board to the side you're soldering,
tick off what's done, and ask Claude about a part without leaving the drawing.

**What the owner asked for**
- One tool for **every** electronics project, not just the fume extractor.
- Used on the **PC** (inside the Claude app while drawings are being changed), on a **phone** and on a
  **tablet**.
- Its **own project with its own GitHub repo**, published on **retr0plus.se** and listed as a tool on the
  site's **Workbench** page.
- **Visitors** can use it with their own projects.
- Release 1: zoom, find part, auto-refresh, works with any project, part card + Ask Claude, the same
  part highlighted on every sheet, flip to the solder side, build checklist.
- Long term: part of a **hobbyist suite called Maker Forge**, closer to SolidWorks or Fusion 360
  than to Office (section 2).

**What this design assumes** (the owner can correct any of these)
- It runs entirely in the browser: no server, no account, no uploads. This is approach "A" from the
  design chat.
- Electronics calculators become an app of their own, Maker Forge Calc. Bench uses them on its
  part cards after 1.0 (roadmap 1.1).
- The project file is built so other apps in the suite can read it ("suite-ready").
- English only in release 1. MIT licence, like Shape and the fume extractor.

## 2. The bigger picture: Maker Forge, a hobbyist's SolidWorks

SolidWorks and Fusion 360 are not a box of separate programs. They have **one project** that
several *workspaces* work on: parts, assemblies, drawings, electronics and manufacturing. The
part that makes them powerful is the link between electronics and mechanics: change the
circuit board, and the case around it knows.

The owner already has the pieces of a hobbyist version of that:

| Workspace | App | Job |
|---|---|---|
| The assembly: the whole project | **Maker Forge**, the home page at forge.retr0plus.se (roadmap 2.0) | Opens a project and shows every piece of it: drawings and build progress, the case, the parts. Opens each piece in the right app. |
| Mechanical: parts, boxes, prints | **Maker Forge Shape** (today's Maker Forge, 0.57) | Design and 3D-print. Its roadmap makes it fully parametric at 2.0, with sketches, constraints and an editable history. That *is* the SolidWorks part. |
| Electrical: drawings, building, testing | **Maker Forge Bench** (this design) | Read the drawings, build the board, test it. |
| Publishing | **retr0plus.se** | Project pages, build logs, downloads. |
| What ties them together | **The project file** (section 6) | One project that every app reads and adds to. The home page is where you see it whole. |

**How the apps are named:** the suite and its home are **Maker Forge**. Each app is "Maker Forge"
plus one plain word that says what it does (Shape, Bench, and later Calc, Parts, Layout and
others), the way Fusion 360 names its Design and Electronics workspaces. Only "Maker Forge" has to
be a unique name. Ideas for future apps are in `ROADMAP.md` ("The apps in the suite"), grouped by
the part of a project they serve: learn and plan, design, build, test, share.

Three rules keep this workable:
1. **Separate apps, separate repos, one shared file and one address.** Each app must be useful on
   its own. They connect through the project file, links, and the browser storage they share at
   forge.retr0plus.se (section 4), never by merging code.
2. **Don't rebuild KiCad.** Copper circuit boards and large schematics are a huge job that KiCad
   does for free. Bench *imports* from KiCad, EasyEDA, Fritzing or hand-made drawings. The suite's
   own builders stay small: Circuit for small schematics, and Layout for perfboard and stripboard,
   which KiCad is awkward for. The suite's value is the bench and the connections, not another CAD
   program.
3. **The same promises in every app**: free and MIT, works without an account, your files stay on
   your device, plain words, Easy reading.

## 3. Release 1 scope

"Release 1" means version **1.0**. It is built in steps 0.1, 0.2 and 0.3 (see `ROADMAP.md`), and
each step gets its own implementation plan.

**In**
1. Open a project: files, a folder, a public GitHub repo, or a built-in example.
2. View: sheet tabs, zoom and pan with mouse, keys or fingers, sharp at any zoom.
3. Find part: type `R6` to see every match on every sheet.
4. Part card: value, its job in the circuit, a polarity note, datasheet link, which sheets it's on.
5. The same part on every sheet: selecting R6 highlights it everywhere, with two sheets side by side on
   wide screens.
6. Flip to the solder side, for layout sheets.
7. Build checklist: tick parts off, done ones turn green, progress saved.
8. Ask Claude about a part (four routes, section 7.8).
9. Auto-refresh while the drawings are being edited on the PC.
10. Easy reading, phone and tablet layouts, and a screen that stays on at the bench.

**Not in release 1** (all in `ROADMAP.md`): calculators, PDF, step-by-step mode, hole finder,
highlighting a whole connection, measurement log, photo check, comparing revisions, offline install,
links to Shape and the Maker Forge home.

## 4. Where it runs

| | In the Claude app (PC) | forge.retr0plus.se/bench/ (PC, phone, tablet, visitors) |
|---|---|---|
| How | `python dev.py <project folder>` serves the app on this PC; it opens in the Claude app's browser pane | Static files in a folder of Maker Forge's one.com website, next to Shape |
| Auto-refresh when a drawing changes | **Yes** | No: shows what was last pushed or opened |
| Ask Claude | Claude in the chat reads what you've selected | Copy for Claude, open claude.ai, or the visitor's own Claude key |
| Projects | Any folder on this PC | Files on the device, a public GitHub repo, the examples |

The same app code runs in both. The only difference is where the files come from.

**Why a folder on forge.retr0plus.se, and not a website of its own.** The one.com plan includes 3
websites. Two are in use (retr0plus.se and forge.retr0plus.se), and every future app would need one
too. So all Maker Forge apps share forge.retr0plus.se, each in its own folder (`/bench/`, later
`/shape/` and `/parts/`), and the last website stays free.
- Each folder sets its own browser rules (section 8), so Bench keeps its strict script rules even
  though Shape needs looser ones.
- Apps at the same address share the browser's saved data. That's how the suite connects without a
  server: a project opened in Bench can be there in Shape. Section 8 covers the price of this.

## 5. How it's built

### 5.1 Files

Each file has one job, and the files without page code run in Node for tests (as Shape's
`core.js` does).

```
src/
  index.html      the page: a shell only, no inline scripts or styles
  style.css       all styles, including Easy reading and the bench mode
  app.js          the screen: tabs, panels, buttons, keyboard; joins the parts below together
  viewer.js       one sheet on screen: zoom, pan, pinch, flip, highlight layer
  sanitize.js     cleans every SVG before it is shown (section 8)            [no page code]
  project.js      reads and checks a project file, or builds one from bare drawings  [no page code]
  sources.js      gets files: picked files, a folder, GitHub, the dev server, examples
  search.js       the text index: every label and where it sits on each sheet  [no page code]
  parts.js        part cards and spotting part names in drawings              [no page code]
  checklist.js    ticks, saved per project and revision                        [no page code]
  ask.js          Ask Claude: the selection for the Claude app, copy, claude.ai, own key
  live.js         listens to dev.py and reloads a changed sheet, keeping zoom and selection
examples/         the fume extractor's drawings + project file, bundled (nothing loads from outside by default)
dev.py            local server with auto-refresh (Python standard library only)
build.py          copies src/ to dist/ with versioned file names for upload
tests/            Node tests + a real-browser check (section 10)
check.sh          runs every test; must end "ALL CHECKS PASSED", like the fume extractor's
```

### 5.2 Why several files and not one, unlike Shape

retr0plus.se's security rules forbid inline scripts (only scripts loaded from files may run) and use
Trusted Types, a browser lock that stops page code from turning text into HTML. Bench follows
the same rules from day one: scripts in their own files, and all screen elements built with
`createElement`/`textContent`, never `innerHTML`. This stops a booby-trapped drawing from running
code. A one-file download for offline use comes in release 1.2, made by `build.py`.

### 5.3 The dev server (`dev.py`)

- Serves the app plus one project folder at `http://127.0.0.1:<port>`, on this PC only and never
  reachable from the network.
- Every half second it checks the project folder's drawings and project file for changes. A change
  is pushed to the page (Server-Sent Events), which reloads just that sheet and keeps your zoom,
  position, selection and ticks.
- Python standard library only, so there's nothing to install. Python 3.12 is already on the PC.
- A `.claude/launch.json` entry so Claude can start it in the browser pane.

The editing loop this gives: you say "move R4 one hole left" → Claude edits `board.py` →
`check.sh` checks it and redraws sheet 4 → Bench reloads sheet 4 by itself.

## 6. The project file (suite-ready)

A small JSON file at the root of a project: **`forge-project.json`**, named after the suite. Every
app in the suite reads it and may add its own section. **Rule: an app keeps every section it
doesn't understand exactly as it found it**, so Shape's section survives a save in Bench and
the other way round.

Only `format`, `version` and `name` are required, and everything else is optional, so a minimal file
is three lines.

```json
{
  "format": "forge-project",
  "version": 1,
  "name": "Solder Fume Extractor",
  "revision": "Rev D",
  "repo": "https://github.com/Retr0Plus95/Solder-Fume-Extractor",
  "sheets": [
    { "id": "SFE-01", "title": "Main schematic",    "file": "docs/schematics/SFE-01_Schematic.svg",      "kind": "schematic" },
    { "id": "SFE-04", "title": "Perfboard layout",  "file": "docs/layout/SFE-04_Perfboard_Layout.svg",   "kind": "layout", "side": "component" }
  ],
  "parts": [
    { "ref": "R6",  "value": "10k",       "type": "resistor",   "role": "Holds Q1 off, so the fans run at 100 % if the controller is dead or in reset (fail-safe)." },
    { "ref": "D1",  "value": "1N5402G",   "type": "diode",      "polarized": true, "orientation": "Band toward the +12 V row", "role": "Reverse-polarity shunt: blows F1 if the supply is connected backwards.", "note": "Legs ~1.3 mm: open the holes up." },
    { "ref": "Q1",  "value": "2N2222A",   "type": "transistor", "polarized": true, "orientation": "Flat face toward row 16 (down)" },
    { "ref": "U2",  "value": "ATmega328P","type": "ic",         "polarized": true, "orientation": "Notch LEFT, in a socket", "datasheet": "https://www.microchip.com/en-us/product/ATmega328P" }
  ]
}
```

| Field | Meaning |
|---|---|
| `revision`, `repo` | Optional. The drawing revision (ticks are saved per revision) and the project's public repo (for "Report a problem" and links). |
| `sheets[].kind` | `schematic`, `layout`, `detail` or `photo`. Only `layout` sheets can be flipped. |
| `sheets[].side` | Which side a layout shows: `component` (default) or `solder`. |
| `parts[]` | `ref` is required. Optional: `value`, `type`, `package`, `role`, `polarized`, `orientation`, `datasheet` (https only), `note`, `qty`. |
| Reserved for later | `board` (outline and openings, for Shape), `build` (steps, wire list), `nets` (connections), `page` (website). Release 1 ignores them but keeps them. |

**With no project file**, Bench still works:
- **Sheets:** every SVG, PNG and JPG it was given.
- **Parts:** text labels that look like part names, meaning one to three capital letters, a number,
  and an optional letter: R6, C1A, U2, SW1, J0. These are shown as *guessed*. The project file is
  always right where it disagrees, which matters for pin names like D7 or A2 that look like parts.

The fume extractor repo gets its own `forge-project.json` as part of release 1.0, and becomes the
built-in example.

## 7. Features in detail

### 7.1 Opening a project
- Drop files or a folder on the page, or use **Open files** / **Open folder**. Folder picking is not
  available on iPhone and iPad browsers; there it offers files or a GitHub link instead.
- **GitHub link:** paste `https://github.com/<owner>/<repo>`. It looks for `forge-project.json` at
  the top. Without one, it lists the repo (one GitHub API request) and takes up to 30 drawings.
  Public repos only in release 1.
- **Examples:** the fume extractor is built in, so the first visit shows something useful and loads
  nothing from other websites.
- **Recent projects:** remembered in this browser only. Local files are kept in the browser's own
  storage (IndexedDB), so reopening doesn't mean picking them again.

### 7.2 Viewing
- Sheet tabs along the top. On a phone, a sheet menu.
- Mouse wheel zooms around the pointer, drag pans, double-click zooms in, `0` fits the sheet,
  `+`/`−`/arrow keys work too. Pinch and two-finger pan on touch screens.
- Zooming scales the whole drawing at once (a CSS transform), so even large KiCad sheets stay smooth.
- SVG stays sharp at any zoom. PNG and JPG zoom too, but go blurry past their size.

### 7.3 Find part
- A search box (shortcut `/`). Typing `R6` lists matches per sheet ("SFE-01: 1, SFE-04: 1").
- Enter jumps to the first match, zooms to it and rings it. `n`/`N` go to the next and previous match.
- It searches all text in the drawings, so `PWMCTL`, `28,12` or `1N5402G` work too.

### 7.4 Part card
Click a part's label, or a search result, to open its card:
- Ref, value, type, its job in the circuit (`role`), any `note`.
- **Polarity warning** for parts that can go in backwards, with the orientation text.
- Datasheet link (opens in a new tab).
- "On sheets: SFE-01, SFE-04", each clickable.
- Buttons: **Show everywhere**, **Mark soldered**, **Ask Claude**.

### 7.5 The same part on every sheet
- Selecting a part highlights it on every sheet, not just the one on screen. Tabs show a dot where
  it appears.
- **Side by side** on screens wider than about 1000 px: two sheets at once, for example the
  schematic and the layout. Selecting R6 on one moves the other to R6.
- Release 1 highlights the part's **label**. On most drawings the label sits next to the part. Exact
  part outlines need position data, which comes from the project file later.

### 7.6 Flip to the solder side
- Only on `layout` sheets. It mirrors the drawing left to right, so it matches what you see from
  underneath.
- Text is turned back so it still reads normally, and column numbers run the other way.
- A clear **SOLDER SIDE** banner shows while flipped, so the two views can't be confused.

### 7.7 Build checklist
- Lists every part (from the project file, or guessed). Ticking one tints its label green on every
  sheet and moves a progress bar.
- Saved in this browser, per project and revision. **Export progress** and **Import progress** move
  it between devices as a small file.
- **When the drawings change** after you ticked something (spotted by comparing a fingerprint of each
  sheet file), the ticks stay, with a note: "Sheet SFE-04 changed since you ticked 12 parts: check
  them." Release 1.4 makes this exact (section "Revision compare" in the roadmap).

### 7.8 Ask Claude
Every route sends the same short **context block**: project, revision, part, value, role, note,
which sheets it's on, and the text near it on the drawing.

| Route | Where | How |
|---|---|---|
| **In the Claude app** | PC, dev server | The app publishes the current selection as `window.makerForge.context()` and on the page. Every Maker Forge app is meant to use this same call, with `"app": "bench"` in Bench's answer. You ask in the chat ("what does this part do?"), and Claude reads the selection from the browser pane and answers with the whole repo in view. |
| **Copy for Claude** | Everywhere | Copies the context block plus your question, to paste into any Claude chat. |
| **Open in claude.ai** | Everywhere | Opens claude.ai with the question filled in. *To verify:* that claude.ai accepts a pre-filled question in the link. If it doesn't, this becomes "copy, then open claude.ai". |
| **Your own Claude key** | Everywhere, optional | Same design as Shape's AI help: the key is kept only in this browser's memory, unless "remember" is ticked. It is only ever sent to `api.anthropic.com`, and answers show inside the card. Ollama on your own computer as an alternative. The model choice and settings are decided in the implementation plan, using the current Claude API reference. Sharing one key with Shape comes at 2.0, agreed with Shape's own session; release 1 keeps its own. |

### 7.9 Auto-refresh (dev server only)
- When a drawing or the project file changes, only that sheet reloads. Zoom, position, selection
  and ticks stay.
- If a file is half-written at that moment (as happened with `render.py` on Windows), the app keeps
  the last good version and shows "SFE-04 couldn't be read; keeping the previous one" until the next
  good save.

### 7.10 Easy reading and the bench
- Text size up to 175 %, high contrast, the Atkinson Hyperlegible font, and less motion, matching
  Shape and retr0plus.se.
- Light and dark themes. Dark is the default at the bench because it causes less glare.
- **Keep screen on** (the browser's Wake Lock) while a project is open on a tablet.
- Touch targets at least 44 px, for fingers with flux on them.
- No sideways scrolling at 375 px wide (the site's own rule).

## 8. Security and privacy

**Visitors' files are untrusted.** An SVG can carry scripts, links and remote pictures. Every SVG is
cleaned by `sanitize.js` before it reaches the page:
- It is parsed in a detached document first, never inserted as raw text.
- An **allowlist** of SVG elements and attributes is kept, and everything else is removed. That
  includes `script`, `foreignObject`, every `on…` attribute, `javascript:` and `data:text/html`
  links, and links or `url(...)` pointing outside the file.
- `<use>` may only point inside the same file. `<image>` may only use pictures embedded in the file.
- Limits: 25 MB per file, and 200,000 elements per sheet, so a giant file can't freeze the page.

**The browser rules (CSP)** for `forge.retr0plus.se/bench/`, set by a `.htaccess` file in that folder:
- `script-src 'self'` plus Trusted Types: only the app's own script files run.
- `style-src 'self' 'unsafe-inline'`: drawings style themselves with inline styles, which retr0plus.se
  forbids. That's the main reason Bench lives on forge.retr0plus.se and not on the main site.
  Inline styles can't run code. The one risk, a style loading a remote picture to track you, is
  blocked twice: the cleaner removes outside links, and the rules below allow no unknown sites.
- `img-src 'self' blob: data: https://raw.githubusercontent.com`; `connect-src 'self'
  https://raw.githubusercontent.com https://api.github.com https://api.anthropic.com
  http://localhost:11434`; `frame-ancestors 'none'`; `base-uri 'none'`; `form-action 'none'`.

**Sharing an address with Shape.** Apps at the same address share the browser's storage, so a
security hole in one app could read the other's saved data (projects, ticks, a remembered Claude
key). Because of that:
- Bench keeps the strict rules above, whatever Shape needs for itself.
- Everything Bench saves has a `bench.` prefix, and its files go in its own IndexedDB database, so
  the apps never overwrite each other.
- **Forget everything** clears only Bench's own data, never Shape's autosave.

**Privacy**
- Nothing is uploaded to retr0plus.se. No cookies, no analytics, no tracking.
- **Nothing loads from other websites unless the visitor asks for it**: opening a GitHub link fetches
  from GitHub, and asking with their own key talks to Anthropic. The built-in examples are served
  from Bench's own folder.
- Projects, ticks and settings live only in the visitor's browser, with a **Forget everything**
  button.

## 9. When things go wrong

Every message says what happened and what to try, in plain words:
- A file it can't read: names the file and says why (not SVG/PNG/JPG, too big, broken).
- An SVG with no searchable text: "This drawing's text is drawn as shapes, so Find part can't read
  it. PDF support (coming) or a project file fixes that." Zoom, flip and the checklist still work.
- GitHub: not found, private repo, or the hourly limit reached ("GitHub allows 60 lookups an hour
  without signing in; try again at 14:05"), each with its own message.
- Claude: wrong key, no credit or network errors, shown in the card exactly as Shape does.
- The dev server stopped: a small "Auto-refresh paused" badge, which reconnects by itself.

## 10. Testing

**Node tests** (`tests/`, run by `check.sh`):
- `sanitize`: a collection of nasty SVGs (scripts, event attributes, `foreignObject`, outside links,
  `javascript:` in every spelling, huge files), all of which must come out harmless. Plus the fume
  extractor's five sheets, which must come out looking identical.
- `project`: valid and broken project files, unknown sections kept untouched, the three-line minimum.
- `parts`: guessing part names on the fume extractor's sheets: R6, C1A, U2 found, `+12V` and `SFE-01` not.
  `D4`, which is a *pin* label on J6 of sheet 4, is shown as guessed, and the project file corrects it.
- `search`: every label indexed, with the right sheet and position.
- `checklist`: save, reload, a new revision, export and import. Saved names all carry the `bench.`
  prefix, and **Forget everything** leaves other apps' data alone.

**Browser check** (Playwright in real Chromium, like Shape's `check:browser`), at 375 px and at
desktop size: open the fume extractor example, find R6, open its card, flip SFE-04, tick three
parts, reload, and confirm the ticks stayed. Also: no sideways scrolling, and no errors in the
console.

**Before 1.0 ships:** checked by hand on the owner's real phone and tablet, plus one real KiCad export
(section 11).

## 11. Risks to check early

| Risk | Why it matters | Plan |
|---|---|---|
| **KiCad SVGs may draw text as lines, not text** | Find part, part cards and the checklist would see no part names in KiCad drawings | First task of release 0.1: export a real KiCad 8/9 schematic as SVG and look. If the text is lines, KiCad's PDF export keeps searchable text, which moves PDF support earlier. |
| Folder picking on iPhone/iPad | Not supported by those browsers | Files or a GitHub link there (section 7.1) |
| GitHub's limit of 60 lookups an hour without signing in | Heavy use could hit it | One lookup per project open, then raw files, which don't count |
| Selection reading in the Claude app | Relies on Claude's access to the browser pane | Copy for Claude always works as the fallback |
| claude.ai pre-filled link | Not confirmed | Fallback in section 7.8 |
| Shape's automatic updates touching `/bench/` | `tools/forge-update.mjs` uploads Shape to the site's root and might delete what it didn't upload | Checked in the website repo before the first upload (section 12) |

## 12. Website and hosting work (done in the website's own repo and Claude session, not from here)

The website's CLAUDE.md says each app is worked on in its own repo and session. These steps belong
to the website project:
1. A `/bench/` folder on forge.retr0plus.se with its own `.htaccess`, holding the rules in section 8.
   First check that `tools/forge-update.mjs`, which uploads Shape to the site's root, never deletes
   or overwrites `/bench/`.
2. Keeping `/bench/` up to date the way `forge-update` does for Shape: when Bench's `main` branch
   changes, the desktop runs `check.sh`, builds and uploads. A commit that fails its checks never
   goes up.
3. A Workbench page entry: `id: "maker-forge-bench"`, `name: "Maker Forge Bench"`, `type: "Web app"`,
   `madeByMe: true`, with a link to the app and to its repo.
4. Later (roadmap 2.0): Shape moves to `/shape/`, the site's root becomes the Maker Forge home, old
   links are redirected, and project pages get an "Open in Maker Forge Bench" button.

## 13. Decisions for the owner

**Decided on 2026-11-12**
1. **Name:** Maker Forge Bench ("Bench" for short), in a suite called **Maker Forge**. It couldn't be
   "Workbench", which is already the name of the site page that will list it.
2. **Hosting:** the folder `forge.retr0plus.se/bench/` (section 4), which keeps the plan's last free
   website for something else.
3. **Project file name:** `forge-project.json`, which matches the suite's name.

**Still open**
4. **Language.** English only at first, or Swedish too. This design assumes English for release 1.

## 14. What happens after this design is approved

The owner reviews this document and `ROADMAP.md`. Then an implementation plan is written for
release 0.1, and the work moves into a Claude session opened on this folder. The app gets its own
GitHub repo, suggested name `Maker-Forge-Bench`, created by the owner (or with the `gh` tool, which
isn't installed yet). The local folder `G:\Bench-Forge` can be renamed to match at the same time.
