"""Converts KiCad's 3D models (.wrl) into small GLB files for the Maker Forge Library (Bench 0.9).

Run it once, on a computer with KiCad, and commit what it writes:
    python tools/kicad3d.py --kicad D:\\KiCad --list tools/kicad3d-parts.tsv --ours tools/our-models \\
        --modules tools/shape-boards.json --out src/library

KiCad's .wrl files all come from the same exporter ("kicad StepUp wrl exported"): a list of
materials (DEF name Material {...}), then shapes made of faces (IndexedFaceSet) that USE them.
One VRML unit is 0.1 inch, the origin is pin 1 and Z points up; the GLB keeps that frame, in mm.
Only Python's own library is used, and the output is the same bytes every time.
"""
from __future__ import annotations

import argparse
import json
import math
import re
import struct
import sys
from pathlib import Path

UNIT = 2.54  # mm in one VRML unit
WELD = 1000  # points are welded on a 0.001 mm grid
CREASE = math.cos(math.radians(30))  # edges sharper than 30° stay sharp
MAX_MODEL = 250 * 1024
MAX_TOTAL = 8 * 1024 * 1024
# KiCad's exception (designs made with the models stay yours) doesn't cover passing the models on as a
# collection, which the library does, so its KiCad models are plain CC-BY-SA 4.0 (LICENSE-KICAD-3D.md).
LICENCE = "CC-BY-SA-4.0"
KICAD_VERSION = "KiCad 9.0.6"
LICENSE_FILE = "LICENSE-KICAD-3D.md"

_MATERIAL = re.compile(r"material\s+DEF\s+(\S+)\s+Material\s*\{([^}]*)\}")
_SHAPE = re.compile(r"geometry\s+IndexedFaceSet\s*\{(.*?)\}\s*\}\s*appearance\s+Appearance\s*\{\s*material\s+(?:USE\s+(\S+)|DEF\s+(\S+)\s+Material\s*\{[^}]*\}|Material\s*\{([^}]*)\})", re.S)
_FIELD = re.compile(r"(diffuseColor|shininess|transparency)\s+([-\d.eE+\s]+?)(?=\s+[a-zA-Z]|\s*$)")


def _numbers(text: str) -> list[float]:
    return [float(t) for t in re.split(r"[\s,]+", text.strip()) if t]


def _material_fields(body: str) -> dict:
    fields = {"colour": (0.8, 0.8, 0.8), "shininess": 0.3, "transparency": 0.0}
    for name, value in _FIELD.findall(body):
        nums = _numbers(value)
        if name == "diffuseColor" and len(nums) >= 3:
            fields["colour"] = tuple(nums[:3])
        elif name == "shininess" and nums:
            fields["shininess"] = nums[0]
        elif name == "transparency" and nums:
            fields["transparency"] = nums[0]
    return fields


def parse_vrml(text: str) -> list[dict]:
    """One dict per shape: material, colour, transparency, shininess, points (VRML units), faces."""
    materials = {name: _material_fields(body) for name, body in _MATERIAL.findall(text)}
    shapes = []
    for geo, used, defined, unnamed in _SHAPE.findall(text):
        name = used or defined
        if not name:  # an older style: the shape's own unnamed material, named here by its colour
            fields = _material_fields(unnamed)
            name = "MAT-" + "".join(f"{round(c * 255):02X}" for c in fields["colour"])
            materials.setdefault(name, fields)
        index = re.search(r"coordIndex\s*\[([^\]]*)\]", geo)
        point = re.search(r"point\s*\[([^\]]*)\]", geo)
        if not index or not point:
            continue
        nums = _numbers(point.group(1))
        points = [tuple(nums[i:i + 3]) for i in range(0, len(nums) - 2, 3)]
        faces, face = [], []
        for i in (int(v) for v in _numbers(index.group(1))):
            if i < 0:
                if len(face) >= 3:
                    faces.append(face)
                face = []
            else:
                face.append(i)
        if len(face) >= 3:
            faces.append(face)
        mat = materials.get(name, _material_fields(""))
        shapes.append({"material": name, **mat, "points": points, "faces": faces})
    return shapes


