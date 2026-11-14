# The Maker Forge Library

The 3D models Maker Forge Bench draws real parts with (from 0.9). It's the first piece of the
shared library the whole suite will use (see ROADMAP.md, "The Maker Forge Library").

- `index.json`: every part: its id, name, Bench part type (`kind`), footprint pins (mm from pin 1,
  y up as seen from above), model file, size (`box`, in mm), the material Bench paints (`body`),
  what Bench paints on it (`paint`), the facts the matcher picks it by (`fit`), and where it came
  from (`source`).
- `models/<id>.glb`: the models, in mm, origin at pin 1, z up from the board.
- `LICENSE-KICAD-3D.md`: KiCad's models are CC-BY-SA 4.0; ours are MIT.

Nothing here needs KiCad. The models were converted once and committed; Bench only reads the files.

## Add a KiCad part

1. Find the model under KiCad's `share/kicad/3dmodels/<Library>.3dshapes/` (it needs a `.wrl`; the
   converter can't read STEP) and its footprint under `share/kicad/footprints/<Library>.pretty/`.
2. Add a row to `tools/kicad3d-parts.tsv`: id, kind, paint, model path, footprint path, name, fit.
3. Run, on a computer with KiCad:

   ```
   python tools/kicad3d.py --kicad "D:\KiCad" --list tools/kicad3d-parts.tsv --ours tools/our-models --out src/library
   ```

4. Commit `tools/kicad3d-parts.tsv`, `src/library/index.json` and the new `.glb`. The converter
   writes the same bytes every time, so other models don't change.

`python -m unittest discover -s tests/python` checks that `index.json` and `models/` match, that
each model is under 250 KB and all of them under 8 MB, and that the licence file is here.

## Add a model we make ourselves

For a part no free library has, describe it as boxes and cylinders measured from its datasheet, in
`tools/our-models/<id>.json` (see `mp1584-module.json`): `shapes` are
`{"box": [x, y, z, w, d, h]}` or `{"cyl": [x, y, z, r, h]}` in mm, each with a `name` (metal
names start with `MET-` or `PIN-`), a `colour` and `metal`. Then run the converter as above.
Models we make are MIT.

## What's here (Bench 0.9)

190 models from KiCad 9.0.6 (6.5 MB): resistors lying flat and standing, ceramic and film
capacitors, electrolytics 4–16 mm, DO-35/DO-41/DO-201AD diodes lying and standing, 3 and 5 mm
LEDs, TO-92 and TO-220, DIP-8 to DIP-40 plain and in sockets, pin headers and female headers
(1 and 2 rows), bent headers, screw terminals (5.08 and 3.5 mm), crystals, trimmers, 6 mm
buttons, slide and DIP switches, Molex KK and JST XH, barrel jacks, USB-A, buzzers and relays.

Made by Maker Forge (MIT): the MP1584 buck module, a 9 mm potentiometer (Alps RK09K style) and a
12 mm push button.

**Still missing** (KiCad has no `.wrl` for them, so they're next to make ourselves): USB-B and
micro-USB through-hole sockets, Bourns PTV09 pots, and 12 mm buttons with square caps.

## More sources later

Other free libraries and databases for models and datasheets come with the Parts app, once each
one's licence is checked (the licence decides whether we can ship the files or only link to
them): Fritzing's parts, the FreeCAD parts library, the open LCSC/JLCPCB parts database, and the
datasheet links in KiCad's symbol libraries.
