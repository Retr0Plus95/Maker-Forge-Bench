"""Tests for tools/kicad3d.py, the KiCad 3D model converter. Run: python -m unittest discover -s tests/python -v"""
import json
import shutil
import struct
import sys
import tempfile
import unittest
from pathlib import Path

REPO = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO / "tools"))

import kicad3d  # noqa: E402

FIX = REPO / "tests" / "fixtures" / "kicad3d"
TINY = (FIX / "tiny.wrl").read_text(encoding="utf-8")
TINY_MOD = (FIX / "tiny.kicad_mod").read_text(encoding="utf-8")


def _vec3s(doc, blob, index):
    """An accessor's VEC3 values as tuples, following byteStride and normalized ints (KHR_mesh_quantization)."""
    acc = doc["accessors"][index]
    view = doc["bufferViews"][acc["bufferView"]]
    fmt = {5126: "f", 5122: "h", 5120: "b"}[acc["componentType"]]
    stride = view.get("byteStride", struct.calcsize(fmt) * 3)
    start = view.get("byteOffset", 0) + acc.get("byteOffset", 0)
    out = [struct.unpack_from(f"<3{fmt}", blob, start + k * stride) for k in range(acc["count"])]
    if acc.get("normalized"):
        top = {5122: 32767, 5120: 127}[acc["componentType"]]
        out = [tuple(max(v / top, -1.0) for v in p) for p in out]
    return out


def read_glb(data: bytes):
    """The GLB's JSON and, for each mesh by name, its positions in mm as (x, y, z) tuples."""
    magic, version, length = struct.unpack_from("<4sII", data, 0)
    assert magic == b"glTF" and version == 2 and length == len(data)
    json_len, json_type = struct.unpack_from("<II", data, 12)
    assert json_type == 0x4E4F534A
    doc = json.loads(data[20:20 + json_len])
    bin_at = 20 + json_len
    bin_len, bin_type = struct.unpack_from("<II", data, bin_at)
    assert bin_type == 0x004E4942
    blob = data[bin_at + 8:bin_at + 8 + bin_len]
    meshes = {}

    def visit(index, scale, move):  # nodes only scale and move (no turns); a shared mesh adds each copy
        node = doc["nodes"][index]
        s = node.get("scale", [1, 1, 1])
        t = node.get("translation", [0, 0, 0])
        here_move = [move[i] + scale[i] * t[i] for i in range(3)]
        here_scale = [scale[i] * s[i] for i in range(3)]
        if "mesh" in node:
            mesh = doc["meshes"][node["mesh"]]
            raw = _vec3s(doc, blob, mesh["primitives"][0]["attributes"]["POSITION"])
            meshes.setdefault(mesh["name"], []).extend(
                tuple(round(p[i] * here_scale[i] + here_move[i], 3) for i in range(3)) for p in raw)
        for child in node.get("children", []):
            visit(child, here_scale, here_move)

    for root in doc["scenes"][doc.get("scene", 0)]["nodes"]:
        visit(root, [1, 1, 1], [0, 0, 0])
    return doc, meshes, (json_len, bin_len)