def footprint_pins(mod_text: str) -> dict:
    """The footprint's through-hole pads in number order, in mm from pin 1 with y upwards, and the drill."""
    pads = []
    for m in re.finditer(r'\(pad\s+"([^"]*)"\s+thru_hole\b(.*?)\(layers', mod_text, re.S):
        number, body = m.group(1), m.group(2)
        at = re.search(r"\(at\s+([-\d.]+)\s+([-\d.]+)", body)
        drill = re.search(r"\(drill\s+(?:oval\s+)?([-\d.]+)", body)
        if not number or number == "MP" or not at:  # "MP": a mounting pad (a pot's or jack's tabs), not a pin
            continue
        pads.append((number, float(at.group(1)), float(at.group(2)), float(drill.group(1)) if drill else None))
    if not pads:
        return {"pins": [], "drill": None}
    key = lambda p: (0, int(p[0]), "") if p[0].isdigit() else (1, 0, p[0])  # noqa: E731
    seen, ordered = set(), []
    for pad in sorted(pads, key=key):
        if pad[0] not in seen:  # a pad number twice (big pads split in two): the first one
            seen.add(pad[0])
            ordered.append(pad)
    x0, y0 = ordered[0][1], ordered[0][2]
    pins = [[_r(p[1] - x0), _r(-(p[2] - y0))] for p in ordered]
    drills = [p[3] for p in ordered if p[3] is not None]
    return {"pins": pins, "drill": min(drills) if drills else None}


def _r(v: float, places: int = 4) -> float:
    v = round(v, places)
    return 0.0 if v == 0 else (int(v) if v == int(v) else v)


def _sub(a, b):
    return (a[0] - b[0], a[1] - b[1], a[2] - b[2])


def _cross(a, b):
    return (a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0])


def _unit(v):
    n = math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2])
    return (v[0] / n, v[1] / n, v[2] / n) if n > 0 else (0.0, 0.0, 1.0)


def _dot(a, b):
    return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]


def _mesh(name: str, colour, metal: bool, roughness: float, alpha: float, triangles: list) -> dict:
    """Welded points, crease-aware normals and indices from a list of triangles (three mm points each)."""
    welded: dict = {}
    corners = []  # per triangle: three welded point ids
    for tri in triangles:
        ids = []
        for p in tri:
            key = (round(p[0] * WELD), round(p[1] * WELD), round(p[2] * WELD))
            ids.append(welded.setdefault(key, len(welded)))
        if len(set(ids)) == 3:
            corners.append(ids)
    points = [None] * len(welded)
    for key, i in welded.items():
        points[i] = (key[0] / WELD, key[1] / WELD, key[2] / WELD)
    face_normals, around = [], {}
    for t, (a, b, c) in enumerate(corners):
        n = _cross(_sub(points[b], points[a]), _sub(points[c], points[a]))  # length = 2 × area: area-weighted
        face_normals.append(n)
        for i in (a, b, c):
            around.setdefault(i, []).append(t)
    vertices: dict = {}
    positions, normals, indices = [], [], []
    for t, tri in enumerate(corners):
        own = _unit(face_normals[t])
        for i in tri:
            total = [0.0, 0.0, 0.0]
            for other in around[i]:
                if _dot(own, _unit(face_normals[other])) >= CREASE:
                    total = [total[k] + face_normals[other][k] for k in range(3)]
            n = _unit(tuple(total))
            q = (round(n[0] * 127), round(n[1] * 127), round(n[2] * 127))  # stored as int8 (KHR_mesh_quantization)
            key = (i, q)
            if key not in vertices:
                vertices[key] = len(vertices)
                positions.append(points[i])
                normals.append(q)
            indices.append(vertices[key])
    return {"name": name, "colour": tuple(colour), "metal": metal, "roughness": roughness, "alpha": alpha,
            "positions": positions, "normals": normals, "indices": indices}


def _linear(c: float) -> float:
    """An sRGB colour channel (as KiCad and our specs give them) turned linear, as glTF stores colours."""
    return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4


def _pad4(b: bytes, fill: bytes) -> bytes:
    return b + fill * ((4 - len(b) % 4) % 4)


def _step(meshes: list[dict]) -> float:
    """The int16 position step: 0.001 mm (the weld grid) doubled until the farthest point fits."""
    far = max((abs(c) for m in meshes for p in m["positions"] for c in p), default=0.0)
    step = 0.001
    while far / step > 32767:
        step *= 2
    return round(step, 4)


