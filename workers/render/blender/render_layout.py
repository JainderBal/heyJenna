"""hey jenna - v6 stylised clay room, built from a design-logic layout.json.

Same look as build_room_v6.py (bevelled primitives, flat clay colours, ortho iso
camera, Cycles + AgX Punchy), but nothing is hard-coded: the shell, features,
furniture, soft furnishings, lights, props, plants and art all come from
../design/layout.json (made by ../design/design_logic.py).

Scene structure: one collection per layout layer (architecture, features, zones,
furniture, soft_furnishings, lighting, decor, plants, art). Every object is named
after its layout name (layer.zone.type_nn); its parts are name.01, name.02, ...
and its light is name.light.

Run:  Blender -b -P render_layout.py -- layout.json out.png [out.glb]
Env:  SAMPLES, PCT (resolution %), SAVE_BLEND=1 to also save a .blend next to out.png
Used by ../worker.py. Windows and doors are cut in the back wall only; others are skipped (printed).
"""
import bpy, bmesh, math, os, sys, json
from mathutils import Vector

HERE = os.path.dirname(os.path.abspath(__file__))
argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
if len(argv) < 2: raise SystemExit("usage: blender -b -P render_layout.py -- layout.json out.png [out.glb]")
LAYOUT, OUT = argv[0], os.path.abspath(argv[1])
GLB = os.path.abspath(argv[2]) if len(argv) > 2 else None
TAG = os.path.splitext(os.path.basename(OUT))[0]
RAW = OUT[:-4] + "-raw.png"
SAMPLES, RES, PEACH = 128, (1600, 1200), (0.97, 0.82, 0.71)
LAY = json.load(open(LAYOUT))

# v1 helpers only (everything above its "scene" section), exactly as v6 does
v1 = os.path.join(HERE, "build_room.py")
src = open(v1).read().split("# ---------------------------------------------------------------- scene")[0]
H_ = {"__name__": "room_v1_helpers", "__file__": v1}
exec(compile(src, v1, "exec"), H_)
lin, T, mat, fabric, box, cyl, ico, plant, sheer, mesh_obj = (H_[k] for k in
    ("lin", "T", "mat", "fabric", "box", "cyl", "ico", "plant", "sheer", "mesh_obj"))
P = H_["P"]

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
RM, MAT, PROF = LAY["room"], LAY.get("materials", {}), LAY.get("style_profile", {})
W, D, H, TH, S = RM["width"], RM["depth"], RM["height"], 0.14, 0.18
OBJ = {o["id"]: o for o in LAY["objects"]}

def grp(x, y, z, ry=0.0, name="grp"):
    e = bpy.data.objects.new(name, None); sc.collection.objects.link(e)
    e.location = T(x, y, z); e.rotation_euler = (0, 0, ry); return e

def sphere(rad, m, loc, parent=None, scale=(1, 1, 1)):
    bm = bmesh.new(); bmesh.ops.create_uvsphere(bm, u_segments=32, v_segments=16, radius=rad)
    o = mesh_obj("sphere", bm, m, parent, loc); o.scale = scale; return o

def chrome():
    m = bpy.data.materials.new("chrome"); m.use_nodes = True; b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin("#D9DCE0"); b.inputs["Metallic"].default_value = 1.0
    b.inputs["Roughness"].default_value = 0.12; return m

def metal():  # profile metal: chrome (v6), black or brass
    kind = MAT.get("metal", "chrome")
    if kind == "black": return mat("#2A2522", 0.35)
    if kind == "brass":
        m = chrome(); m.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = lin("#C9A15A"); return m
    return chrome()

def gloss(hexc, rough=0.12):
    m = mat(hexc, rough); m.node_tree.nodes["Principled BSDF"].inputs["Coat Weight"].default_value = 0.6; return m

def concrete():  # v6 mottled concrete
    m = bpy.data.materials.new("concrete"); m.use_nodes = True; N = m.node_tree.nodes; L = m.node_tree.links
    b = N["Principled BSDF"]; b.inputs["Roughness"].default_value = 0.6
    tc = N.new("ShaderNodeTexCoord")
    nz = N.new("ShaderNodeTexNoise"); nz.inputs["Scale"].default_value = 1.6; nz.inputs["Detail"].default_value = 4
    L.new(tc.outputs["Object"], nz.inputs["Vector"])
    rp = N.new("ShaderNodeValToRGB"); rp.color_ramp.elements[0].color = lin("#ADA498"); rp.color_ramp.elements[1].color = lin("#CBC3B7")
    rp.color_ramp.elements[0].position = 0.35; rp.color_ramp.elements[1].position = 0.65
    L.new(nz.outputs["Fac"], rp.inputs["Fac"]); col = rp.outputs["Color"]
    for scale, thr, hexc, w in ((140, 0.10, "#6F675D", 0.0), (95, 0.08, "#F1ECE3", 0.5)):
        v = N.new("ShaderNodeTexVoronoi"); v.voronoi_dimensions = "4D"; v.inputs["Scale"].default_value = scale; v.inputs["W"].default_value = w
        L.new(tc.outputs["Object"], v.inputs["Vector"])
        lt = N.new("ShaderNodeMath"); lt.operation = "LESS_THAN"; lt.inputs[1].default_value = thr; L.new(v.outputs["Distance"], lt.inputs[0])
        mx = N.new("ShaderNodeMix"); mx.data_type = "RGBA"; mx.inputs["B"].default_value = lin(hexc)
        L.new(lt.outputs[0], mx.inputs["Factor"]); L.new(col, mx.inputs["A"]); col = mx.outputs["Result"]
    L.new(col, b.inputs["Base Color"]); return m