class TestConverter(unittest.TestCase):
    def test_parse_tiny(self):
        shapes = kicad3d.parse_vrml(TINY)
        self.assertEqual([s["material"] for s in shapes], ["PIN-01", "RES-THT-01"])
        square = shapes[0]
        self.assertEqual(len(square["points"]), 4)
        self.assertEqual(square["faces"], [[0, 1, 2, 3]])
        self.assertAlmostEqual(square["colour"][0], 0.824)
        self.assertAlmostEqual(square["shininess"], 0.70)
        self.assertAlmostEqual(shapes[1]["transparency"], 0.0)

    def test_unnamed_materials(self):  # e.g. Crystal_HC49-4H_Vertical.wrl: no DEF/USE, a Material per shape
        anon = (FIX / "anon.wrl").read_text(encoding="utf-8")
        shapes = kicad3d.parse_vrml(anon)
        self.assertEqual([s["material"] for s in shapes], ["MAT-717171", "MAT-1A1A1A"])
        self.assertAlmostEqual(shapes[0]["colour"][0], 0.443137)
        glb, entry = kicad3d.convert(anon, None, id="anon")
        _, meshes, _ = read_glb(glb)
        self.assertEqual(sorted(meshes), ["MAT-1A1A1A", "MAT-717171"])
        self.assertEqual(entry["model"]["body"], "MAT-717171")

    def test_repeated_shapes_stored_once(self):  # a DIP-40 socket repeats one contact 40 times
        twins = (FIX / "twins.wrl").read_text(encoding="utf-8")
        glb, entry = kicad3d.convert(twins, None, id="twins")
        doc, meshes, _ = read_glb(glb)
        self.assertEqual(len(doc["meshes"]), 2)
        pin = [n for n in doc["nodes"] if "mesh" in n and doc["meshes"][n["mesh"]]["name"] == "PIN-01"]
        self.assertEqual(len(pin), 2)
        self.assertEqual(pin[0]["mesh"], pin[1]["mesh"])
        self.assertIn((3.048, 0.254, 0.0), meshes["PIN-01"])  # the far side of the second pin
        self.assertIn((0.508, 0.254, 0.0), meshes["PIN-01"])  # the same point on the first
        self.assertEqual(entry["model"]["box"], [[0, 0, 0], [3.048, 2.54, 2.54]])
        self.assertEqual(entry["model"]["body"], "IC-BODY-EPOXY-04")

    def test_tiny_repeats_merged(self):  # a node per copy costs more than a 2-triangle shape: merge them
        tiny = (FIX / "tiny.wrl").read_text(encoding="utf-8")
        start = tiny.index("Shape { geometry")
        end = tiny.index("Shape { geometry", start + 1)
        twice = tiny[:end] + tiny[start:end].replace("0 0 0,4 0 1,4 1 1,0 1 0", "5 0 0,9 0 1,9 1 1,5 1 0") + tiny[end:]
        glb, entry = kicad3d.convert(twice, None, id="twice")
        doc, meshes, _ = read_glb(glb)
        self.assertEqual(len([n for n in doc["nodes"] if "mesh" in n]), len(doc["meshes"]))
        self.assertIn((22.86, 0.0, 2.54), meshes["PIN-01"])

    def test_units_and_frame(self):
        glb, _ = kicad3d.convert(TINY, None, id="tiny")
        _, meshes, _ = read_glb(glb)
        self.assertIn((10.16, 0.0, 2.54), meshes["PIN-01"])  # VRML (4, 0, 1), Z still up
        self.assertIn((0.0, 0.0, 5.08), meshes["RES-THT-01"])

    def test_glb_valid(self):
        glb, entry = kicad3d.convert(TINY, TINY_MOD, id="tiny")
        doc, meshes, (json_len, bin_len) = read_glb(glb)
        self.assertEqual(json_len % 4, 0)
        self.assertEqual(bin_len % 4, 0)
        self.assertEqual(sorted(meshes), ["PIN-01", "RES-THT-01"])
        mats = {m["name"]: m for m in doc["materials"]}
        self.assertEqual(mats["PIN-01"]["pbrMetallicRoughness"]["metallicFactor"], 1)
        self.assertEqual(mats["RES-THT-01"]["pbrMetallicRoughness"]["metallicFactor"], 0)
        self.assertAlmostEqual(mats["RES-THT-01"]["pbrMetallicRoughness"]["roughnessFactor"], 0.7)
        self.assertEqual(entry["model"]["body"], "RES-THT-01")
        self.assertEqual(entry["model"]["box"], [[0, 0, 0], [10.16, 2.54, 5.08]])
        self.assertEqual(entry["footprint"]["pins"], [[0, 0], [10.16, 0]])
        for prim in (m["primitives"][0] for m in doc["meshes"]):
            self.assertIn("NORMAL", prim["attributes"])

    def test_positions_and_normals_quantized(self):  # half the bytes, so ~150 models fit the 8 MB budget
        glb, _ = kicad3d.convert(TINY, TINY_MOD, id="tiny")
        doc, meshes, _ = read_glb(glb)
        self.assertIn("KHR_mesh_quantization", doc["extensionsRequired"])
        self.assertIn("KHR_mesh_quantization", doc["extensionsUsed"])
        for mesh in doc["meshes"]:
            attrs = mesh["primitives"][0]["attributes"]
            self.assertEqual(doc["accessors"][attrs["POSITION"]]["componentType"], 5122)  # int16
            normal = doc["accessors"][attrs["NORMAL"]]
            self.assertEqual(normal["componentType"], 5120)  # int8
            self.assertTrue(normal["normalized"])
            for k in ("POSITION", "NORMAL"):
                view = doc["bufferViews"][doc["accessors"][attrs[k]]["bufferView"]]
                self.assertEqual(view["byteStride"] % 4, 0)
        self.assertIn((10.16, 0.0, 2.54), meshes["PIN-01"])

    def test_same_bytes_twice(self):
        self.assertEqual(kicad3d.convert(TINY, TINY_MOD, id="tiny")[0], kicad3d.convert(TINY, TINY_MOD, id="tiny")[0])

    def test_footprint_pins(self):
        self.assertEqual(kicad3d.footprint_pins(TINY_MOD), {"pins": [[0, 0], [10.16, 0]], "drill": 0.8})
        down = kicad3d.footprint_pins((FIX / "tiny-down.kicad_mod").read_text(encoding="utf-8"))
        self.assertEqual(down, {"pins": [[0, 0], [0, -2.54]], "drill": 1.0})  # y turned upwards, smd pad left out

    def test_build_ours(self):
        spec = {"id": "box", "name": "A box", "kind": "module", "paint": None, "fit": {"value": "BOX1"},
                "footprint": {"pins": [[0, 0]], "pitch": 2.54, "drill": 1.0},
                "shapes": [{"box": [0, 0, 0, 10, 5, 2], "colour": [0.1, 0.4, 0.2], "metal": False}]}
        glb, entry = kicad3d.build_ours(spec)
        _, meshes, _ = read_glb(glb)
        points = [p for pts in meshes.values() for p in pts]
        self.assertEqual(min(p[0] for p in points), 0)
        self.assertEqual(max(p[0] for p in points), 10)
        self.assertEqual(max(p[1] for p in points), 5)
        self.assertEqual(max(p[2] for p in points), 2)
        self.assertEqual(entry["source"], {"from": "Maker Forge", "licence": "MIT"})
        self.assertEqual(entry["model"]["box"], [[0, 0, 0], [10, 5, 2]])
        self.assertEqual(entry["fit"], {"value": "BOX1"})
        self.assertEqual(entry["mount"], "tht")


