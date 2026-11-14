# Licence of the KiCad 3D models in this folder

**3D models from the KiCad libraries, kicad.org.**

Most models in `models/` (every entry in `index.json` whose `source.from` is "KiCad 9.0.6") come
from KiCad's 3D model library, kicad-packages3D, as shipped with KiCad 9.0.6. Copyright the KiCad
library contributors (the files say "Copyright (C) 2017, kicad StepUp").

They are licensed under the **Creative Commons Attribution-ShareAlike 4.0 International licence
(CC-BY-SA 4.0)**: https://creativecommons.org/licenses/by-sa/4.0/legalcode

KiCad adds an exception to that licence: designs you make with the models are yours, and don't have
to be shared under any licence. The exception doesn't cover passing the models on as a collection,
which this folder does. So these converted models, as a collection, are under plain CC-BY-SA 4.0,
and so is anything made by changing them. KiCad explains the licence and its exception here:
https://www.kicad.org/libraries/license/ and
https://github.com/KiCad/kicad-packages3D/blob/master/LICENSE.md

## What was changed

Maker Forge Bench's `tools/kicad3d.py` converted each model from VRML (`.wrl`) to binary glTF
(`.glb`), so browsers can show it:

- every shape of one material merged into one mesh, and a shape the model repeats unchanged (a
  socket's contacts, a header's pins) stored once and placed again for each copy;
- sizes changed from 0.1 inch to mm, and points rounded to a grid of 0.001 mm (0.002 mm or more for
  models longer than 32 mm), stored as whole steps with the step written in the file;
- surface normals worked out again, keeping edges sharp beyond 30°;
- colours and transparency kept; metal or not taken from the material's name, and roughness from
  its shininess.

No shapes were added or removed.

## Not KiCad's

Entries whose `source.from` is "Maker Forge" (such as `mp1584-module`) are models Maker Forge made
itself from datasheets. They are under the MIT licence, like the rest of Maker Forge Bench.

## Disclaimer

KiCad's models come without warranty of any kind, express or implied. As their files say: use 3D
CAD data at your own risk, and don't rely on it without checking it yourself.
