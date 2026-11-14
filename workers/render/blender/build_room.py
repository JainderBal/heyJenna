"""hey jenna - retro motel room, built from code and rendered in Cycles.

Run:  /Applications/Blender.app/Contents/MacOS/Blender -b -P build_room.py
Layout and palette follow the "retro" preset in ../room-studio/index.html.
Positions below use the three.js convention (x right, y up, z toward camera)
and are converted to Blender (z up) by T().
"""
import bpy, bmesh, math, os, random, inspect
from mathutils import Vector

OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "render-v1.png")
SAMPLES, RES = 96, (1600, 1200)

P = dict(wall="#F2E8DA", brick="#B65F3F", floor="#A39A8C", edge="#F6EADB", sofa="#2F6E3E",
         accents=["#D6483C", "#2E4FC4", "#E9A23B", "#3A8C5C"], wood="#B9733A", rug="#C2432E",
         curtain="#E27A2C", frame="#F6EFE4", pot="#C46B45", leaf=["#3E7F3A", "#5A9A45", "#2F6B33"],
         sun="#FFB677", sky="#FFE6CC", bg="#F5DCC8")
W, D, H, TH, S = 5.2, 4.4, 2.7, 0.14, 0.18
R = random.Random(7)

# ---------------------------------------------------------------- helpers
def lin(hexc):
    h = hexc.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1.0,)

def T(x, y, z):  # three.js -> Blender
    return Vector((x, -z, y))

_mats = {}
def mat(hexc, rough=0.8, sheen=0.0, emit=None, ei=0.0):
    key = (hexc, rough, sheen, emit, ei)
    if key in _mats: return _mats[key]
    m = bpy.data.materials.new(hexc); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = lin(hexc)
    b.inputs["Roughness"].default_value = rough
    if sheen: b.inputs["Sheen Weight"].default_value = sheen; b.inputs["Sheen Roughness"].default_value = 0.6
    if emit: b.inputs["Emission Color"].default_value = lin(emit); b.inputs["Emission Strength"].default_value = ei
    _mats[key] = m; return m

def fabric(hexc): return mat(hexc, 0.95, sheen=0.5)

def mesh_obj(name, bm, material, parent, loc, bevel=0.0, smooth=True, segs=4):
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(name, me); bpy.context.collection.objects.link(ob)
    me.materials.append(material)
    if smooth:
        for p in me.polygons: p.use_smooth = True
    if bevel > 0:
        mod = ob.modifiers.new("bevel", "BEVEL"); mod.width = bevel; mod.segments = segs
        mod.limit_method = "NONE"; mod.harden_normals = True; mod.use_clamp_overlap = True
    ob.parent = parent; ob.location = T(*loc); return ob

def box(w, h, d, m, loc=(0, 0, 0), r=0.0, parent=None, rx=0.0, ry=0.0):
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts: v.co = Vector((v.co.x * w, v.co.y * d, v.co.z * h))
    ob = mesh_obj("box", bm, m, parent, loc, bevel=r, smooth=r > 0, segs=5 if r > 0.05 else 3)
    ob.rotation_euler = (rx, 0, ry); return ob

def cyl(rt, rb, h, m, loc=(0, 0, 0), parent=None, seg=48, r=0.008):
    bm = bmesh.new(); bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=rb, radius2=rt, depth=h)
    return mesh_obj("cyl", bm, m, parent, loc, bevel=r, segs=2)

def ico(rad, m, loc, parent):
    bm = bmesh.new(); bmesh.ops.create_icosphere(bm, subdivisions=1, radius=rad)
    return mesh_obj("leaf", bm, m, parent, loc, smooth=False)

def grp(x, y, z, ry=0.0):
    e = bpy.data.objects.new(inspect.stack()[1].function, None)  # named after the piece; bpy.context.collection.objects.link(e)
    e.location = T(x, y, z); e.rotation_euler = (0, 0, ry); return e

def j(v): return v + (R.random() - 0.5) * 0.18