class TestList(unittest.TestCase):
    def test_list_rows_and_fit(self):  # the 7th column carries the facts library-match.js picks a model by
        tmp = Path(tempfile.mkdtemp())
        try:
            f = tmp / "list.tsv"
            lines = ["# a comment",
                     "r-1|res|bands|A.3dshapes/a.wrl|A.pretty/a.kicad_mod|A resistor|mount=flat,size=0207,D=8,pitch=5.08,clear=true",
                     "led-1|led|-|B.3dshapes/b.wrl|-|An LED|-",
                     "old-1|cer|-|C.3dshapes/c.wrl|-|Six columns"]
            f.write_text("".join(line.replace("|", chr(9)) + chr(10) for line in lines), encoding="utf-8")
            rows = kicad3d.read_list(f)
            self.assertEqual([r["id"] for r in rows], ["r-1", "led-1", "old-1"])
            self.assertEqual(rows[0]["fit"], {"mount": "flat", "size": "0207", "D": 8, "pitch": 5.08, "clear": True})
            self.assertEqual(rows[0]["paint"], "bands")
            self.assertIsNone(rows[1]["paint"])
            self.assertIsNone(rows[1]["footprint"])
            self.assertEqual(rows[1]["fit"], {})
            self.assertEqual(rows[2]["fit"], {})
        finally:
            shutil.rmtree(tmp, ignore_errors=True)

    def test_parts_list_is_valid(self):
        rows = kicad3d.read_list(REPO / "tools" / "kicad3d-parts.tsv")
        ids = [r["id"] for r in rows]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertGreaterEqual(len(rows), 150)
        for r in rows:
            self.assertRegex(r["id"], r"^[a-z0-9][a-z0-9.-]*$")
            self.assertTrue(r["model"].endswith(".wrl"), r["id"])


class TestLibrary(unittest.TestCase):
    def test_library_matches(self):
        self.assertEqual(kicad3d.check_library(REPO / "src" / "library"), [])

    def test_check_library_finds_problems(self):
        tmp = Path(tempfile.mkdtemp())
        try:
            lib = tmp / "library"
            shutil.copytree(REPO / "src" / "library", lib)
            index = json.loads((lib / "index.json").read_text(encoding="utf-8"))
            first = index["parts"][0]
            (lib / first["model"]["file"]).unlink()
            (lib / "models" / "stray.glb").write_bytes(b"glTF")
            (lib / "LICENSE-KICAD-3D.md").unlink()
            problems = "\n".join(kicad3d.check_library(lib))
            self.assertIn(first["model"]["file"], problems)
            self.assertIn("stray.glb", problems)
            self.assertIn("LICENSE-KICAD-3D.md", problems)
        finally:
            shutil.rmtree(tmp, ignore_errors=True)


if __name__ == "__main__":
    unittest.main()