def brick_xz(hexc=None):
    """Brick in the wall's colour (from the moodboard): bricks, slightly darker bricks, light mortar."""
    m = H_["brick"](); N = m.node_tree.nodes; L = m.node_tree.links
    sep = next(n for n in N if n.type == "SEPXYZ"); comb = next(n for n in N if n.type == "COMBXYZ")
    L.new(sep.outputs["X"], comb.inputs["X"])
    if hexc:
        br = next(n for n in N if n.type == "TEX_BRICK")
        br.inputs["Color1"].default_value = lin(hexc); br.inputs["Color2"].default_value = lin(shade(hexc, 0.86))
        br.inputs["Mortar"].default_value = lin(shade(hexc, 1.45))
    return m

def curtain(x0, x1, z, m, top):
    bm = bmesh.new(); nx = 48; h = top - 0.05
    rows = [[bm.verts.new(T(x0 + (x1 - x0) * i / nx, 0.06 + h * j, z + 0.03 * math.sin(i / nx * (x1 - x0) / 0.11 * 2 * math.pi))) for i in range(nx + 1)] for j in (0, 1)]
    for i in range(nx): bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
    me = bpy.data.meshes.new("curtain"); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    me.materials.append(m); ob = bpy.data.objects.new("curtain", me); sc.collection.objects.link(ob)
    ob.modifiers.new("solid", "SOLIDIFY").thickness = 0.004

def shade(hexc, k):
    h = hexc.lstrip("#"); c = [int(h[i:i + 2], 16) for i in (0, 2, 4)]
    return "#" + "".join(f"{max(0, min(255, int(v * k))):02X}" for v in c)

def kelvin(k):  # colour temperature -> hex (Tanner Helland's fit)
    t = k / 100
    r = 255 if t <= 66 else 329.7 * (t - 60) ** -0.1332
    g = 99.47 * math.log(t) - 161.12 if t <= 66 else 288.1 * (t - 60) ** -0.0755
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5 * math.log(t - 10) - 305.04)
    return "#" + "".join(f"{int(max(0, min(255, v))):02X}" for v in (r, g, b))
LAMP = kelvin(PROF.get("light_warmth_k", 2700))

def point_light(name, loc, energy, hexc, soft=0.15):
    ld = bpy.data.lights.new(name, "POINT"); ld.energy = energy; ld.color = lin(hexc)[:3]; ld.shadow_soft_size = soft
    lo = bpy.data.objects.new(name, ld); sc.collection.objects.link(lo); lo.location = T(*loc); return lo

# ---------------------------------------------------------------- layers -> collections, layout names -> object names
COLL = {}
for l in LAY.get("layers", {}) or ["architecture", "features", "zones", "furniture", "soft_furnishings", "lighting", "decor", "plants", "art"]:
    c = bpy.data.collections.new(l); sc.collection.children.link(c); COLL[l] = c

def build(name, layer, fn, *args):
    """Run a builder; move everything it made into the layer collection and name it."""
    before = set(bpy.data.objects); fn(*args)
    new = [ob for ob in bpy.data.objects if ob not in before]
    roots = [ob for ob in new if ob.parent is None or ob.parent not in new]
    k = 0
    if len(roots) > 1 or (roots and roots[0].type != "EMPTY"):  # loose parts: give them one parent named after the object
        e = bpy.data.objects.new(name, None); sc.collection.objects.link(e)
        for ob in roots: ob.parent = e  # e sits at the origin, so world positions don't change
        new.insert(0, e); roots = [e]
    for ob in new:
        for c in list(ob.users_collection): c.objects.unlink(ob)
        COLL[layer].objects.link(ob)
    for ob in new:
        if ob.type == "LIGHT": ob.name = f"{name}.light"
        elif ob is roots[0] and (len(roots) == 1 or ob.type == "EMPTY"): ob.name = name
        else: k += 1; ob.name = f"{name}.{k:02d}"
    return new

def at(o): p = o["position"]; return p["x"] - W / 2, p["z"], p["y"] - D / 2
def ry(o): return math.radians(o["rotation_deg"])
def place(o): x, y, z = at(o); return grp(x, y, z, ry(o), o["name"])
def col(o, default): return o.get("colour") or default
ARTS = (PROF.get("art", {}) or {}).get("colours") or ["#D6483C", "#2E4FC4", "#E9A23B", "#3A8C5C", "#F3E6D3", "#C2432E", "#7FA7C9", "#E27A2C", "#2F6E3E"]
wood, woodL = mat(MAT.get("wood", "#B9733A"), 0.6), mat(MAT.get("wood_light", "#D3A06A"), 0.6)
edge, fr = mat(P["edge"], 0.9), mat("#F7F1E6", 0.5)
WINS = {w["id"]: (w["position"] - w["width"] / 2 - W / 2, w["position"] + w["width"] / 2 - W / 2, w["sill"], w["head"]) for w in RM["windows"]}
SKIPPED = [o["id"] for o in RM["windows"] + RM["doors"] if o["wall"] != "back"]
if SKIPPED: print("renderer cuts openings in the back wall only; skipping", SKIPPED)
RM["windows"] = [w for w in RM["windows"] if w["wall"] == "back"]; RM["doors"] = [d for d in RM["doors"] if d["wall"] == "back"]

# ---------------------------------------------------------------- architecture
def a_floor(o):
    box(W + TH, S, D + TH, edge, (-TH / 2, -S / 2 - 0.006, -TH / 2))
    box(W, 0.012, D, concrete() if not MAT.get("floor") else mat(MAT["floor"], 0.55), (0, 0, 0))