def write_glb(meshes: list[dict]) -> bytes:
    """A binary glTF 2.0 file in mm: one node, mesh and material per input mesh.

    Positions are int16 and normals int8 (KHR_mesh_quantization, which three.js r128 reads), half
    the bytes of float32; each node's scale turns the int16 steps back into mm.
    """
    blob = bytearray()
    views, accessors, gl_meshes, materials, nodes = [], [], [], [], []
    step = _step(meshes)

    def view(data: bytes, target: int, stride: int | None = None) -> int:
        while len(blob) % 4:
            blob.append(0)
        v = {"buffer": 0, "byteOffset": len(blob), "byteLength": len(data), "target": target}
        if stride:
            v["byteStride"] = stride
        views.append(v)
        blob.extend(data)
        return len(views) - 1

    for k, m in enumerate(meshes):
        if not m["indices"]:
            continue
        pos = [tuple(round(c / step) for c in p) for p in m["positions"]]
        lo = [min(p[i] for p in pos) for i in range(3)]
        hi = [max(p[i] for p in pos) for i in range(3)]
        pv = view(b"".join(struct.pack("<3hxx", *p) for p in pos), 34962, 8)
        accessors.append({"bufferView": pv, "componentType": 5122, "count": len(pos), "type": "VEC3",
                          "min": lo, "max": hi})
        pa = len(accessors) - 1
        nv = view(b"".join(struct.pack("<3bx", *n) for n in m["normals"]), 34962, 4)
        accessors.append({"bufferView": nv, "componentType": 5120, "normalized": True,
                          "count": len(m["normals"]), "type": "VEC3"})
        na = len(accessors) - 1
        big = len(pos) > 65535
        iv = view(struct.pack(f"<{len(m['indices'])}{'I' if big else 'H'}", *m["indices"]), 34963)
        accessors.append({"bufferView": iv, "componentType": 5125 if big else 5123, "count": len(m["indices"]), "type": "SCALAR"})
        ia = len(accessors) - 1
        mat = {"name": m["name"], "pbrMetallicRoughness": {
            "baseColorFactor": [_r(_linear(c)) for c in m["colour"]] + [_r(m["alpha"])],
            "metallicFactor": 1 if m["metal"] else 0, "roughnessFactor": _r(m["roughness"])}}
        if m["alpha"] < 1:
            mat["alphaMode"] = "BLEND"
        if mat not in materials:
            materials.append(mat)
        gl_meshes.append({"name": m["name"], "primitives": [{"attributes": {"POSITION": pa, "NORMAL": na},
                                                              "indices": ia, "material": materials.index(mat)}]})
        for move in m.get("copies") or [(0, 0, 0)]:  # a shape repeated in the model: one mesh, a node per copy
            node = {"mesh": len(gl_meshes) - 1}
            if any(move):
                node["translation"] = [round(v / step) for v in move]  # in int16 steps, under the root's scale
            nodes.append(node)
    nodes.append({"name": "model", "children": list(range(len(nodes))), "scale": [step, step, step]})
    doc = {"asset": {"version": "2.0", "generator": "Maker Forge Bench tools/kicad3d.py"},
           "extensionsUsed": ["KHR_mesh_quantization"], "extensionsRequired": ["KHR_mesh_quantization"],
           "scene": 0, "scenes": [{"nodes": [len(nodes) - 1]}], "nodes": nodes, "meshes": gl_meshes,
           "materials": materials, "accessors": accessors, "bufferViews": views,
           "buffers": [{"byteLength": len(_pad4(bytes(blob), b"\0"))}]}
    js = _pad4(json.dumps(doc, sort_keys=True, separators=(",", ":")).encode("utf-8"), b" ")
    bn = _pad4(bytes(blob), b"\0")
    total = 12 + 8 + len(js) + 8 + len(bn)
    return (struct.pack("<4sII", b"glTF", 2, total) + struct.pack("<II", len(js), 0x4E4F534A) + js
            + struct.pack("<II", len(bn), 0x004E4942) + bn)


def _is_metal(name: str) -> bool:
    return name.upper().startswith(("PIN-", "MET-"))


def _box(meshes: list[dict]) -> list:
    pts = [(p[0] + d[0], p[1] + d[1], p[2] + d[2])
           for m in meshes for d in (m.get("copies") or [(0, 0, 0)]) for p in m["positions"]]
    return [[_r(min(p[i] for p in pts), 3) for i in range(3)], [_r(max(p[i] for p in pts), 3) for i in range(3)]]