# ---------------------------------------------------------------- textured materials
def terrazzo():
    m = bpy.data.materials.new("terrazzo"); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N["Principled BSDF"]; b.inputs["Roughness"].default_value = 0.55
    tc = N.new("ShaderNodeTexCoord")
    vor = N.new("ShaderNodeTexVoronoi"); vor.inputs["Scale"].default_value = 38
    L.new(tc.outputs["Object"], vor.inputs["Vector"])
    small = N.new("ShaderNodeMath"); small.operation = "LESS_THAN"; small.inputs[1].default_value = 0.22
    L.new(vor.outputs["Distance"], small.inputs[0])
    sep = N.new("ShaderNodeSeparateColor"); L.new(vor.outputs["Color"], sep.inputs["Color"])
    ramp = N.new("ShaderNodeValToRGB"); ramp.color_ramp.interpolation = "CONSTANT"
    chips = ["#F4EFE6", P["accents"][0], "#7E766A", P["accents"][2], "#F4EFE6", P["accents"][1], "#C9C2B6"]
    els = ramp.color_ramp.elements
    while len(els) < len(chips): els.new(0.5)
    for i, c in enumerate(chips): els[i].position = i / len(chips); els[i].color = lin(c)
    L.new(sep.outputs["Red"], ramp.inputs["Fac"])
    noise = N.new("ShaderNodeTexNoise"); noise.inputs["Scale"].default_value = 3.0
    L.new(tc.outputs["Object"], noise.inputs["Vector"])
    base = N.new("ShaderNodeMix"); base.data_type = "RGBA"; base.blend_type = "MULTIPLY"
    base.inputs["Factor"].default_value = 0.25; base.inputs["A"].default_value = lin(P["floor"])
    L.new(noise.outputs["Fac"], base.inputs["B"])
    mix = N.new("ShaderNodeMix"); mix.data_type = "RGBA"
    L.new(small.outputs[0], mix.inputs["Factor"]); L.new(base.outputs["Result"], mix.inputs["A"]); L.new(ramp.outputs["Color"], mix.inputs["B"])
    L.new(mix.outputs["Result"], b.inputs["Base Color"]); return m

def brick():
    m = bpy.data.materials.new("brick"); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    b = N["Principled BSDF"]; b.inputs["Roughness"].default_value = 0.9
    tc = N.new("ShaderNodeTexCoord"); sep = N.new("ShaderNodeSeparateXYZ"); comb = N.new("ShaderNodeCombineXYZ")
    L.new(tc.outputs["Object"], sep.inputs[0]); L.new(sep.outputs["Y"], comb.inputs["X"]); L.new(sep.outputs["Z"], comb.inputs["Y"])
    br = N.new("ShaderNodeTexBrick"); br.inputs["Scale"].default_value = 1.0
    br.inputs["Brick Width"].default_value = 0.27; br.inputs["Row Height"].default_value = 0.09
    br.inputs["Mortar Size"].default_value = 0.012; br.inputs["Mortar Smooth"].default_value = 0.3
    br.inputs["Color1"].default_value = lin(P["brick"]); br.inputs["Color2"].default_value = lin("#A4553A")
    br.inputs["Mortar"].default_value = lin("#D9B9A2"); br.inputs["Bias"].default_value = 0
    L.new(comb.outputs[0], br.inputs["Vector"]); L.new(br.outputs["Color"], b.inputs["Base Color"])
    bump = N.new("ShaderNodeBump"); bump.inputs["Strength"].default_value = 0.35
    L.new(br.outputs["Fac"], bump.inputs["Height"]); L.new(bump.outputs["Normal"], b.inputs["Normal"]); return m

def sheer(hexc):
    m = bpy.data.materials.new("sheer"); m.use_nodes = True; nt = m.node_tree; N = nt.nodes; L = nt.links
    N.remove(N["Principled BSDF"]); out = N["Material Output"]
    dif = N.new("ShaderNodeBsdfDiffuse"); dif.inputs["Color"].default_value = lin(hexc)
    tl = N.new("ShaderNodeBsdfTranslucent"); tl.inputs["Color"].default_value = lin("#FF9A45")
    tr = N.new("ShaderNodeBsdfTransparent"); tr.inputs["Color"].default_value = lin("#FFC890")
    a = N.new("ShaderNodeMixShader"); a.inputs["Fac"].default_value = 0.55
    L.new(dif.outputs[0], a.inputs[1]); L.new(tl.outputs[0], a.inputs[2])
    bmix = N.new("ShaderNodeMixShader"); bmix.inputs["Fac"].default_value = 0.4
    L.new(a.outputs[0], bmix.inputs[1]); L.new(tr.outputs[0], bmix.inputs[2])
    L.new(bmix.outputs[0], out.inputs["Surface"]); return m