STUB = 0.32  # cut-away walls are drawn knee-high, so pieces standing against them read as against a wall

def a_wall(o):
    if not o.get("render", True):
        if o["zone"] == "front": box(W + TH, STUB, TH, mat(o.get("colour") or "#F1E7DA", 0.92), (-TH / 2, STUB / 2, D / 2 + TH / 2))
        elif o["zone"] == "right": box(TH, STUB, D + TH, mat(o.get("colour") or "#F1E7DA", 0.92), (W / 2 + TH / 2, STUB / 2, -TH / 2))
        return
    if o["zone"] == "left":
        box(TH, H, D + TH, mat(o.get("colour") or "#F1E7DA", 0.92), (-W / 2 - TH / 2, H / 2, -TH / 2))
        box(TH + 0.004, 0.025, D + TH + 0.004, edge, (-W / 2 - TH / 2, H + 0.012, -TH / 2))
    elif o["zone"] == "back":
        m = brick_xz(o.get("colour")) if o.get("finish") == "brick" else mat(o.get("colour") or "#F1E7DA", 0.92); zb = -D / 2 - TH / 2
        xs = [-W / 2 - TH] + [v for a, b, _, _ in sorted(WINS.values()) for v in (a, b)] + [W / 2]
        for a, b in zip(xs[0::2], xs[1::2]): box(b - a, H, TH, m, ((a + b) / 2, H / 2, zb))
        for a, b, sill, head in WINS.values():
            box(b - a, sill, TH, m, ((a + b) / 2, sill / 2, zb)); box(b - a, H - head, TH, m, ((a + b) / 2, (H + head) / 2, zb))
        box(W + TH + 0.004, 0.025, TH + 0.004, edge, (-TH / 2, H + 0.012, zb))

def a_window(o):
    a, b, sill, head = WINS[o["id"]]; zb = -D / 2 - TH / 2; n = max(2, round((b - a) / 0.375))
    for i in range(n + 1): box(0.045, head - sill, 0.07, fr, (a + i * (b - a) / n, (sill + head) / 2, zb), r=0.006)
    for y in (sill, sill + (head - sill) * 0.42, head - 0.35, head): box(b - a, 0.045, 0.07, fr, ((a + b) / 2, y, zb), r=0.006)

def a_door(o):  # v6 striped curtain doorway
    dx, dw = o["position"]["x"] - W / 2, o["size"]["w"]
    box(dw, 2.12, 0.02, mat("#3B2F29", 0.9), (dx, 1.06, -D / 2 + 0.005))
    box(dw + 0.12, 0.06, 0.05, fr, (dx, 2.15, -D / 2 + 0.02), r=0.01)
    n = int(dw / 0.105)
    for i, c in enumerate((["#D6483C", "#F3E6D3", "#E9A23B", "#2E4FC4"] * 4)[:n]):
        box(0.1, 2.02, 0.015, mat(c, 0.9), (dx - (n - 1) * 0.105 / 2 + i * 0.105, 1.07, -D / 2 + 0.035 + 0.008 * (i % 2)), r=0.004)

# ---------------------------------------------------------------- features
def f_platform(o):  # v6 raised wooden platform: slab + alternating planks
    x, _, z = at(o); w, d, h = o["size"]["w"], o["size"]["d"], o["size"]["h"]
    box(w, h, d, wood, (x, h / 2, z), r=0.015)
    n = max(1, int(d / 0.24)); pd = d / n
    for i in range(n): box(w - 0.02, 0.012, pd - 0.01, woodL if i % 2 else mat(shade(MAT.get("wood", "#B9733A"), 1.08), 0.6), (x, h + 0.005, z - d / 2 + pd / 2 + i * pd), r=0.003)

def f_niche(o):  # recessed shelves in the wall, shown as a plaster inset with a frame
    x, y0, _ = at(o); w, h = o["size"]["w"], o["size"]["h"]; zw = -D / 2
    box(w + 0.08, h + 0.08, 0.02, mat("#F1E7DA", 0.9), (x, y0 + h / 2, zw + 0.01), r=0.008)
    box(w, h, 0.012, mat("#C9B8A4", 0.95), (x, y0 + h / 2, zw + 0.022))
    for k in range(3):
        y = y0 + 0.05 + k * (h - 0.1) / 2
        box(w, 0.03, 0.16, woodL, (x, y, zw + 0.09), r=0.005)
        if k < 2:
            for j in range(3): box(0.04, 0.16 + 0.03 * j, 0.12, mat(ARTS[(k * 3 + j) % len(ARTS)], 0.8), (x - w / 4 + j * 0.045, y + 0.1 + 0.015 * j, zw + 0.09), r=0.004)
    cyl(0.05, 0.06, 0.18, gloss(ARTS[1 % len(ARTS)]), (x + w / 4, y0 + 0.05 + (h - 0.1) / 2 + 0.105, zw + 0.09))

def f_window_seat(o):
    g = place(o); w, d, h = o["size"]["w"], o["size"]["d"], o["size"]["h"]
    box(w, h - 0.08, d, wood, (0, (h - 0.08) / 2, 0), r=0.02, parent=g)
    for i in range(3): box(w / 3 - 0.04, h - 0.18, 0.01, woodL, (-w / 3 + i * w / 3, (h - 0.08) / 2, d / 2 + 0.002), r=0.004, parent=g)
    box(w - 0.02, 0.08, d - 0.02, fabric(MAT.get("curtain", "#E8B84A")), (0, h - 0.04, 0), r=0.035, parent=g)