def _area(m: dict) -> float:
    total = 0.0
    idx, pos = m["indices"], m["positions"]
    for t in range(0, len(idx), 3):
        a, b, c = pos[idx[t]], pos[idx[t + 1]], pos[idx[t + 2]]
        n = _cross(_sub(b, a), _sub(c, a))
        total += math.sqrt(_dot(n, n)) / 2
    return total * len(m.get("copies") or [0])


def _material(shape: dict) -> tuple:
    return (shape["colour"], _is_metal(shape["material"]), min(0.9, max(0.15, 1 - shape["shininess"])),
            1 - shape["transparency"])


def convert(wrl_text: str, mod_text: str | None, *, id: str) -> tuple[bytes, dict]:
    """A KiCad .wrl (and its footprint) as GLB bytes, plus its index entry without file and bytes.

    Shapes are merged into one mesh per material, except a shape the model repeats unchanged in other
    places (a socket's 40 contacts, a header's pins): that is stored once and placed by a node per copy.
    """
    groups: dict = {}  # same material, faces and shape, anywhere: [first shape, its points, faces, [offsets]]
    for shape in parse_vrml(wrl_text):
        pts = [(p[0] * UNIT, p[1] * UNIT, p[2] * UNIT) for p in shape["points"]]
        faces = [f for f in shape["faces"] if all(i < len(pts) for i in f)]
        if not faces:
            continue
        o = pts[0]
        key = (shape["material"], tuple(tuple(f) for f in faces),
               tuple(round(p[i] - o[i], 3) for p in pts for i in range(3)))
        if key not in groups:
            groups[key] = [shape, pts, faces, []]
        first = groups[key][1][0]
        move = tuple(round(o[i] - first[i], 3) for i in range(3))
        if move not in groups[key][3]:  # the same shape twice in one place is drawn once
            groups[key][3].append(move)

    def triangles(pts, faces):
        return [(pts[f[0]], pts[f[k]], pts[f[k + 1]]) for f in faces for k in range(1, len(f) - 1)]

    merged: dict = {}  # material name -> [shape, triangles]
    shared = []
    for shape, pts, faces, moves in groups.values():
        tris = triangles(pts, faces)
        if len(moves) > 1 and (len(moves) - 1) * len(tris) * 18 > 350 + 40 * len(moves):
            shared.append((shape, tris, moves))  # ~18 bytes a triangle against ~350 a mesh and ~40 a node
        else:
            for move in moves:
                merged.setdefault(shape["material"], [shape, []])[1].extend(
                    tuple((p[0] + move[0], p[1] + move[1], p[2] + move[2]) for p in t) for t in tris)
    meshes = []
    for name, (shape, tris) in merged.items():
        meshes.append(_mesh(name, *_material(shape), tris))
    for shape, tris, moves in shared:
        mesh = _mesh(shape["material"], *_material(shape), tris)
        mesh["copies"] = moves
        meshes.append(mesh)
    meshes = [m for m in meshes if m["indices"]]
    if not meshes:
        raise ValueError(f"{id}: the model has no faces")
    plastic: dict = {}
    for m in meshes:
        if not m["metal"]:
            plastic[m["name"]] = plastic.get(m["name"], 0.0) + _area(m)
    body = max(plastic, key=plastic.get) if plastic else None
    fp = footprint_pins(mod_text) if mod_text else {"pins": [], "drill": None}
    entry = {"id": id, "footprint": {"pins": fp["pins"], "pitch": 2.54, "drill": fp["drill"]},
             "model": {"box": _box(meshes), "body": body}}
    return write_glb(meshes), entry


def _box_triangles(x, y, z, w, d, h):
    c = [(x + dx, y + dy, z + dz) for dz in (0, h) for dy in (0, d) for dx in (0, w)]
    quads = [(0, 2, 3, 1), (4, 5, 7, 6), (0, 1, 5, 4), (2, 6, 7, 3), (0, 4, 6, 2), (1, 3, 7, 5)]
    return [t for q in quads for t in ((c[q[0]], c[q[1]], c[q[2]]), (c[q[0]], c[q[2]], c[q[3]]))]