# ---------------------------------------------------------------- furniture
def pillow(color, g, x, y, z, ry):
    o = box(0.42, 0.38, 0.14, fabric(color), (x, y, z), r=0.07, parent=g, rx=-0.25, ry=ry); return o

def sofa(x, z, ry):
    g = grp(x, 0, z, ry); f = fabric(P["sofa"]); w = 1.9
    for i in range(2):
        sx = -w / 2 + 0.475 + i * 0.95
        box(0.93, 0.36, 0.95, f, (sx, 0.18, 0), r=0.17, parent=g)
        box(0.9, 0.2, 0.75, f, (sx, 0.45, 0.06), r=0.1, parent=g)
        box(0.9, 0.42, 0.3, f, (sx, 0.56, -0.33), r=0.14, parent=g)
    pillow(P["accents"][0], g, -w / 2 + 0.35, 0.7, -0.14, 0.2)
    pillow(P["accents"][2], g, w / 2 - 0.35, 0.7, -0.14, -0.25)

def armchair(x, z, ry):
    g = grp(x, 0, z, ry); f = fabric(P["accents"][3])
    box(0.85, 0.34, 0.85, f, (0, 0.17, 0), r=0.17, parent=g)
    box(0.8, 0.5, 0.26, f, (0, 0.55, -0.3), r=0.13, parent=g)
    box(0.8, 0.18, 0.62, f, (0, 0.42, 0.07), r=0.09, parent=g)

def coffee(x, z):
    g = grp(x, 0, z); m = mat(P["accents"][0], 0.3)
    cyl(0.48, 0.48, 0.06, m, (0, 0.38, 0), g, r=0.02); cyl(0.2, 0.26, 0.36, m, (0, 0.18, 0), g)
    cyl(0.06, 0.05, 0.16, mat(P["accents"][1], 0.3), (0.12, 0.49, -0.1), g)
    box(0.26, 0.05, 0.2, mat(P["accents"][3]), (-0.15, 0.44, 0.08), r=0.01, parent=g, ry=0.3)

def lamp(x, z):
    g = grp(x, 0, z); metal = mat("#C9A15A", 0.35)
    cyl(0.16, 0.18, 0.04, metal, (0, 0.02, 0), g); cyl(0.015, 0.015, 1.45, metal, (0, 0.74, 0), g, seg=12, r=0)
    cyl(0.12, 0.24, 0.3, mat(P["accents"][2], 0.6, emit="#FFD9A0", ei=0.6), (0, 1.5, 0), g)
    ld = bpy.data.lights.new("lamp", "POINT"); ld.energy = 35; ld.color = lin("#FFC27A")[:3]; ld.shadow_soft_size = 0.1
    lo = bpy.data.objects.new("lamp", ld); bpy.context.collection.objects.link(lo); lo.parent = g; lo.location = T(0, 1.38, 0)

def shelf(x, z):
    g = grp(x, 0, z); wd = mat(P["wood"], 0.7); w, h = 0.9, 1.7
    for sx in (-w / 2, w / 2): box(0.04, h, 0.32, wd, (sx, h / 2, 0), r=0.005, parent=g)
    cols = P["accents"] + ["#EFE7D8", "#2E2A26"]
    for i in range(4):
        box(w, 0.035, 0.32, wd, (0, 0.12 + i * 0.5, 0), r=0.005, parent=g)
        bx = -w / 2 + 0.06
        while bx < w / 2 - 0.12:
            bw, bh = 0.04 + R.random() * 0.05, 0.24 + R.random() * 0.14
            if R.random() < 0.25: bx += 0.08; continue
            box(bw, bh, 0.22, mat(R.choice(cols), 0.8), (bx + bw / 2, 0.14 + i * 0.5 + bh / 2, 0), r=0.006, parent=g)
            bx += bw + 0.008

def console(x, z):
    g = grp(x, 0, z); wd = mat(P["wood"], 0.6)
    box(1.5, 0.5, 0.42, wd, (0, 0.3, 0), r=0.03, parent=g)
    for sx in (-0.65, 0.65): cyl(0.02, 0.02, 0.06, mat("#2a2a2a"), (sx, 0.03, 0), g, seg=10, r=0)
    box(0.6, 0.48, 0.48, mat("#EFE6D6", 0.5), (-0.25, 0.79, 0), r=0.07, parent=g)
    box(0.42, 0.32, 0.01, mat("#5A86B5", 0.2, emit="#7FB0E6", ei=0.8), (-0.28, 0.8, 0.24), parent=g)
    cyl(0.12, 0.12, 0.24, mat(P["accents"][0], 0.4), (0.45, 0.67, 0), g)