def f_beam(o):
    for bx in o.get("beams", []): box(0.16, 0.18, D + TH, wood, (bx - W / 2, H - 0.09, -TH / 2), r=0.01)

def f_half_wall(o):
    g = place(o); w, d, h = o["size"]["w"], o["size"]["d"], o["size"]["h"]
    box(w, h, d, mat(LAY["palette"]["dominant"][0], 0.9), (0, h / 2, 0), r=0.01, parent=g)
    box(w + 0.03, 0.04, d + 0.04, wood, (0, h + 0.02, 0), r=0.008, parent=g)

def f_built_in(o):
    g = place(o); w, d, h = o["size"]["w"], o["size"]["d"], o["size"]["h"]
    for sx in (-w / 2, w / 2): box(0.04, h, d, wood, (sx, h / 2, 0), r=0.005, parent=g)
    for i in range(5):
        y = 0.05 + i * (h - 0.1) / 4; box(w, 0.035, d, wood, (0, y, 0), r=0.005, parent=g)
        if i < 4:
            for j in range(int(w / 0.12)): box(0.05, 0.22 + 0.04 * (j % 3), d * 0.7, mat(ARTS[(i + j) % len(ARTS)], 0.8), (-w / 2 + 0.1 + j * 0.11, y + 0.13, 0), r=0.004, parent=g)

def f_wall_finish(o):
    wall = o.get("wall"); hh = o["size"]["h"]; c = o.get("colour") or "#D3A06A"
    if wall != "left": return  # the back wall is brick; others are cut away
    if o["type"] == "feature_wall": box(0.01, H - 0.02, D - 0.02, mat(c, 0.9), (-W / 2 + 0.006, H / 2, 0))
    else:
        box(0.015, 0.05, D, woodL, (-W / 2 + 0.01, hh, 0), r=0.004)
        for k in range(int(D / 0.5)): box(0.012, hh - 0.12, 0.38, mat(shade(c, 1.05), 0.8), (-W / 2 + 0.008, hh / 2, -D / 2 + 0.25 + k * 0.5), r=0.004)

# ---------------------------------------------------------------- furniture (v6 geometry, local frame: front = +z)
def b_sofa(o):
    g = place(o); w = o["size"]["w"]; n = max(1, round(w / 0.72)); mw = w / n
    c = col(o, "#2F6E3E"); f, fd, fp = fabric(c), mat(shade(c, 0.68), 0.9), mat(shade(c, 0.85), 0.9)
    for i in range(n):
        x = -w / 2 + mw / 2 + i * mw; bw = mw - 0.02
        box(bw, 0.18, 0.95, fp, (x, 0.09, 0), r=0.06, parent=g)
        for zz in (0.29, -0.05):
            box(bw, 0.24, 0.35, f, (x, 0.3, zz), r=0.11, parent=g)
            for dx_ in (-0.17, 0.17): sphere(0.028, fd, (x + dx_, 0.415, zz), g, (1, 1, 0.45))
        box(bw, 0.5, 0.3, f, (x, 0.6, -0.33), r=0.14, parent=g)
        for dx_ in (-0.17, 0.17):
            for yy in (0.52, 0.7): sphere(0.028, fd, (x + dx_, yy, -0.18), g, (1, 0.45, 1))

def b_coffee(o):
    g = place(o); gm = gloss(col(o, "#5B1E1A"))
    if o.get("shape") != "round": g.scale = (o["size"]["w"] / 0.92, o["size"]["d"] / 0.92, 1)
    cyl(0.46, 0.46, 0.05, gm, (0, 0.38, 0), g, r=0.02); cyl(0.12, 0.22, 0.35, gm, (0, 0.18, 0), g)

def b_lounge(o):
    g = place(o); lg = fabric(col(o, "#2F8C4E"))
    box(0.78, 0.22, 0.72, lg, (0, 0.3, 0.05), r=0.1, parent=g)
    box(0.78, 0.62, 0.22, lg, (0, 0.62, -0.32), r=0.1, parent=g, rx=-0.28)
    for sx in (-0.3, 0.3):
        for sz in (-0.25, 0.3): cyl(0.022, 0.018, 0.2, mat("#2A2522", 0.4), (sx, 0.1, sz), g, seg=12, r=0)

def b_tube(o):
    g = place(o); ch = metal(); seat = mat(col(o, "#2A2522"), 0.45)
    for sx in (-0.22, 0.22):
        box(0.026, 0.026, 0.56, ch, (sx, 0.013, 0.05), r=0.012, parent=g)
        box(0.026, 0.43, 0.026, ch, (sx, 0.22, 0.32), r=0.012, parent=g)
        box(0.026, 0.026, 0.5, ch, (sx, 0.43, 0.07), r=0.012, parent=g)
        box(0.026, 0.46, 0.026, ch, (sx, 0.65, -0.18), r=0.012, parent=g)
    box(0.48, 0.05, 0.46, seat, (0, 0.46, 0.07), r=0.02, parent=g)
    box(0.48, 0.28, 0.04, seat, (0, 0.74, -0.19), r=0.015, parent=g)

def b_sideboard(o):
    g = place(o); w = o["size"]["w"]; wd = mat(col(o, MAT.get("wood", "#B9733A")), 0.6)
    box(w, 0.52, 0.42, wd, (0, 0.36, 0), r=0.03, parent=g)
    nd = 3; dw = (w - 0.05) / nd
    for i in range(nd): box(dw - 0.02, 0.42, 0.01, woodL, (-w / 2 + 0.025 + dw / 2 + i * dw, 0.36, 0.212), r=0.004, parent=g)
    for sx in (-w / 2 + 0.08, w / 2 - 0.08):
        for sz in (-0.15, 0.15): cyl(0.018, 0.012, 0.1, mat("#2A2522", 0.4), (sx, 0.05, sz), g, seg=10, r=0)