def _cyl_triangles(x, y, z, r, h, sides=24):
    ring = [(x + r * math.cos(2 * math.pi * k / sides), y + r * math.sin(2 * math.pi * k / sides)) for k in range(sides)]
    tris = []
    for k in range(sides):
        a, b = ring[k], ring[(k + 1) % sides]
        tris += [((a[0], a[1], z), (b[0], b[1], z), (b[0], b[1], z + h)), ((a[0], a[1], z), (b[0], b[1], z + h), (a[0], a[1], z + h))]
        tris += [((x, y, z + h), (a[0], a[1], z + h), (b[0], b[1], z + h)), ((x, y, z), (b[0], b[1], z), (a[0], a[1], z))]
    return tris


def build_ours(spec: dict) -> tuple[bytes, dict]:
    """A model we make ourselves, from boxes and cylinders measured off its datasheet (MIT)."""
    groups: dict = {}
    order = []
    for k, shape in enumerate(spec["shapes"]):
        colour = tuple(shape.get("colour", (0.6, 0.6, 0.6)))
        metal = bool(shape.get("metal", False))
        name = shape.get("name") or f"{'MET' if metal else 'BODY'}-{k:02d}"
        tris = _box_triangles(*shape["box"]) if "box" in shape else _cyl_triangles(*shape["cyl"])
        key = (name, colour, metal) if not shape.get("copies") else (name, colour, metal, k)  # repeated: its own mesh
        if key not in groups:
            groups[key] = []
            order.append(key)
        groups[key].extend(tris)
    meshes = []
    for key in order:
        name, colour, metal = key[:3]
        mesh = _mesh(name, colour, metal, 0.3 if metal else 0.6, 1.0, groups[key])
        if len(key) == 4:  # one shape placed once per copy (a module's header pins), as convert() does
            mesh["copies"] = [tuple(c) for c in spec["shapes"][key[3]]["copies"]]
        meshes.append(mesh)
    plastic = [m for m in meshes if not m["metal"]]
    entry = {"id": spec["id"], "name": spec["name"], "kind": spec["kind"], "mount": spec.get("mount", "tht"),
             "footprint": {"pins": spec["footprint"]["pins"], "pitch": spec["footprint"].get("pitch", 2.54),
                           "drill": spec["footprint"].get("drill")},
             "model": {"box": _box(meshes), "body": spec.get("body") or (max(plastic, key=_area)["name"] if plastic else None)},
             "paint": spec.get("paint"), "source": spec.get("source") or {"from": "Maker Forge", "licence": "MIT"}}
    entry["fit"] = spec.get("fit", {})
    if "module" in spec:
        entry["module"] = spec["module"]
    return write_glb(meshes), entry


# ---- Shape's boards and modules (Bench 1.0): tools/shape-boards.json, copied from Maker Forge Shape b6e372b ----
SHAPE_DATA = "Maker Forge Shape b6e372b"
PCB_T = 1.6  # the module's board
HEADER_H = 2.5  # a module with pins stands on its male header's plastic strip
PIN_LOW = -3.0  # its pins go down through the perfboard under it
PIN_SIDE = 0.64
SCREW_R = {"M2": 1.1, "M2.5": 1.35, "M3": 1.6, "M4": 2.1}
# each port's face (width, height) is Shape's opening size for that kind; the depth into the board is our call
PORT_FACE = {"usbb": (12.2, 11), "dcpcb": (9.2, 11.2), "micro": (8.2, 3.2), "usbc": (9.2, 3.4), "usbmini": (7.8, 4.2),
             "usba": (13.2, 5.8), "usba2": (13.6, 14.8), "rj45": (16.2, 13.8), "hdmi": (15.4, 6.2), "hdmimicro": (7.6, 3.8),
             "hdmimini": (11.6, 4.2), "jack35": (6.2, 6.2)}
PORT_DEPTH = {"usbb": 16, "dcpcb": 14, "micro": 5.5, "usbc": 7.3, "usbmini": 7.5, "usba": 14, "usba2": 17, "rj45": 21,
              "hdmi": 11, "hdmimicro": 7.5, "hdmimini": 7.5, "jack35": 12}
METAL_PORTS = {"usbb", "micro", "usbc", "usbmini", "usba", "usba2", "hdmi", "hdmimicro", "hdmimini"}
PCB_COLOURS = {"arduino": (0.0, 0.47, 0.55), "pi": (0.12, 0.45, 0.24), "esp": (0.1, 0.1, 0.12), "mcu": (0.13, 0.24, 0.55),
               "power": (0.1, 0.32, 0.66), "motor": (0.12, 0.3, 0.62), "module": (0.32, 0.16, 0.46)}