def plant(x, z, kind, s):
    g = grp(x, 0, z, R.random() * 6); pot = mat(P["pot"], 0.85); ph, pr = 0.26 * s, 0.16 * s
    cyl(pr, pr * 0.8, ph, pot, (0, ph / 2, 0), g, r=0.01)
    leaf = lambda: mat(R.choice(P["leaf"]), 0.7)
    if kind == "bush":
        for _ in range(9):
            ico((0.12 + R.random() * 0.1) * s, leaf(), ((R.random() - .5) * .3 * s, ph + (.08 + R.random() * .3) * s, (R.random() - .5) * .3 * s), g)
    elif kind == "tall":
        cyl(0.015 * s, 0.02 * s, 1.1 * s, mat("#6B5235"), (0, ph + 0.55 * s, 0), g, seg=6, r=0)
        for _ in range(9):
            o = ico(0.16 * s, leaf(), ((R.random() - .5) * .35 * s, ph + (.45 + R.random() * .75) * s, (R.random() - .5) * .35 * s), g)
            o.scale = (1, 0.6, 0.18); o.rotation_euler = ((R.random() - .5) * .8, (R.random() - .5) * .8, R.random() * 6)
    else:  # cactus
        cm = leaf(); box(0.16 * s, 0.6 * s, 0.16 * s, cm, (0, ph + 0.3 * s, 0), r=0.07 * s, parent=g)
        box(0.1 * s, 0.26 * s, 0.1 * s, cm, (0.12 * s, ph + 0.35 * s, 0), r=0.045 * s, parent=g)

# ---------------------------------------------------------------- scene
bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

edge = mat(P["edge"], 0.9); wall = mat(P["wall"], 0.92)
box(W + TH, S, D + TH, edge, (-TH / 2, -S / 2 - 0.006, -TH / 2))                       # slab with cream cut edge
box(W, 0.012, D, terrazzo(), (0, 0, 0))                                                 # floor
box(TH, H, D + TH, brick(), (-W / 2 - TH / 2, H / 2, -TH / 2))                          # left brick wall
box(TH + 0.004, 0.025, D + TH + 0.004, edge, (-W / 2 - TH / 2, H + 0.012, -TH / 2))
wx, ww, sill, head, z = W * 0.12, min(W * 0.48, 2.7), 0.42, 2.36, -D / 2 - TH / 2       # back wall with opening
ll, rl = (wx - ww / 2) - (-W / 2 - TH), W / 2 - (wx + ww / 2)
box(ll, H, TH, wall, (-W / 2 - TH + ll / 2, H / 2, z)); box(rl, H, TH, wall, (W / 2 - rl / 2, H / 2, z))
box(ww, sill, TH, wall, (wx, sill / 2, z)); box(ww, H - head, TH, wall, (wx, head + (H - head) / 2, z))
box(W + TH + 0.004, 0.025, TH + 0.004, edge, (-TH / 2, H + 0.012, z))
fr = mat(P["frame"], 0.5); cols = max(3, round(ww / 0.42))
for i in range(cols + 1): box(0.04, head - sill, 0.06, fr, (wx - ww / 2 + i * ww / cols, (sill + head) / 2, z), r=0.005)
for y in (sill, sill + (head - sill) * 0.36, sill + (head - sill) * 0.7, head): box(ww, 0.04, 0.06, fr, (wx, y, z), r=0.005)
cm = sheer(P["curtain"])                                                                # sheer curtains
for side in (-1, 1):
    for k in range(4):
        box(0.13, head - 0.05, 0.05, cm, (wx + side * (ww / 2 + 0.05 - k * 0.11), (head - 0.05) / 2 + 0.03, -D / 2 + 0.07 + (k % 2) * 0.04), r=0.02)