def b_desk(o):
    g = place(o); w = o["size"]["w"]
    box(w, 0.04, 0.6, woodL, (0, 0.74, 0), r=0.01, parent=g)
    for sx in (-w / 2 + 0.045, w / 2 - 0.045): box(0.04, 0.72, 0.56, mat(col(o, "#2E4FC4"), 0.5), (sx, 0.36, 0), r=0.008, parent=g)

def b_deskchair(o):
    g = place(o); bc = mat(col(o, "#E9A23B"), 0.6); ch = metal()
    box(0.44, 0.06, 0.42, bc, (0, 0.46, 0), r=0.025, parent=g); box(0.44, 0.36, 0.05, bc, (0, 0.72, -0.2), r=0.02, parent=g)
    cyl(0.025, 0.025, 0.42, ch, (0, 0.22, 0), g, seg=12, r=0); cyl(0.24, 0.24, 0.03, ch, (0, 0.015, 0), g, r=0.01)

def b_spiral(o):
    g = place(o); bl = gloss(col(o, "#2E4FC4"), 0.3); h = o["size"]["h"]
    cyl(0.025, 0.025, h, bl, (0, h / 2, 0), g, seg=16, r=0)
    for i in range(7):
        a = i * 0.95; x, z = 0.12 * math.cos(a), 0.12 * math.sin(a); y = 0.2 + i * (h - 0.3) / 6.6
        cyl(0.19, 0.19, 0.03, bl, (x, y, z), g, r=0.01)
        if i % 2 == 0:
            for k in range(3): box(0.04, 0.16 + 0.03 * k, 0.12, mat(ARTS[(i + k) % len(ARTS)], 0.8), (x - 0.05 + k * 0.045, y + 0.1 + 0.015 * k, z), r=0.004, parent=g)

def b_stool(o):
    g = place(o); rg = gloss(col(o, "#D6483C"), 0.2); h = o["size"]["h"]; r_ = o["size"]["w"] / 2
    cyl(r_, r_, 0.06, rg, (0, h - 0.03, 0), g, r=0.02); cyl(r_ * 0.74, r_ * 0.9, h - 0.06, rg, (0, (h - 0.06) / 2, 0), g)

def b_drum(o):
    g = place(o); h = o["size"]["h"]; r_ = o["size"]["w"] / 2
    cyl(r_, r_, h, gloss(col(o, "#C2432E"), 0.25), (0, h / 2, 0), g, r=0.02)
    box(0.012, h * 0.7, 0.012, mat("#2A2522"), (0, h / 2, r_ + 0.002), parent=g)

def b_pouf(o):  # new: squashy round pouf with a centre button
    g = place(o); r_ = o["size"]["w"] / 2; h = o["size"]["h"]; f = fabric(col(o, "#E9A23B"))
    cyl(r_, r_ * 0.94, h, f, (0, h / 2, 0), g, r=0.12)
    sphere(0.03, mat(shade(col(o, "#E9A23B"), 0.7), 0.8), (0, h, 0), g, (1, 0.5, 1))

def b_cattree(o):
    g = place(o); s = o["size"]; c = mat(col(o, "#2E4FC4"), 0.9, sheen=0.4); sis = mat("#D9C3A0", 0.95)
    box(s["w"], 0.05, s["d"], c, (0, 0.025, 0), r=0.015, parent=g)
    for px, ph in ((-0.12, 0.62), (0.12, s["h"] - 0.12)): cyl(0.05, 0.05, ph, sis, (px, ph / 2 + 0.05, -0.08 if px < 0 else 0.06), g, seg=24)
    box(0.36, 0.04, 0.32, c, (-0.08, 0.66, -0.05), r=0.015, parent=g)
    cyl(0.2, 0.2, 0.08, c, (0.08, s["h"] - 0.06, 0.04), g, r=0.03)
    cat = mat("#E9A23B", 0.8)
    sphere(0.12, cat, (0.08, s["h"] + 0.04, 0.04), g, (1.1, 0.8, 0.9)); sphere(0.07, cat, (0.17, s["h"] + 0.07, 0.12), g)
    for ex in (0.13, 0.21): cyl(0.0, 0.025, 0.05, cat, (ex, s["h"] + 0.13, 0.12), g, seg=8, r=0)
    box(0.18, 0.035, 0.035, cat, (0.0, s["h"] + 0.01, 0.15), r=0.017, parent=g, ry=0.5)
    sphere(0.035, mat("#D6483C", 0.5), (-0.15, 0.09, 0.15), g)

# ---------------------------------------------------------------- soft furnishings
def s_rug(o):
    g = place(o); m = mat(col(o, "#C2432E"), 1.0, sheen=0.4)
    if o.get("shape") == "round": cyl(o["size"]["w"] / 2, o["size"]["w"] / 2, 0.015, m, (0, 0.012, 0), g, seg=96, r=0.004)
    else: box(o["size"]["w"], 0.02, o["size"]["d"], m, (0, 0.012, 0), r=0.01, parent=g)

def s_curtain(o):
    a, b, sill, head = WINS[o["window"]]; m = sheer(col(o, P["curtain"]))
    if o["side"] == "left":
        curtain(a - 0.12, a + 0.42, -D / 2 + 0.1, m, head)
        box(b - a + 0.4, 0.03, 0.03, metal(), ((a + b) / 2, head + 0.06, -D / 2 + 0.1))  # rail
    else: curtain(b - 0.42, b + 0.12, -D / 2 + 0.1, m, head)