DARK = (0.05, 0.05, 0.05)
GOLD = (0.83, 0.69, 0.22)
STEEL = (0.78, 0.78, 0.8)


def _turner(turn: int, corner):
    """Shape's frame (x along w, y along d, from the board's lower-left corner) to the model's."""
    c, s = {0: (1, 0), 90: (0, 1), 180: (-1, 0), 270: (0, -1)}[turn]
    return lambda x, y: (corner[0] + c * x - s * y, corner[1] + s * x + c * y)


def _rect(to, x0, y0, x1, y1):
    """A rectangle in Shape's frame as (x, y, w, d) in the model's."""
    a, b = to(x0, y0), to(x1, y1)
    return _r(min(a[0], b[0])), _r(min(a[1], b[1])), _r(abs(b[0] - a[0])), _r(abs(b[1] - a[1]))


def _pin_rows(pins: list) -> list:
    """The header strips under a module's pins: (x, y, w, d) each, split where a row skips a place."""
    xs = {round(p[0], 2) for p in pins}
    ys = {round(p[1], 2) for p in pins}
    along_y = len(xs) <= len(ys)
    lines: dict = {}
    for x, y in pins:
        lines.setdefault(round(x, 2) if along_y else round(y, 2), []).append(y if along_y else x)
    strips = []
    for line in sorted(lines):
        values = sorted(lines[line])
        runs = [[values[0], values[0]]]
        for v in values[1:]:
            if v - runs[-1][1] > 2.54 * 1.5:
                runs.append([v, v])
            else:
                runs[-1][1] = v
        for lo, hi in runs:
            a, b = _r(lo - 1.27), _r(hi - lo + 2.54)
            strips.append((_r(line - 1.27), a, 2.54, b) if along_y else (a, _r(line - 1.27), b, 2.54))
    return strips