zc = j(D * 0.1); sofaX = -W / 2 + 0.58; rugX = sofaX + 1.5
sofa(sofaX, zc, math.pi / 2)
cyl(1.15, 1.15, 0.02, mat(P["rug"], 1.0, sheen=0.4), (rugX, 0.012, zc), seg=96, r=0.005)
coffee(rugX, zc)
armchair(min(rugX + 1.45, W / 2 - 0.55), zc + 0.75, -math.pi / 2 - 0.55)
lamp(-W / 2 + 0.32, zc - 1.25)
shelf(-W / 2 + 0.62, -D / 2 + 0.2)
console(wx, -D / 2 + 0.24)
for i in range(3):                                                                      # art over the sofa
    zz, yy = zc - 0.55 + i * 0.55, 1.62 + (0.12 if i == 1 else 0)
    box(0.04, 0.6, 0.48, fr, (-W / 2 + 0.02, yy, zz), r=0.01)
    box(0.01, 0.46, 0.34, mat(P["accents"][i], 0.8), (-W / 2 + 0.045, yy, zz))
for x, zz, kind, s in [(W / 2 - .35, -D / 2 + .35, "tall", 1.15), (-W / 2 + .35, D / 2 - .4, "bush", 1.0),
                       (W / 2 - .35, D / 2 - .45, "bush", 0.9), (wx + ww / 2 + .3, -D / 2 + .3, "cactus", 1.0)]:
    plant(j(x) * 0.98, j(zz) * 0.98, kind, s)
box(0.5, 0.36, 0.5, fabric(P["accents"][2]), (min(W / 2 - 0.9, rugX + 1.6), 0.18, zc - 0.85), r=0.16)  # pouf

# sun: low warm light from behind the window wall (time 0.72 in the studio)
sd = bpy.data.lights.new("sun", "SUN"); sd.energy = 5.0; sd.color = lin(P["sun"])[:3]; sd.angle = math.radians(2.5)
so = bpy.data.objects.new("sun", sd); sc.collection.objects.link(so)
so.rotation_euler = T(3.72, 8.35, -10.83).to_track_quat("Z", "Y").to_euler()

# world: soft warm sky for lighting, flat peach for what the camera sees
wo = bpy.data.worlds.new("world"); sc.world = wo; wo.use_nodes = True; N = wo.node_tree.nodes; L = wo.node_tree.links
bgL = N["Background"]; bgL.inputs["Color"].default_value = lin(P["sky"]); bgL.inputs["Strength"].default_value = 0.75
bgC = N.new("ShaderNodeBackground"); bgC.inputs["Color"].default_value = lin(P["bg"]); bgC.inputs["Strength"].default_value = 1.25
lp = N.new("ShaderNodeLightPath"); mx = N.new("ShaderNodeMixShader")
L.new(lp.outputs["Is Camera Ray"], mx.inputs["Fac"]); L.new(bgL.outputs[0], mx.inputs[1]); L.new(bgC.outputs[0], mx.inputs[2])
L.new(mx.outputs[0], N["World Output"].inputs["Surface"])

# orthographic camera, 35 deg down, 45 deg turned
cd = bpy.data.cameras.new("cam"); cd.type = "ORTHO"; cd.ortho_scale = 8.6
co = bpy.data.objects.new("cam", cd); sc.collection.objects.link(co); sc.camera = co
el, az = math.radians(35), math.radians(45)
target = Vector((-0.1, 0.1, 0.85)); dirv = Vector((math.sin(az) * math.cos(el), -math.cos(az) * math.cos(el), math.sin(el)))
co.location = target + dirv * 20; co.rotation_euler = dirv.to_track_quat("Z", "Y").to_euler()
cd.clip_end = 100

# render settings
sc.render.engine = "CYCLES"; cy = sc.cycles
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "METAL"; prefs.get_devices()
    for d in prefs.devices: d.use = True
    cy.device = "GPU"
except Exception as e:
    print("GPU not available, using CPU:", e)
cy.samples = SAMPLES; cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.02
cy.use_denoising = True; cy.denoiser = "OPENIMAGEDENOISE"
cy.max_bounces = 8; cy.diffuse_bounces = 4; cy.transparent_max_bounces = 16; cy.sample_clamp_indirect = 8
sc.render.resolution_x, sc.render.resolution_y = RES; sc.render.resolution_percentage = 100
sc.view_settings.view_transform = "AgX"
try: sc.view_settings.look = "AgX - Punchy"
except TypeError: print("Punchy look not found")
sc.view_settings.exposure = 0.2
sc.render.image_settings.file_format = "PNG"; sc.render.filepath = OUT
if __name__ == "__main__":  # build_room_v2.py reuses this scene without rendering
    bpy.ops.render.render(write_still=True)
    print("saved", OUT)