def s_throw(o):
    g = place(o); f = fabric(col(o, "#E8B84A"))
    box(0.6, 0.03, 0.62, f, (0, 0.01, 0), r=0.012, parent=g); box(0.6, 0.26, 0.03, f, (0, -0.12, 0.34), r=0.012, parent=g)

def s_cushion(o):
    g = place(o); box(0.42, 0.38, 0.14, fabric(col(o, "#D6483C")), (0, 0.19, 0), r=0.07, parent=g, rx=-0.25)

# ---------------------------------------------------------------- lighting
def l_pendant(o):
    x, y, z = at(o); g = grp(x, 0, z, 0, o["name"]); r_ = o["size"]["w"] / 2
    cyl(0.006, 0.006, H - y - r_, mat("#2A2522", 0.5), (0, (H + y + r_) / 2, 0), g, seg=8, r=0)
    cyl(0.05, 0.05, 0.03, mat("#2A2522", 0.5), (0, H - 0.015, 0), g, r=0.005)
    sphere(r_, mat(col(o, "#F3E6D3"), 0.4, emit=shade(LAMP, 1.0), ei=1.4), (0, y, 0), g)
    point_light("pendant", (x, y - r_ - 0.05, z), 25, LAMP, 0.25)

def l_floor(o):
    g = place(o); ch = metal(); h = o["size"]["h"]; c = col(o, "#F2A7B8"); x, y0, z = at(o)
    cyl(0.15, 0.17, 0.03, ch, (0, 0.015, 0), g); cyl(0.014, 0.014, h - 0.34, ch, (0, (h - 0.34) / 2 + 0.02, 0), g, seg=12, r=0)
    sphere(0.22, mat(c, 0.5, emit=shade(c, 1.08), ei=1.2), (0, h - 0.22, 0), g)
    point_light("floorlamp", (x, y0 + h - 0.22, z), 30, LAMP, 0.2)

def l_table(o):
    g = place(o); c = col(o, "#D6483C"); s = o["size"]; x, y, z = at(o)
    cyl(s["w"] * 0.35, s["w"] * 0.4, 0.025, gloss(c), (0, 0.012, 0), g, r=0.006)
    cyl(0.014, 0.014, s["h"] * 0.6, metal(), (0, s["h"] * 0.32, 0), g, seg=12, r=0)
    sphere(s["w"] / 2, mat(c, 0.35, emit=shade(c, 1.15), ei=0.5), (0, s["h"] * 0.68, 0), g, (1, 1, 0.6))
    point_light("tablelamp", (x, y + s["h"] * 0.6, z), 9, LAMP, 0.08)

# ---------------------------------------------------------------- decor (props on surfaces)
def d_prop(o):
    g = place(o); t, c = o["type"], col(o, "#F3E6D3")
    if t == "book": box(0.24, 0.05, 0.18, mat(c), (0, 0.025, 0), r=0.01, parent=g)
    elif t == "cup": cyl(0.05, 0.06, 0.16, gloss(c), (0, 0.08, 0), g)
    elif t == "vase":
        cyl(0.07, 0.09, 0.28, gloss(c), (0, 0.14, 0), g)
        for k in range(5): sphere(0.045, mat(["#D6483C", "#E9A23B", "#F3E6D3"][k % 3], 0.8), (0.07 * math.cos(k * 1.3), 0.33 + 0.04 * (k % 2), 0.07 * math.sin(k * 1.3)), g)
    elif t == "books":
        for k, bc in enumerate(["#D6483C", "#F3E6D3", "#2E4FC4", "#E9A23B"]):
            box(0.3 - k * 0.02, 0.045, 0.22, mat(bc, 0.8), (0, 0.025 + k * 0.047, 0), r=0.006, parent=g, ry=0.1 * (k % 2))
    elif t == "computer":
        box(0.4, 0.3, 0.3, mat("#EFE6D6", 0.5), (0, 0.16, 0), r=0.05, parent=g)
        box(0.3, 0.21, 0.01, mat("#5A86B5", 0.2, emit="#7FB0E6", ei=0.8), (-0.01, 0.17, 0.155), parent=g)
    elif t == "paper": box(0.36, 0.02, 0.12, mat(c, 0.6), (0, 0.01, 0), r=0.005, parent=g)
    elif t == "mug": cyl(0.05, 0.05, 0.11, gloss(c), (0, 0.055, 0), g)

# ---------------------------------------------------------------- plants, art, zones
def p_plant(o):
    x, y0, z = at(o); h = o["size"]["h"]; kind = o.get("kind") or ("tall" if h >= 1.1 else "bush")
    s = h / (1.45 if kind == "tall" else 0.72 if kind == "bush" else 0.86)
    before = set(bpy.data.objects); plant(x, z, kind, min(s, 1.25))
    if y0:
        for ob in bpy.data.objects:
            if ob not in before and ob.parent is None: ob.location.z += y0