def module_spec(board: dict, footprint_text: str | None) -> dict:
    """A board or module from Shape's list as a spec for build_ours, with Shape's facts for its part card.

    With pins (KiCad's footprint, else our own rows) it stands on its header, its origin at pin 1; the board is
    turned and placed by the data's "turn" and "corner" when it gives them, else centred on the pins. Without pins
    it lies on the board under it from its lower-left corner, like the MP1584. Either way mm, x right, y up, z up.
    """
    w, d = board["w"], board["d"]
    if board.get("kicad") and footprint_text:
        fp = footprint_pins(footprint_text)
        pins, drill = fp["pins"], fp["drill"]
    elif board.get("pins"):
        pins, drill = [[_r(x), _r(y)] for x, y in board["pins"]], 1.0
    else:
        pins, drill = [], None
    if pins and "turn" in board:
        turn, corner = board["turn"], board["corner"]
    elif pins:
        xs, ys = [p[0] for p in pins], [p[1] for p in pins]
        cx, cy, span_x, span_y = (min(xs) + max(xs)) / 2, (min(ys) + max(ys)) / 2, max(xs) - min(xs), max(ys) - min(ys)
        turn = 90 if (span_x > w or span_y > d) and span_x <= d and span_y <= w else 0
        corner = (cx - w / 2, cy - d / 2) if turn == 0 else (cx + d / 2, cy - w / 2)
    else:
        turn, corner = 0, (0, 0)
    to = _turner(turn, corner)
    base = HEADER_H if pins else 0
    top = base + PCB_T
    body = f"PCB-{board['group'].upper()}"
    x, y, bw, bd = _rect(to, 0, 0, w, d)
    shapes = [{"name": body, "box": [x, y, base, bw, bd, PCB_T], "colour": list(PCB_COLOURS.get(board["group"], (0.1, 0.4, 0.2)))}]
    holes = [to(hx, hy) for hx, hy in board.get("holes") or []]
    if holes:  # one dark disc, placed at every mounting hole
        h0 = holes[0]
        shapes.append({"name": "HOLE", "cyl": [_r(h0[0]), _r(h0[1]), top, SCREW_R.get(board.get("screw"), 1.6), 0.05, 16],
                       "colour": list(DARK), "copies": [[_r(h[0] - h0[0]), _r(h[1] - h0[1]), 0] for h in holes]})
    for edge, along, kind, up in board.get("ports") or []:
        fw, fh = PORT_FACE.get(kind, (8, 4))
        depth = PORT_DEPTH.get(kind, 8)
        x0, y0, x1, y1 = {"x0": (-1, along - fw / 2, depth - 1, along + fw / 2),
                          "x1": (w - depth + 1, along - fw / 2, w + 1, along + fw / 2),
                          "y0": (along - fw / 2, -1, along + fw / 2, depth - 1),
                          "y1": (along - fw / 2, d - depth + 1, along + fw / 2, d + 1)}[edge]
        px, py, pw, pd = _rect(to, x0, y0, x1, y1)
        z0 = max(top, top + up - fh / 2)
        metal = kind in METAL_PORTS
        shapes.append({"name": "MET-PORT" if metal else "PORT", "port": kind,
                       "box": [px, py, _r(z0), pw, pd, _r(top + up + fh / 2 - z0)],
                       "colour": list(STEEL if metal else DARK), "metal": metal})
    if pins:
        for sx, sy, sw, sd in _pin_rows(pins):
            shapes.append({"name": "HEADER", "box": [sx, sy, 0, sw, sd, HEADER_H], "colour": list(DARK)})
        p0 = pins[0]
        shapes.append({"name": "MET-PIN", "box": [_r(p0[0] - PIN_SIDE / 2), _r(p0[1] - PIN_SIDE / 2), PIN_LOW, PIN_SIDE, PIN_SIDE, HEADER_H - PIN_LOW],
                       "colour": list(GOLD), "metal": True, "copies": [[_r(p[0] - p0[0]), _r(p[1] - p0[1]), 0] for p in pins]})
    source = {"from": "Maker Forge", "licence": "MIT", "data": SHAPE_DATA}
    if pins and board.get("kicad"):
        lib, _, file = board["kicad"].partition("/")
        source["pins"] = f"{KICAD_VERSION} footprint {lib.removesuffix('.pretty')}:{file.removesuffix('.kicad_mod')} ({LICENCE})"
    elif pins and board.get("pinsFrom"):
        source["pins"] = board["pinsFrom"]
    return {"id": f"mod-{board['key']}", "name": board["label"], "kind": "module", "mount": "tht", "paint": None,
            "fit": {"value": board["match"][0], "also": board["match"][1:]}, "body": body,
            "footprint": {"pins": pins, "pitch": 2.54, "drill": drill}, "shapes": shapes, "source": source,
            "module": {k: board.get(k) for k in ("group", "groupLabel", "w", "d", "holes", "screw", "ports", "check")}}


def check_library(folder: Path) -> list[str]:
    """What's wrong with a library folder, in plain words: [] when every entry and file matches."""
    problems = []
    index_path = folder / "index.json"
    if not index_path.is_file():
        return [f"{index_path} is missing"]
    index = json.loads(index_path.read_text(encoding="utf-8"))
    parts = index.get("parts", [])
    listed, total, ids = set(), 0, set()
    for e in parts:
        if e["id"] in ids:
            problems.append(f"{e['id']} is in index.json twice")
        ids.add(e["id"])
        f = folder / e["model"]["file"]
        listed.add(e["model"]["file"])
        if not f.is_file():
            problems.append(f"{e['model']['file']} ({e['id']}) is missing")
            continue
        size = f.stat().st_size
        total += size
        if size != e["model"]["bytes"]:
            problems.append(f"{e['model']['file']} is {size} bytes, index.json says {e['model']['bytes']}")
        if size > MAX_MODEL:
            problems.append(f"{e['model']['file']} is over 250 KB")
        if f.read_bytes()[:4] != b"glTF":
            problems.append(f"{e['model']['file']} isn't a GLB")
    for f in sorted((folder / "models").glob("*")):
        if f"models/{f.name}" not in listed:
            problems.append(f"models/{f.name} isn't in index.json")
    if total > MAX_TOTAL:
        problems.append(f"the models come to {total} bytes, over the 8 MB budget")
    if not (folder / LICENSE_FILE).is_file():
        problems.append(f"{LICENSE_FILE} is missing")
    return problems


def _fit_value(text: str):
    if text in ("true", "false"):
        return text == "true"
    if re.fullmatch(r"-?(0|[1-9][0-9]*)(\.[0-9]+)?", text):
        return int(text) if "." not in text else float(text)
    return text  # "0207" stays a name, not the number 207