def a_art(o):
    arr = (PROF.get("art", {}) or {}).get("arrangement", "gallery")
    frames = {"gallery": [(-1.6, 1.75, 0.42, 0.56), (-1.05, 1.95, 0.5, 0.4), (-1.05, 1.5, 0.5, 0.3), (-0.45, 1.8, 0.4, 0.62), (0.05, 2.05, 0.36, 0.36),
                          (0.05, 1.55, 0.36, 0.46), (0.55, 1.85, 0.3, 0.4), (-1.6, 2.25, 0.3, 0.25), (-0.45, 2.3, 0.4, 0.22)],
              "pair": [(-0.33, 1.8, 0.6, 0.8), (0.33, 1.8, 0.6, 0.8)], "single": [(0.0, 1.8, 1.0, 0.75)]}[arr]
    u0, u1 = min(f[0] - f[2] / 2 for f in frames), max(f[0] + f[2] / 2 for f in frames)
    v0, v1 = min(f[1] - f[3] / 2 for f in frames), max(f[1] + f[3] / 2 for f in frames)
    su, sv = o["size"]["w"] / (u1 - u0), o["size"]["h"] / (v1 - v0); sc_ = min(su, sv)
    x, yc, z = at(o); wall = o.get("wall", "left")
    for k, (fu, fy, fw, fh) in enumerate(frames):
        u = (fu - (u0 + u1) / 2) * su; y = yc + (fy - (v0 + v1) / 2) * sv; w_, h_ = fw * sc_, fh * sc_
        def put(t, dd, hh, ww, m, dy=0.0):
            if wall == "left": box(t, hh, ww, m, (-W / 2 + dd, y + dy, z + u), r=0.005 if t > 0.02 else 0)
            elif wall == "back": box(ww, hh, t, m, (x + u, y + dy, -D / 2 + dd), r=0.005 if t > 0.02 else 0)
        put(0.03, 0.017, h_, w_, mat("#2A2522" if k % 3 == 0 else "#F7F1E6", 0.5))
        put(0.01, 0.035, h_ - 0.07, w_ - 0.07, mat("#F4ECDD", 0.8))
        put(0.01, 0.042, (h_ - 0.07) * 0.55, (w_ - 0.07) * 0.6, mat(ARTS[k % len(ARTS)], 0.8), dy=0.04 if k % 2 else -0.03)

def z_zone(o):  # invisible helper box
    x, _, z = at(o); e = grp(x, 0.5, z, 0, o["name"]); e.empty_display_type = "CUBE"
    e.scale = (o["size"]["w"] / 2, o["size"]["d"] / 2, 0.5); e.hide_render = True

# ---------------------------------------------------------------- real product models (e.g. IKEA's own 3D files)
MODEL_TYPES = ("sofa", "armchair", "coffee_table", "side_table", "shelf", "desk", "desk_chair", "sideboard", "pouf", "cat_tree", "rug", "plant")
MODEL_IDS = {o["id"] for o in LAY["objects"] if o.get("model_path") and o["type"] in MODEL_TYPES}

def m_model(o, fallback):
    """Import the product's GLB, sit it on the floor centred on its spot, turned like the plan says.
    IKEA models are true to size and face -Y like our own pieces; scale only if they disagree with the plan by >25 %."""
    before = set(bpy.data.objects)
    try:
        bpy.ops.import_scene.gltf(filepath=o["model_path"])
    except Exception as e:
        print("model import failed for", o["id"], e)
        for x in set(bpy.data.objects) - before: bpy.data.objects.remove(x, do_unlink=True)
        return fallback(o) if fallback else None
    new = [x for x in bpy.data.objects if x not in before]
    meshes = [x for x in new if x.type == "MESH"]
    if not meshes:
        for x in new: bpy.data.objects.remove(x, do_unlink=True)
        return fallback(o) if fallback else None
    bpy.context.view_layer.update()
    pts = [x.matrix_world @ Vector(c) for x in meshes for c in x.bound_box]
    mn = Vector([min(p[i] for p in pts) for i in range(3)]); mx = Vector([max(p[i] for p in pts) for i in range(3)]); dims = mx - mn
    want = (o["size"]["w"], o["size"]["d"], o["size"]["h"])
    # the plan's long side runs along the wall (x); if the model's long side runs the other way, turn it 90°
    turn = abs(want[0] - want[1]) > 0.15 and abs(dims.x - dims.y) > 0.15 and (want[0] > want[1]) != (dims.x > dims.y)
    fdims = (dims.y, dims.x, dims.z) if turn else (dims.x, dims.y, dims.z)
    # IKEA models are true to size: keep them as they are. Only rescale when every side is off by the same
    # factor (a model made in other units), never to squeeze a model into a misread size.
    ratios = [w / max(d, 1e-3) for w, d in zip(want, fdims) if w > 0.05]
    uniform = ratios and max(ratios) / min(ratios) < 1.2
    s = sum(ratios) / len(ratios) if uniform and not 0.8 <= sum(ratios) / len(ratios) <= 1.25 else 1.0
    g = place(o)
    inner = bpy.data.objects.new(o["name"] + ".model_centre", None); sc.collection.objects.link(inner)
    for x in new:
        if x.parent is None: x.parent = inner
    inner.location = (-(mn.x + mx.x) / 2, -(mn.y + mx.y) / 2, -mn.z)  # model centred on its footprint, on the floor
    root = bpy.data.objects.new(o["name"] + ".model", None); sc.collection.objects.link(root)
    inner.parent = root
    root.scale = (s, s, s); root.rotation_euler = (0, 0, math.pi / 2 if turn else 0)
    root.parent = g
    print(f"model {o['id']}: {dims.x:.2f}x{dims.y:.2f}x{dims.z:.2f} m, scale {s:.2f}{', turned 90' if turn else ''}")