def read_list(path: Path) -> list[dict]:
    """The rows of tools/kicad3d-parts.tsv: id, kind, paint, model, footprint, name and fit (a dict)."""
    rows = []
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line.strip() or line.startswith("#"):
            continue
        cols = [c.strip() for c in line.split("\t")]
        if len(cols) == 6:
            cols.append("-")
        if len(cols) != 7:
            raise ValueError(f"{path}: needs 6 or 7 tab-separated columns: {line}")
        id_, kind, paint, model, footprint, name, fit = cols
        facts = {}
        for pair in ([] if fit == "-" else fit.split(",")):
            key, _, value = pair.partition("=")
            facts[key.strip()] = _fit_value(value.strip())
        rows.append({"id": id_, "kind": kind, "paint": None if paint == "-" else paint, "model": model,
                     "footprint": None if footprint == "-" else footprint, "name": name, "fit": facts})
    return rows


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description="Convert KiCad 3D models into the Maker Forge Library.")
    ap.add_argument("--kicad", required=True, help="KiCad's folder (with share/kicad/3dmodels)")
    ap.add_argument("--list", required=True, help="the TSV list of models to convert")
    ap.add_argument("--ours", help="a folder of our own model specs (*.json)")
    ap.add_argument("--modules", help="Shape's boards and modules (tools/shape-boards.json)")
    ap.add_argument("--out", required=True, help="the library folder to write (src/library)")
    args = ap.parse_args(argv)
    share = Path(args.kicad) / "share" / "kicad"
    out = Path(args.out)
    (out / "models").mkdir(parents=True, exist_ok=True)
    parts, written = [], set()
    for row in read_list(Path(args.list)):
        wrl = share / "3dmodels" / row["model"]
        mod = share / "footprints" / row["footprint"] if row["footprint"] else None
        glb, entry = convert(wrl.read_text(encoding="utf-8", errors="replace"),
                             mod.read_text(encoding="utf-8") if mod else None, id=row["id"])
        if len(glb) > MAX_MODEL:
            print(f"skipped {row['id']}: {len(glb)} bytes, over 250 KB", file=sys.stderr)
            continue
        file = f"models/{row['id']}.glb"
        (out / file).write_bytes(glb)
        written.add(file)
        parts.append({"id": row["id"], "name": row["name"], "kind": row["kind"], "mount": "tht",
                      "footprint": entry["footprint"], "model": {"file": file, "bytes": len(glb), **entry["model"]},
                      "paint": row["paint"], "fit": row["fit"],
                      "source": {"from": KICAD_VERSION, "path": row["model"], "licence": LICENCE}})
    for spec_path in sorted(Path(args.ours).glob("*.json")) if args.ours else []:
        spec = json.loads(spec_path.read_text(encoding="utf-8"))
        glb, entry = build_ours(spec)
        file = f"models/{spec['id']}.glb"
        (out / file).write_bytes(glb)
        written.add(file)
        entry["model"] = {"file": file, "bytes": len(glb), **entry["model"]}
        parts.append(entry)
    boards = json.loads(Path(args.modules).read_text(encoding="utf-8"))["boards"] if args.modules else []
    for board in boards:
        mod = share / "footprints" / board["kicad"] if board.get("kicad") else None
        glb, entry = build_ours(module_spec(board, mod.read_text(encoding="utf-8") if mod else None))
        file = f"models/{entry['id']}.glb"
        (out / file).write_bytes(glb)
        written.add(file)
        entry["model"] = {"file": file, "bytes": len(glb), **entry["model"]}
        parts.append(entry)
    for old in (out / "models").glob("*.glb"):
        if f"models/{old.name}" not in written:
            old.unlink()
    index = {"format": "maker-forge-library", "version": 1, "parts": parts}
    (out / "index.json").write_text(json.dumps(index, ensure_ascii=False, indent=1, sort_keys=True) + "\n",
                                    encoding="utf-8", newline="\n")  # the same bytes on Windows too
    total = sum(p["model"]["bytes"] for p in parts)
    print(f"{len(parts)} models, {total / 1024 / 1024:.2f} MB")
    problems = check_library(out)
    for p in problems:
        print("problem:", p, file=sys.stderr)
    return 1 if problems else 0


if __name__ == "__main__":
    sys.exit(main())