BUILD = dict(floor=a_floor, wall=a_wall, window=a_window, door=a_door,
             platform=f_platform, niche=f_niche, window_seat=f_window_seat, ceiling_beam=f_beam, half_wall=f_half_wall,
             built_in_shelf=f_built_in, feature_wall=f_wall_finish, wainscoting=f_wall_finish,
             sofa=b_sofa, coffee_table=b_coffee, sideboard=b_sideboard, desk=b_desk, desk_chair=b_deskchair, shelf=b_spiral,
             pouf=b_pouf, cat_tree=b_cattree, rug=s_rug, curtain=s_curtain, throw=s_throw, cushion=s_cushion,
             ceiling_light=l_pendant, floor_lamp=l_floor, table_lamp=l_table, plant=p_plant, art=a_art, zone=z_zone,
             armchair=lambda o: (b_tube if o.get("style") == "tube" else b_lounge)(o),
             side_table=lambda o: (b_stool if o.get("style") == "stool" else b_drum)(o))
for o in LAY["objects"]:
    if o["id"] in SKIPPED: continue
    # cushions/throws were shaped for our stand-in sofa: leave them off a real product model
    if o["type"] in ("cushion", "throw") and o.get("on") in MODEL_IDS: continue
    fn = BUILD.get(o["type"], d_prop if o["layer"] == "decor" else None)
    if o["id"] in MODEL_IDS: build(o["name"], o["layer"], m_model, o, fn)
    elif fn: build(o["name"], o["layer"], fn, o)
    else: print("no builder for", o["type"])

# ---------------------------------------------------------------- daylight: v6 sun + sky, a soft area light per window
def daylight():
    sd = bpy.data.lights.new("sun", "SUN"); sd.energy = 5.6; sd.color = lin(RM.get("light", {}).get("colour", "#FFAE6E"))[:3]; sd.angle = math.radians(2.5)
    so = bpy.data.objects.new("sun", sd); sc.collection.objects.link(so)
    so.rotation_euler = T(3.2, 8.35, -10.83).to_track_quat("Z", "Y").to_euler()
build("lighting.room.sun_01", "lighting", daylight)
for wid, (a, b, sill, head) in WINS.items():
    def win_light(a=a, b=b, sill=sill, head=head):
        al = bpy.data.lights.new("window", "AREA"); al.shape = "RECTANGLE"; al.size, al.size_y = b - a, head - sill
        al.energy = 220; al.color = lin("#FFE2C2")[:3]
        ao = bpy.data.objects.new("window", al); sc.collection.objects.link(ao); ao.visible_camera = False
        ao.location = T((a + b) / 2, (sill + head) / 2, -D / 2 - TH - 0.3); ao.rotation_euler = (-math.pi / 2, 0, 0)
    for ob in build(f"lighting.{wid}.daylight_01", "lighting", win_light): ob.name = f"lighting.{wid}.daylight_01"
wo = bpy.data.worlds.new("world"); sc.world = wo; wo.use_nodes = True
bg = wo.node_tree.nodes["Background"]; bg.inputs["Color"].default_value = lin("#FFE2C6"); bg.inputs["Strength"].default_value = 0.85

# ---------------------------------------------------------------- camera: identical to v6
cd = bpy.data.cameras.new("cam"); cd.type = "ORTHO"; cd.ortho_scale = 8.9; cd.clip_end = 100
co = bpy.data.objects.new("camera", cd); sc.collection.objects.link(co); sc.camera = co
el, az = math.radians(33), math.radians(45)
target = Vector((-0.05, 0.05, 0.8)); dv = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
co.location = target + dv * 20; co.rotation_euler = dv.to_track_quat("Z", "Y").to_euler()

print("collections:", {c.name: len(c.objects) for c in COLL.values()})
if os.environ.get("SAVE_BLEND"): bpy.ops.wm.save_as_mainfile(filepath=OUT[:-4] + ".blend")

# ---------------------------------------------------------------- render, then lay a flat peach behind it
sc.render.engine = "CYCLES"; cy = sc.cycles
try:
    pr = bpy.context.preferences.addons["cycles"].preferences; pr.compute_device_type = "METAL"; pr.get_devices()
    for d_ in pr.devices: d_.use = True
    cy.device = "GPU"
except Exception as e: print("GPU not available:", e)
cy.samples = int(os.environ.get("SAMPLES", SAMPLES)); cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.02
cy.use_denoising = True; cy.denoiser = "OPENIMAGEDENOISE"
cy.max_bounces = 8; cy.diffuse_bounces = 4; cy.transparent_max_bounces = 16; cy.sample_clamp_indirect = 8
sc.render.resolution_x, sc.render.resolution_y = RES; sc.render.resolution_percentage = int(os.environ.get("PCT", 100))
sc.view_settings.view_transform = "AgX"; sc.view_settings.look = "AgX - Punchy"; sc.view_settings.exposure = 0.35
sc.render.film_transparent = True; sc.render.image_settings.file_format = "PNG"; sc.render.image_settings.color_mode = "RGBA"
sc.render.filepath = RAW
bpy.ops.render.render(write_still=True)

import numpy as np
im = bpy.data.images.load(RAW); w, h = im.size
px = np.array(im.pixels[:]).reshape(h, w, 4); a = px[..., 3:4]
o = bpy.data.images.new(TAG, w, h); o.pixels = np.dstack([px[..., :3] * a + np.array(PEACH) * (1 - a), np.ones((h, w, 1))]).ravel()
o.filepath_raw = OUT; o.file_format = "PNG"; o.save()
print("saved", OUT)

# 3D model for the app's room viewer, exported AFTER the picture is saved so an exporter crash can't lose it
if GLB:
    bpy.ops.export_scene.gltf(filepath=GLB, export_format="GLB", use_renderable=True, export_lights=False, export_cameras=False, export_apply=True)
    print("saved", GLB)
