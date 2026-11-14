"""hey jenna - interior design logic layer.

Takes a room + needs + a moodboard style profile + a furniture list (JSON) and
returns a checked, layered layout (layout.json) that the Blender script renders.

    python3 design_logic.py example_input.json -o layout.json \
        --report rule-report.md --svg layout-plan.svg \
        [--profile profiles/garden.json] [--taste taste.json]

Plan coordinates (metres): x runs left wall -> right wall (0..width), y runs
back wall -> front wall (0..depth). rotation_deg = the direction an object's
front faces: 0 faces +y (out from the back wall), 90 faces +x, 180 -y, 270 -x.

Pipeline: analyse room -> focal point -> taste (profile, then optional AI hook)
-> try anchor positions, placing every zone and room feature for each, keep
the best -> styling (cat tree, plants) -> fill empty floor until balanced ->
soft furnishings + props -> 60/30/10 colours -> check every rule -> layers,
names -> export. See README.md. Standard library only.
"""
import argparse, copy, json, math, os

# ---------------------------------------------------------------- the rules (all in metres). The style profile never changes these.
R = dict(
    walkway=0.90,            # main circulation routes
    squeeze=0.38,            # minimum to reach a seat / shelf front (secondary path)
    coffee_gap=(0.40, 0.45), # sofa front -> coffee table edge
    coffee_ratio=2 / 3,      # coffee table length vs sofa length
    coffee_tol=0.15,         # +-15 % of that ratio still passes
    rug_tuck=0.15,           # rug runs this far under the front of each seat
    rug_beyond=0.15,         # ideal rug overhang past each end of the sofa
    art_centre=1.45,         # gallery standard centre height
    art_ratio=2 / 3,         # art span vs furniture below
    art_gap=(0.15, 0.30),    # gap between furniture top and art bottom
    door_depth=0.90,         # keep this much clear in front of a door
    window_band=0.45,        # tall things stay this far from a window
    conversation_max=3.0,    # seat-to-seat distance across a conversation group
    reach=0.75,              # every seat has a surface within reach
    task_light=1.5,          # task zones need a lamp this close
    zone_pad=0.30,           # breathing room between pieces of different zones
    feature_pad=0.15,        # room features vs furniture of other zones
    balance=(0.10, 0.18),    # centre of visual weight off room centre (pass, warn) as a share of room size
    split=dict(dominant=0.60, secondary=0.30, accent=0.10), split_tol=0.08,
    empty_min=(0.9, 1.0),    # an empty floor region: shortest side (m), area (m2)
    fill_rounds=5,
)
GRID = 0.05
WALLS = ("back", "left", "right", "front")
LAYERS = ["architecture", "features", "zones", "furniture", "soft_furnishings", "lighting", "decor", "plants", "art"]
TYPE_LAYER = {
    **{t: "architecture" for t in ("floor", "wall", "window", "door")},
    **{t: "features" for t in ("platform", "niche", "built_in_shelf", "half_wall", "feature_wall", "wainscoting", "window_seat", "ceiling_beam")},
    "zone": "zones",
    **{t: "furniture" for t in ("sofa", "armchair", "coffee_table", "side_table", "shelf", "desk", "desk_chair", "sideboard", "cat_tree", "pouf")},
    **{t: "soft_furnishings" for t in ("rug", "curtain", "throw", "cushion")},
    **{t: "lighting" for t in ("ceiling_light", "floor_lamp", "table_lamp")},
    **{t: "decor" for t in ("vase", "books", "book", "computer", "paper", "mug", "cup")},
    "plant": "plants", "art": "art",
}

# ---------------------------------------------------------------- style profile (filled from the moodboard)
DEFAULT_PROFILE = dict(
    name="default",
    palette=dict(dominant=["#F1E7DA", "#CBC3B7"], secondary=["#2F6E3E", "#B9733A"], accent=["#D6483C", "#2E4FC4", "#E9A23B"]),
    shape_family="retro",                      # retro | modern | garden (the Blender builders implement retro today)
    materials=dict(wood="#B9733A", wood_light="#D3A06A", metal="chrome", floor=None, curtain="#E27A2C", fabric="wool"),
    styling_density=None,                      # sparse | balanced | layered; None = let the taste step decide
    plant_count=None,                          # None = from styling density
    art=dict(content="abstract colour blocks", arrangement="gallery", colours=None),
    light_warmth_k=2700,
    features=dict(allow=["platform", "niche", "built_in_shelf", "half_wall", "feature_wall", "wainscoting", "window_seat", "ceiling_beam"], prefer=[], max=2),
    fillers=["lounge_chair", "plant_group", "side_table", "pouf", "reading_lamp"],
)


def merge(a, b):
    out = copy.deepcopy(a)
    for k, v in (b or {}).items():
        out[k] = merge(out[k], v) if isinstance(v, dict) and isinstance(out.get(k), dict) else copy.deepcopy(v)
    return out


def load_profile(spec, override=None):
    base = spec.get("style_profile") or {}
    if not base and "style" in spec: base = dict(name=spec["style"].get("name"), palette=spec["style"]["palette"])  # old inputs
    p = merge(merge(DEFAULT_PROFILE, base), override)
    if override and "palette" in override: p["palette"] = copy.deepcopy(override["palette"])
    return p


# ---------------------------------------------------------------- geometry
class Box:
    """Oriented footprint: centre, width (along the front), depth, rotation (deg)."""
    def __init__(s, cx, cy, w, d, rot=0.0):
        s.cx, s.cy, s.w, s.d, s.rot = cx, cy, w, d, rot % 360
        t = math.radians(s.rot); s.f = (math.sin(t), math.cos(t)); s.r = (math.cos(t), -math.sin(t))

    def pt(s, a, b): return (s.cx + s.r[0] * a + s.f[0] * b, s.cy + s.r[1] * a + s.f[1] * b)

    def local(s, x, y):
        dx, dy = x - s.cx, y - s.cy
        return (dx * s.r[0] + dy * s.r[1], dx * s.f[0] + dy * s.f[1])

    def corners(s): return [s.pt(a * s.w / 2, b * s.d / 2) for a, b in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    def contains(s, x, y, pad=0.0): a, b = s.local(x, y); return abs(a) <= s.w / 2 + pad and abs(b) <= s.d / 2 + pad
    def front(s, off=0.0): return s.pt(0, s.d / 2 + off)

    def bbox(s):
        c = s.corners(); xs, ys = [p[0] for p in c], [p[1] for p in c]
        return min(xs), min(ys), max(xs), max(ys)

    def overlaps(s, o, pad=0.0):  # separating axis test
        for ax in (s.f, s.r, o.f, o.r):
            p1 = [x * ax[0] + y * ax[1] for x, y in s.corners()]
            p2 = [x * ax[0] + y * ax[1] for x, y in o.corners()]
            if max(p1) + pad <= min(p2) or max(p2) + pad <= min(p1): return False
        return True

    def gap(s, o):
        if s.overlaps(o): return 0.0
        best = 9e9
        for b1, b2 in ((s, o), (o, s)):
            for x, y in b1.corners() + [b1.pt(0, b1.d / 2), b1.pt(0, -b1.d / 2), b1.pt(b1.w / 2, 0), b1.pt(-b1.w / 2, 0)]:
                a, b = b2.local(x, y)
                best = min(best, math.hypot(max(abs(a) - b2.w / 2, 0), max(abs(b) - b2.d / 2, 0)))
        return best


def dist(a, b): return math.hypot(a[0] - b[0], a[1] - b[1])
def facing(fx, fy): return math.degrees(math.atan2(fx, fy)) % 360
def r3(v): return round(v, 3)
def bbox_box(boxes, m=0.0):
    bb = [b.bbox() for b in boxes]
    x0, y0, x1, y1 = min(b[0] for b in bb) - m, min(b[1] for b in bb) - m, max(b[2] for b in bb) + m, max(b[3] for b in bb) + m
    return Box((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, 0)


# ---------------------------------------------------------------- room
class Room:
    ROT = dict(back=0, left=90, right=270, front=180)

    def __init__(s, spec):
        s.spec = spec; s.W, s.D, s.H = spec["width"], spec["depth"], spec.get("wall_height", 2.7)
        s.open_walls = set(spec.get("open_walls_in_render", []))
        s.windows = [dict(o, id=o.get("id", f"window{i + 1}"), sill=o.get("sill", 0.8), head=o.get("head", 2.2)) for i, o in enumerate(spec.get("windows", []))]
        s.doors = [dict(o, id=o.get("id", f"door{i + 1}"), swing=o.get("swing", "in")) for i, o in enumerate(spec.get("doors", []))]
        s.light = spec.get("light", {}); s.area = s.W * s.D

    def wall_len(s, wall): return s.W if wall in ("back", "front") else s.D
    def at(s, wall, u, off): return {"back": (u, off), "front": (u, s.D - off), "left": (off, u), "right": (s.W - off, u)}[wall]
    def against(s, wall, u, w, d, off=0.0): x, y = s.at(wall, u, off + d / 2); return Box(x, y, w, d, s.ROT[wall])
    def openings(s, wall): return [o for o in s.windows + s.doors if o["wall"] == wall]
    def feature_wall(s): return next((w for w, f in s.spec.get("walls", {}).items() if f.get("feature")), None)

    def blank_runs(s, wall):
        L, cuts, runs, a = s.wall_len(wall), sorted((o["position"] - o["width"] / 2, o["position"] + o["width"] / 2) for o in s.openings(wall)), [], 0.0
        for c0, c1 in cuts:
            if c0 - a > 0.05: runs.append((a, c0))
            a = max(a, c1)
        if L - a > 0.05: runs.append((a, L))
        return runs

    def door_zones(s):
        return [(d, s.against(d["wall"], d["position"], d["width"] + 0.2, max(R["door_depth"], d["width"] if d["swing"] == "in" else 0))) for d in s.doors]

    def window_zones(s): return [(w, s.against(w["wall"], w["position"], w["width"] + 0.3, R["window_band"])) for w in s.windows]
    def window_centre(s, w): return s.at(w["wall"], w["position"], 0.0)

    def daylight(s, p):
        return max([min(1.0, w["width"] / 1.5) / (1 + dist(p, s.window_centre(w)) ** 2 / 2.0) for w in s.windows] or [0])

    def cam(s):
        return (1 if "right" in s.open_walls else -1 if "left" in s.open_walls else 0, 1 if "front" in s.open_walls else -1 if "back" in s.open_walls else 0)

    def faces_camera(s, rot):
        f = (math.sin(math.radians(rot)), math.cos(math.radians(rot))); c = s.cam()
        return f[0] * c[0] + f[1] * c[1] > -0.2

    def camera_corner(s, cx, cy):  # the corner nearest the render camera (both walls cut away)
        c = s.cam(); return (cx == (s.W if c[0] > 0 else 0)) and (cy == (s.D if c[1] > 0 else 0)) and c[0] and c[1]


# ---------------------------------------------------------------- the layout being built
class Layout:
    def __init__(s, room, prof, V=None):
        s.room, s.prof, s.objs, s.reserved, s.zones, s.V, s.focal, s.needs = room, prof, [], [], {}, V or {}, None, []
        s.notes, s.unplaced, s.penalty, s.features, s.fill_log = [], [], 0.0, [], []

    def add(s, item, box, zone, mount="floor", elev=0.0, **meta):
        o = dict(id=item["id"], type=item["type"], name=item.get("name", item["type"]), zone=zone, box=box,
                 h=item["size"]["h"], mount=mount, elev=elev, item=item, meta=meta)
        s.objs.append(o); return o

    def get(s, oid): return next((o for o in s.objs if o["id"] == oid), None)
    def floor(s): return [o for o in s.objs if o["mount"] == "floor" and o["type"] != "rug"]

    def fits(s, box, h, zone=None, pad=None, ignore=(), rug=False):
        W, D = s.room.W, s.room.D
        if any(x < -1e-6 or y < -1e-6 or x > W + 1e-6 or y > D + 1e-6 for x, y in box.corners()): return False
        if rug: return True
        pad = R["zone_pad"] if pad is None else pad
        for o in s.floor():
            if o["id"] in ignore: continue
            p = (R["feature_pad"] if TYPE_LAYER.get(o["type"]) == "features" else pad) if (zone and o["zone"] != zone and o["meta"].get("serves") != zone) else 0.0
            if box.overlaps(o["box"], p): return False
        for d, z in s.room.door_zones():
            if box.overlaps(z): return False
        for w, z in s.room.window_zones():
            if h > w["sill"] - 0.02 and box.overlaps(z): return False
        for owner, z in s.reserved:
            if owner != zone and box.overlaps(z): return False
        return True


def mk(id_, type_, w, d, h, **kw): return dict(id=id_, type=type_, size=dict(w=w, d=d, h=h), colour=kw.pop("colour", "auto"), **kw)


# ---------------------------------------------------------------- 1. focal point + zones
def focal_candidates(room, needs, items):
    cands = []
    for f in room.spec.get("features", []):
        if f.get("type") == "fireplace": cands.append(dict(kind="fireplace", wall=f["wall"], position=f["position"], score=10, why="fireplace"))
    if any("tv" in n.lower() for n in needs) and any(i["type"] == "tv" for i in items):
        tv = next(i for i in items if i["type"] == "tv")
        if tv.get("wall"): cands.append(dict(kind="media", wall=tv["wall"], position=tv.get("position", room.wall_len(tv["wall"]) / 2), score=8, why="the brief mentions TV"))
    for w in room.windows:
        if w.get("view", "plain") in ("garden", "park", "sea", "skyline", "good"):
            cands.append(dict(kind="view", wall=w["wall"], position=w["position"], score=9 + w["width"], why=f"{w['view']} view through {w['id']}"))
    for wall in WALLS:
        wins = [w for w in room.windows if w["wall"] == wall]
        if not wins: continue
        glaz = sum(w["width"] for w in wins) / room.wall_len(wall)
        if glaz < 0.35: continue
        a, b = min(w["position"] - w["width"] / 2 for w in wins), max(w["position"] + w["width"] / 2 for w in wins)
        feat = room.spec.get("walls", {}).get(wall, {}).get("feature")
        cands.append(dict(kind="windows", wall=wall, position=(a + b) / 2, span=(a, b), score=6 + 4 * glaz + (1 if feat else 0) - (6 if wall in room.open_walls else 0),
                          why=f"the {wall} wall is {glaz * 100:.0f}% glass{' set in the brick feature wall' if feat else ''}: the daylight and the strongest architecture"))
    for wall in WALLS:
        for a, b in room.blank_runs(wall):
            L = b - a
            if L < 2.4: continue
            cands.append(dict(kind="gallery", wall=wall, position=(a + b) / 2, run=(a, b), score=4 + L / 2 - (6 if wall in room.open_walls else 0),
                              why=f"an art wall on the longest blank wall ({wall}, {L:.1f} m) as the created focal point"))
    return sorted(cands, key=lambda c: -c["score"])


def choose_focal(room, needs, items, pick=None):
    cands = focal_candidates(room, needs, items)
    if pick:
        m = [c for c in cands if c["kind"] == pick.get("kind") and (not pick.get("wall") or c["wall"] == pick["wall"])]
        if m: return m[0]
    return cands[0]


def assign_zones(items, needs, lounge=None):
    """Which zone each item belongs to. lounge="conversation" sends the comfy chair to the sofa group."""
    z = {}
    chairs = [i for i in items if i["type"] == "armchair"]
    reads = any(k in " ".join(needs).lower() for k in ("read", "book")) or any(i["type"] == "shelf" for i in items)
    comfy = sorted(chairs, key=lambda i: -("lounge" in i.get("tags", []) or "upholstered" in i.get("tags", [])))
    for k, c in enumerate(comfy): z[c["id"]] = "reading" if (k == 0 and reads and len(chairs) > 1 and lounge != "conversation") else "conversation"
    has_reading = "reading" in z.values()
    for i in items:
        t = i["type"]
        if t in ("sofa", "coffee_table", "rug", "ceiling_light"): z[i["id"]] = "conversation"
        elif t in ("desk", "desk_chair"): z[i["id"]] = "work"
        elif t == "floor_lamp": z[i["id"]] = "reading" if has_reading else "conversation"
        elif t == "shelf": z[i["id"]] = "reading" if has_reading else "storage"
        elif t == "side_table": z.setdefault(i["id"], "reading" if ("reading" in i.get("tags", []) and has_reading) else "conversation")
        else: z.setdefault(i["id"], i.get("zone", "styling"))
    return z


# ---------------------------------------------------------------- 4. taste hook
def default_taste(brief):
    """Rule-based stand-in for the AI taste step: the boldest large piece is the statement,
    styling density from room size and needs."""
    big = sorted(brief["furniture"], key=lambda i: -(i["size"]["w"] * i["size"]["d"] * (1.5 if i.get("colour", "auto") != "auto" else 1)))
    statement = next((i["id"] for i in big if i["type"] in ("sofa", "armchair", "rug")), big[0]["id"])
    area = brief["room"]["width"] * brief["room"]["depth"]
    density = "layered" if area > 30 else "balanced" if area > 14 else "sparse"
    if any("minimal" in n.lower() for n in brief["needs"]): density = "sparse"
    return {"statement_piece": statement, "styling_density": density, "source": "rules", "notes": "rule-based default"}


# Set to a callable (e.g. one that asks Claude) to add an AI taste pass. It gets the brief
# (room, needs, style_profile, furniture) and returns {"statement_piece": id,
# "styling_density": "sparse"|"balanced"|"layered", "notes": str}. Precedence:
# --taste / TASTE_HOOK > style profile > rules. Placement and checks run after it.
TASTE_HOOK = None
DENSITY = {"sparse": dict(plants=2, pillows=1, throw=False, props=1), "balanced": dict(plants=4, pillows=2, throw=True, props=2),
           "layered": dict(plants=6, pillows=3, throw=True, props=3)}


def run_taste(spec, prof, override=None):
    brief = dict(room=spec["room"], needs=spec.get("needs", []), style_profile=prof, furniture=spec["furniture"])
    t = default_taste(brief)
    if prof.get("styling_density") in DENSITY: t.update(styling_density=prof["styling_density"], source="moodboard", notes=f"density from the {prof['name']} profile")
    sugg = override or (TASTE_HOOK(copy.deepcopy(brief)) if TASTE_HOOK else None)
    if sugg:
        ids = {i["id"] for i in spec["furniture"]}
        if sugg.get("statement_piece") in ids: t["statement_piece"] = sugg["statement_piece"]
        if sugg.get("styling_density") in DENSITY: t["styling_density"] = sugg["styling_density"]
        t["source"], t["notes"] = sugg.get("source", "ai"), sugg.get("notes", "")
    t["plants"] = prof["plant_count"] if prof.get("plant_count") is not None else DENSITY[t["styling_density"]]["plants"]
    return t


# ---------------------------------------------------------------- 2. placement: zones
def pick_option(it, score): return min(it.get("options") or [it["size"]], key=score)


def place_conversation(L, items, zones, focal, cand):
    room = L.room; V = L.V
    sofa = next(i for i in items if i["type"] == "sofa"); ss = sofa["size"]
    sb = room.against(cand["wall"], cand["u"], ss["w"], ss["d"], cand["back_gap"])
    if not L.fits(sb, ss["h"], "conversation"): return False
    so = L.add(sofa, sb, "conversation", floating=cand["back_gap"] > 0)

    ct = next((i for i in items if i["type"] == "coffee_table"), None); tb = None; gap = sum(R["coffee_gap"]) / 2; td = tw = 0
    if ct:
        opt = pick_option(ct, lambda o: abs(max(o["w"], o["d"]) / ss["w"] - R["coffee_ratio"]))
        tw, td = max(opt["w"], opt["d"]), min(opt["w"], opt["d"])
        tb = Box(*sb.pt(0, ss["d"] / 2 + gap + td / 2), tw, td, sb.rot)
        if not L.fits(tb, opt["h"], "conversation"): return False
        L.add(ct, tb, "conversation", shape=opt.get("shape", "rect"))["h"] = opt["h"]

    chairs = [i for i in items if i["type"] == "armchair" and zones[i["id"]] == "conversation"]
    group = [sb] + ([tb] if tb else []); arr = cand["arr"]
    ends = sorted((1, -1), key=lambda k: dist(sb.pt(k * ss["w"], 0), (room.W / 2, room.D / 2)))
    if arr == "U":  # chairs at the table ends facing each other: the U opens to the focal
        for c in chairs:
            cs = c["size"]; along = (tw / 2 if tb else ss["w"] / 2) + 0.42 + cs["d"] / 2
            for side in list(ends):
                cb = Box(*sb.pt(side * along, ss["d"] / 2 + gap + td / 2), cs["w"], cs["d"], sb.rot + (270 if side > 0 else 90))
                if L.fits(cb, cs["h"], "conversation"):
                    L.add(c, cb, "conversation"); group.append(cb); ends.remove(side); break
            else: return False
    elif arr == "L":  # chairs in a row off one end of the sofa, turned in toward the table
        for side in ends:
            boxes = []
            for i, c in enumerate(chairs):
                cs = c["size"]; b_ = ss["d"] / 2 + 0.12 + cs["w"] / 2 + i * (cs["w"] + 0.15)
                boxes.append(Box(*sb.pt(side * (ss["w"] / 2 + 0.12 + cs["d"] / 2), b_), cs["w"], cs["d"], sb.rot + (270 if side > 0 else 90) - side * 12))
            if all(L.fits(b, c["size"]["h"], "conversation") for b, c in zip(boxes, chairs)) and not any(a.overlaps(b) for k, a in enumerate(boxes) for b in boxes[k + 1:]):
                for b, c in zip(boxes, chairs): L.add(c, b, "conversation"); group.append(b)
                break
        else: return False
    else:  # facing: chairs across the table, toed in
        far = (ss["d"] / 2 + gap + td + 0.42) if tb else ss["d"] / 2 + 1.3
        offs = [0.0] if len(chairs) == 1 else [-0.5, 0.5] if len(chairs) == 2 else []
        for c, a in zip(chairs, offs):
            cs = c["size"]; toe = -18 * (a / 0.5) if a else 0
            cb = Box(*sb.pt(a * ss["w"], far + cs["d"] / 2), cs["w"], cs["d"], sb.rot + 180 + toe)
            if not L.fits(cb, cs["h"], "conversation"): return False
            L.add(c, cb, "conversation"); group.append(cb)

    seats = [o for o in L.objs if o["zone"] == "conversation" and o["type"] in ("sofa", "armchair")]
    mode = V.get("rug", "front"); pts = []
    for o in seats:
        b = o["box"]
        if mode == "all": pts += [b.pt(a * (b.w / 2 + 0.15), c_ * (b.d / 2 + 0.1)) for a in (-1, 1) for c_ in (-1, 1)]
        else: pts += [b.pt(a * b.w / 2, b.d / 2 - R["rug_tuck"]) for a in (-1, 1)] + [b.pt(a * b.w / 2, b.d / 2) for a in (-1, 1)]
    if tb: pts += tb.corners()
    pts += [sb.pt(k * (ss["w"] / 2 + R["rug_beyond"]), ss["d"] / 2 - R["rug_tuck"]) for k in (-1, 1)]
    loc = [sb.local(*p) for p in pts]
    a0, a1, b0, b1 = min(p[0] for p in loc), max(p[0] for p in loc), min(p[1] for p in loc), max(p[1] for p in loc)
    rug = next((i for i in items if i["type"] == "rug"), None)
    if rug:
        need_w, need_d = a1 - a0, b1 - b0
        def ok(o):
            if o.get("shape") == "round": return o["w"] / 2 >= math.hypot(need_w / 2, need_d / 2)
            return max(o["w"], o["d"]) >= need_w - 1e-6 and min(o["w"], o["d"]) >= need_d - 1e-6
        def rug_cost(o):
            want_round = mode == "round"
            return (0 if ok(o) else 1, 0 if (o.get("shape") == "round") == want_round else 1, o["w"] * o["d"])
        opt = pick_option(rug, rug_cost)
        if mode == "round" and opt.get("shape") != "round": L.notes.append("variant asked for a round rug; no round option reaches the front legs of every seat, so a rectangle was used")
        if mode == "all" and not ok(opt): L.notes.append("variant asked for a rug under all the seating; no option is that big, so the largest one was used")
        if not ok(opt): opt = max(rug.get("options") or [rug["size"]], key=lambda o: o["w"] * o["d"])
        rw, rd = (max(opt["w"], opt["d"]), min(opt["w"], opt["d"])) if opt.get("shape") != "round" else (opt["w"], opt["d"])
        rb = Box(*sb.pt((a0 + a1) / 2, (b0 + b1) / 2), rw, rd, sb.rot)
        if not L.fits(rb, 0.02, rug=True):
            x0, y0, x1, y1 = rb.bbox(); rb = Box(rb.cx - max(0, x1 - room.W) + max(0, -x0), rb.cy - max(0, y1 - room.D) + max(0, -y0), rw, rd, sb.rot)
        L.add(rug, rb, "conversation", shape=opt.get("shape", "rect"), rug_mode=mode)

    L.reserved.append(("conversation", bbox_box(group[1:] or group, 0.0) if len(group) > 1 else sb))
    L.zones["conversation"] = dict(centre=tb.pt(0, 0) if tb else sb.front(1.0), anchor=so["id"], faces_focal=cand["faces"], orient=cand["orient"], arr=arr)

    art = next((i for i in items if i["type"] == "art"), None)
    if art and cand["orient"] == "under_art" and cand["wall"] not in room.open_walls:
        art_over(L, art, so, cand["wall"], focal=True)

    cl = next((i for i in items if i["type"] == "ceiling_light"), None)
    if cl:
        c = tb.pt(0, 0) if tb else sb.front(1.0); s3 = cl["size"]
        L.add(cl, Box(*c, s3["w"], s3["d"]), "conversation", mount="ceiling", elev=cl.get("hang_height", 2.05))
    return True


def place_conv_side_table(L, items, zones):
    st = next((i for i in items if i["type"] == "side_table" and zones[i["id"]] == "conversation"), None)
    so = next((o for o in L.objs if o["type"] == "sofa"), None)
    if not (st and so): return
    sb, s2 = so["box"], st["size"]
    for side in (1, -1):
        b = Box(*sb.pt(side * (sb.w / 2 + 0.06 + s2["w"] / 2), -sb.d / 2 + s2["d"] / 2 + 0.1), s2["w"], s2["d"], sb.rot)
        if L.fits(b, s2["h"], "conversation"): L.add(st, b, "conversation"); return
    L.unplaced.append((st["id"], "no room at either sofa end"))


def corner_seat(L, chair, lamp, cx, cy, zone, face_to=None):
    """Chair angled out of a corner, lamp tucked behind its shoulder. Returns boxes or None."""
    sx, sy = (1 if cx == 0 else -1), (1 if cy == 0 else -1); cs = chair["size"]
    m = (lamp["size"]["w"] / 2 + 0.04) if lamp else 0.1
    k = m + (cs["d"] / 2 + (lamp["size"]["w"] / 2 * 1.42 if lamp else 0) + 0.04) / 1.42
    k = max(k, (cs["w"] + cs["d"]) / 2 * 0.7072 + 0.04)  # an angled chair must clear both walls
    c = (cx + sx * k, cy + sy * k)
    f = (sx, sy)
    if face_to:  # turn toward a point, but no more than 30 degrees off the corner diagonal
        want = facing(face_to[0] - c[0], face_to[1] - c[1]); diag = facing(sx, sy)
        dlt = (want - diag + 180) % 360 - 180; rot = diag + max(-30, min(30, dlt))
    else: rot = facing(*f)
    cb = Box(*c, cs["w"], cs["d"], rot)
    if not L.fits(cb, cs["h"], zone): return None
    lb = None
    if lamp:
        ls = lamp["size"]; lb = Box(cx + sx * m, cy + sy * m, ls["w"], ls["d"])
        if not L.fits(lb, ls["h"], zone) or lb.overlaps(cb): return None
    return cb, lb


def side_table_for(L, seat_box, st, zone):
    s2 = st["size"]
    for fwd in (0.1, 0.25, 0.0, 0.4):
        for k in (1, -1):
            b = Box(*seat_box.pt(k * (seat_box.w / 2 + 0.05 + s2["w"] / 2), fwd), s2["w"], s2["d"], seat_box.rot)
            if L.fits(b, s2["h"], zone): return b
    return None


def place_reading(L, items, zones):
    """Reading chair where the daylight is: beside a window (light over the shoulder) or a bright
    corner; lamp behind the shoulder, side table at hand, shelf on the nearest wall."""
    room = L.room
    chair = next((i for i in items if i["type"] == "armchair" and zones[i["id"]] == "reading"), None)
    if not chair: return
    lamp = next((i for i in items if i["type"] == "floor_lamp"), None)
    side = next((i for i in items if i["type"] == "side_table" and zones[i["id"]] == "reading"), None)
    shelf = next((i for i in items if i["type"] == "shelf"), None)
    cs = chair["size"]; spots = []
    for cx, cy in ((0, 0), (room.W, 0), (0, room.D), (room.W, room.D)):
        r_ = corner_seat(L, chair, lamp, cx, cy, "reading")
        if r_: spots.append((r_[0], r_[1], (cx, cy)))
    for w in room.windows:
        away = (math.sin(math.radians(room.ROT[w["wall"]])), math.cos(math.radians(room.ROT[w["wall"]])))
        for sgn in (-1, 1):
            u = w["position"] + sgn * (w["width"] / 2 - 0.05)
            for off in (1.0, 1.15):
                x, y = room.at(w["wall"], u, off)
                c0 = room.window_centre(w); along = (x - c0[0], y - c0[1]); n = math.hypot(*along) or 1
                f = (away[0] + 0.7 * along[0] / n, away[1] + 0.7 * along[1] / n)  # turned away from the glass: light over the shoulder
                cb = Box(x, y, cs["w"], cs["d"], facing(*f))
                if not L.fits(cb, cs["h"], "reading"): continue
                lb = None
                if lamp:
                    ls = lamp["size"]; corr = focal_corridor(L)
                    opts = [Box(*cb.pt(k * (cs["w"] / 2 + ls["w"] / 2 + 0.05), bb), ls["w"], ls["d"])
                            for k in (1, -1) for bb in (-cs["d"] / 2 + ls["w"] / 2, 0.0, cs["d"] / 2 - ls["w"] / 2)]
                    opts = [o for o in opts if L.fits(o, ls["h"], "reading") and not o.overlaps(cb)]
                    opts.sort(key=lambda o: bool(corr and o.overlaps(corr)))  # outside the view to the focal first
                    if not opts: continue
                    lb = opts[0]
                spots.append((cb, lb, None))
    corr = focal_corridor(L)
    best = None
    mode = L.V.get("reading_spot")
    if mode in ("window", "corner") and any((s_[2] is None) == (mode == "window") for s_ in spots):
        spots = [s_ for s_ in spots if (s_[2] is None) == (mode == "window")]
    for cb, lb, corner in spots:
        c = cb.pt(0, 0)
        sc = room.daylight(c) * 8 + min([dist(c, d.front()) for _, d in room.door_zones()] or [3]) * 0.4
        if corner and room.camera_corner(*corner): sc -= 20
        if corr and (cb.overlaps(corr) or (lb and lb.overlaps(corr))): sc -= 6
        conv = L.zones.get("conversation", {}).get("centre")
        if conv: sc += 1 if 1.2 < dist(c, conv) < 3.5 else 0
        if best is None or sc > best[0]: best = (sc, cb, lb, corner)
    if not best:
        L.unplaced.append((chair["id"], "no daylit spot or corner for a reading chair")); return
    sc, cb, lb, corner = best
    L.add(chair, cb, "reading")
    if lb: L.add(lamp, lb, "reading")
    if side:
        b = side_table_for(L, cb, side, "reading")
        if b: L.add(side, b, "reading")
        else: L.unplaced.append((side["id"], "no room beside the reading chair"))
    if shelf:
        sh = shelf["size"]; opts = []
        for wall in WALLS:
            for t in range(int(room.wall_len(wall) / 0.1)):
                b = room.against(wall, 0.3 + t * 0.1, sh["w"], sh["d"], 0.04)
                dd = dist(b.pt(0, 0), cb.pt(0, 0))
                if dd < 2.2 and L.fits(b, sh["h"], "reading"): opts.append((dd + (0.5 if wall in room.open_walls else 0), b))
        if opts: L.add(shelf, min(opts, key=lambda o: o[0])[1], "reading")
        else: L.unplaced.append((shelf["id"], "no wall space near the reading chair"))
    L.zones["reading"] = dict(centre=cb.pt(0, 0.3), anchor=chair["id"], corner=corner)


def place_work(L, items, zones):
    room = L.room
    desk = next((i for i in items if i["type"] == "desk"), None)
    if not desk: return
    chair = next((i for i in items if i["type"] == "desk_chair"), None)
    ds = desk["size"]; best = None
    spots = [(w["wall"], w["position"], w) for w in room.windows if ds["h"] <= w["sill"] + 0.02]
    for wall in WALLS:
        for a, b in room.blank_runs(wall):
            for t in range(int((b - a - ds["w"]) / 0.2) + 1): spots.append((wall, a + ds["w"] / 2 + t * 0.2, None))
    conv = L.zones.get("conversation", {}).get("centre", (room.W / 2, room.D / 2))
    for wall, u, win in spots:
        db = room.against(wall, u, ds["w"], ds["d"]); pull = room.against(wall, u, ds["w"], 0.9, ds["d"])
        if not (L.fits(db, ds["h"], "work") and L.fits(pull, 0.0, "work")): continue
        c = db.pt(0, 0)
        sc = room.daylight(c) * 6 + min(dist(c, conv), 3.5) + min([dist(c, d.front()) for _, d in room.door_zones()] or [3]) * 0.5
        sc += (2 if win else 0) + (1.5 if room.faces_camera(db.rot) else -1.5)
        if best is None or sc > best[0]: best = (sc, db, pull, wall, win)
    if not best:
        L.unplaced.append((desk["id"], "no wall with room for a desk and a chair")); return
    _, db, pull, wall, win = best
    L.add(desk, db, "work", window=win["id"] if win else None)
    L.reserved.append(("work", pull))
    if chair:
        cs = chair["size"]; L.add(chair, Box(*db.pt(0, ds["d"] / 2 + 0.12), cs["w"], cs["d"], db.rot + 180), "work")
    L.zones["work"] = dict(centre=db.pt(0, 0.5), anchor=desk["id"], window=win["id"] if win else None)


def place_against_wall(L, it, zone, prefer):
    room = L.room; s = it["size"]; best = None
    spots = [(w["wall"], w["position"], w) for w in room.windows if s["h"] <= w["sill"] + 0.02]
    for wall in WALLS:
        for a, b in room.blank_runs(wall):
            for t in range(int(max(0, b - a - s["w"]) / 0.1) + 1): spots.append((wall, a + s["w"] / 2 + t * 0.1, None))
    for wall, u, win in spots:
        bx = room.against(wall, u, s["w"], s["d"])
        if not L.fits(bx, s["h"], zone): continue
        sc = prefer(bx, win) + (1.5 if room.faces_camera(bx.rot) else -2)
        if best is None or sc > best[0]: best = (sc, bx, win)
    if not best: L.unplaced.append((it["id"], "no free wall")); return None
    return L.add(it, best[1], zone, window=best[2]["id"] if best[2] else None)


def place_rest(L, items, zones):
    sofa = next(o for o in L.objs if o["type"] == "sofa")
    art = next((i for i in items if i["type"] == "art"), None)
    art_pending = art and not L.get(art["id"])
    sb = next((i for i in items if i["type"] == "sideboard"), None)
    if sb:
        def pref(b, win):
            c = b.pt(0, 0); s = 1.5 if win else 0
            to_sofa = (sofa["box"].cx - c[0], sofa["box"].cy - c[1]); n = math.hypot(*to_sofa) or 1
            s += (b.f[0] * to_sofa[0] + b.f[1] * to_sofa[1]) / n
            if "work" in L.zones: s -= 2 if dist(c, L.zones["work"]["centre"]) < 1.2 else 0
            wall = WALL_OF_ROT.get(round(b.rot) % 360)
            if art_pending and not win and wall not in L.room.open_walls: s += 3  # a blank wall that can carry the art
            return s - balance_after(L, b, sb) * 10
        o = place_against_wall(L, sb, "storage", pref)
        wall = o and WALL_OF_ROT.get(round(o["box"].rot) % 360)
        if o and art_pending and not o["meta"].get("window") and wall not in L.room.open_walls: art_over(L, art, o, wall, focal=False)
    if art and not L.get(art["id"]): L.unplaced.append((art["id"], "no blank closed wall above a low piece for the art"))
    sh = next((i for i in items if i["type"] == "shelf"), None)
    if sh and not L.get(sh["id"]): place_against_wall(L, sh, "storage", lambda b, w: -balance_after(L, b, sh) * 10)
    fl = next((i for i in items if i["type"] == "floor_lamp"), None)
    if fl and not L.get(fl["id"]): place_lamp_by_sofa(L, fl, sofa)
    place_surfaces(L, items)


def place_lamp_by_sofa(L, lamp, sofa):
    """No reading corner took the floor lamp: stand it at a free sofa end, else in the free corner nearest the sofa."""
    sb, ls = sofa["box"], lamp["size"]
    for side in (-1, 1):
        for back in (0.15, 0.3):
            b = Box(*sb.pt(side * (sb.w / 2 + 0.05 + ls["w"] / 2), -sb.d / 2 + back), ls["w"], ls["d"])
            if L.fits(b, ls["h"], "conversation"): L.add(lamp, b, "conversation"); return
    room = L.room; m = ls["w"] / 2 + 0.06
    for cx, cy in sorted(((0, 0), (room.W, 0), (0, room.D), (room.W, room.D)), key=lambda c: dist(c, sb.pt(0, 0))):
        b = Box(abs(cx - m), abs(cy - m), ls["w"], ls["d"])
        if L.fits(b, ls["h"], "conversation"): L.add(lamp, b, "conversation"); return
    L.unplaced.append((lamp["id"], "no free spot for the floor lamp"))


def place_surfaces(L, items):
    for it in [i for i in items if i["type"] == "table_lamp"]:
        if L.get(it["id"]): continue
        host = L.get(it.get("on")) if it.get("on") else None
        if host is None:
            free = sorted([o for o in L.objs if o["type"] in ("sideboard", "desk", "side_table") and not any(p["meta"].get("on") == o["id"] for p in L.objs)
                           and not any(i.get("on") == o["id"] for i in items)], key=lambda o: ("sideboard", "side_table", "desk").index(o["type"]))
            host = free[0] if free else None
        if not host: L.unplaced.append((it["id"], "no surface for the lamp")); continue
        put_on(L, it, host, host["box"].w / 2 - it["size"]["w"] / 2 - 0.06, -0.04)


def put_on(L, it, host, a, b, rot=0.0, **meta):
    hb = host["box"]; s = it["size"]
    return L.add(it, Box(*hb.pt(a, b), s["w"], s["d"], hb.rot + rot), host["zone"], mount="surface", elev=host["elev"] + host["h"], on=host["id"], **meta)


# ---------------------------------------------------------------- 2b. room features ("lift the room")
FEATURE_WHY = dict(
    platform="raised platform under the reading corner: makes the nook a room within the room",
    niche="built-in niche in a short blank stretch of wall that furniture can't use",
    built_in_shelf="built-in shelving along a long blank wall nobody sits against",
    half_wall="half wall between the work spot and the conversation area",
    feature_wall="no feature wall yet, so the focal wall gets a painted feature",
    wainscoting="wainscoting on a plain wall adds texture below eye level",
    window_seat="window seat in a free window: daylight seat and extra storage",
    ceiling_beam="tall enough ceiling for exposed beams",
)


def feature_candidates(L, needs):
    room, prof = L.room, L.prof; C = []
    reads = any(k in " ".join(needs).lower() for k in ("read", "book"))
    # platform hosting the reading corner
    if "reading" in L.zones and room.area >= 18:
        corner = L.zones["reading"]["corner"]; chair = L.get(L.zones["reading"]["anchor"])
        hosted = [o for o in L.floor() if o["zone"] == "reading" and dist(o["box"].pt(0, 0), chair["box"].pt(0, 0)) < 1.8]
        bb = bbox_box([o["box"] for o in hosted], 0.12); x0, y0, x1, y1 = bb.bbox()
        if corner:
            x0, x1 = (0, max(x1, 1.4)) if corner[0] == 0 else (min(x0, room.W - 1.4), room.W)
            y0, y1 = (0, max(y1, 1.4)) if corner[1] == 0 else (min(y0, room.D - 1.4), room.D)
        else:  # not in a corner: run the platform back to any wall within 0.6 m
            x0, y0 = (0 if x0 < 0.6 else x0), (0 if y0 < 0.6 else y0)
            x1, y1 = (room.W if room.W - x1 < 0.6 else x1), (room.D if room.D - y1 < 0.6 else y1)
        pb = Box((x0 + x1) / 2, (y0 + y1) / 2, x1 - x0, y1 - y0, 0)
        others = [o for o in L.floor() if o not in hosted]
        hosted = hosted + [o for o in others if all(pb.contains(*p) for p in o["box"].corners())]
        others = [o for o in others if o not in hosted]
        if pb.w <= 2.6 and pb.d <= 2.2 and not any(pb.overlaps(o["box"], R["feature_pad"]) for o in others) and not any(pb.overlaps(z) for _, z in room.door_zones()) \
                and slide_rug_clear(L, pb, dry=True):
            C.append(dict(type="platform", score=4 + (1 if room.area > 25 else 0), box=pb, h=0.3, zone="corner", serves="reading",
                          hosts=[o["id"] for o in hosted], mount="floor"))
    # niche / built-in shelving on closed walls
    for wall in WALLS:
        if wall in room.open_walls: continue
        for a, b in room.blank_runs(wall):
            run, u = b - a, (a + b) / 2
            front = room.against(wall, u, run, 0.45)
            tall = [o for o in L.floor() if o["box"].overlaps(front) and o["h"] > 0.85]
            if 0.45 <= run <= 1.4 and not tall:
                w = min(run - 0.15, 0.8)
                C.append(dict(type="niche", score=3, box=room.against(wall, u, w, 0.03), h=1.1, elev=0.95, zone=wall, mount="wall", wall=wall))
            if run >= 1.4:
                w = min(run - 0.2, 2.0); bx = room.against(wall, u, w, 0.35)
                if L.fits(bx, 2.0, "storage"):
                    C.append(dict(type="built_in_shelf", score=3, box=bx, h=2.0, zone=wall, serves="storage", mount="floor"))
    # half wall between work and conversation
    if "work" in L.zones and "conversation" in L.zones and room.area >= 22:
        a, b = L.zones["work"]["centre"], L.zones["conversation"]["centre"]
        if dist(a, b) < 3.6:
            m = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)
            hb = Box(*m, 1.2, 0.12, facing(b[0] - a[0], b[1] - a[1]))
            if L.fits(hb, 1.1, "between"): C.append(dict(type="half_wall", score=3 + (1 if dist(a, b) < 3 else 0), box=hb, h=1.1, zone="between", mount="floor"))
    # feature wall: only if the room has none
    fw = room.feature_wall()
    sofa = next((o for o in L.objs if o["type"] == "sofa"), None)
    if not fw and sofa:
        wall = min(WALLS, key=lambda w: dist(room.at(w, room.wall_len(w) / 2, 0), sofa["box"].pt(0, 0)))
        if wall not in room.open_walls:
            C.append(dict(type="feature_wall", score=4, box=room.against(wall, room.wall_len(wall) / 2, room.wall_len(wall), 0.01), h=room.H, elev=0, zone=wall, mount="wall", wall=wall))
    for wall in WALLS:
        if wall in room.open_walls or wall == fw: continue
        if any(b - a >= 2.0 for a, b in room.blank_runs(wall)):
            C.append(dict(type="wainscoting", score=2, box=room.against(wall, room.wall_len(wall) / 2, room.wall_len(wall), 0.02), h=0.9, elev=0, zone=wall, mount="wall", wall=wall))
    # window seat under a free window
    for w in room.windows:
        if w["sill"] < 0.45: continue
        sb = room.against(w["wall"], w["position"], w["width"] + 0.1, 0.5)
        if L.fits(sb, 0.45, w["id"], pad=0.2):
            C.append(dict(type="window_seat", score=4 + (1 if reads else 0) + room.daylight(sb.pt(0, 0)), box=sb, h=0.45, zone=w["id"], serves="window", mount="floor", window=w["id"]))
    if room.H >= 2.6:
        C.append(dict(type="ceiling_beam", score=2, box=Box(room.W / 2, room.D / 2, room.W, room.D), h=0.18, elev=room.H - 0.18, zone="ceiling", mount="ceiling",
                      beams=[r3(room.W * k / 4) for k in (1, 2, 3)]))
    corr = focal_corridor(L)
    C = [c for c in C if not (corr and c["mount"] == "floor" and c["h"] > 1.0 and c["box"].overlaps(corr))]  # never block the view to the focal
    allow = prof["features"]["allow"]; pref = prof["features"]["prefer"]
    for c in C: c["score"] += 5 if c["type"] in pref else 0
    return [c for c in C if c["type"] in allow]


def slide_rug_clear(L, pb, dry=False):
    """Slide the conversation rug along the sofa (within its overhang allowance) so it clears pb."""
    rug = next((o for o in L.objs if o["type"] == "rug" and o["zone"] == "conversation"), None)
    sofa = next((o for o in L.objs if o["type"] == "sofa"), None)
    if not rug or not rug["box"].overlaps(pb, 0.05): return True
    if not sofa: return False
    rb, sb = rug["box"], sofa["box"]
    for k in range(1, 41):
        for sgn in (1, -1):
            sh = sgn * k * 0.02; nb = Box(rb.cx + rb.r[0] * sh, rb.cy + rb.r[1] * sh, rb.w, rb.d, rb.rot)
            a0, a1 = sb.local(*nb.pt(-nb.w / 2, 0))[0], sb.local(*nb.pt(nb.w / 2, 0))[0]
            lo, hi = min(a0, a1), max(a0, a1)
            if lo <= -sb.w / 2 - R["rug_beyond"] + 1e-6 and hi >= sb.w / 2 + R["rug_beyond"] - 1e-6 and not nb.overlaps(pb, 0.05) and L.fits(nb, 0.02, rug=True):
                if not dry: rug["meta"]["slid"] = r3(sh); rug["box"] = nb
                return True
    return False


def place_features(L, needs):
    room, prof = L.room, L.prof
    cap = min(prof["features"].get("max", 2), 1 if room.area < 15 else 2)
    cands = sorted(feature_candidates(L, needs), key=lambda c: -c["score"])
    base = walk_check(L); chosen = set()
    for c in cands:
        if len(L.features) >= cap: break
        if c["type"] in chosen: continue
        it = mk(f"{c['type']}", c["type"], c["box"].w, c["box"].d, c["h"], colour="auto", material="wood" if c["type"] in ("platform", "built_in_shelf", "window_seat", "ceiling_beam") else None)
        o = L.add(it, c["box"], c["zone"], mount=c["mount"], elev=c.get("elev", 0.0), serves=c.get("serves"), wall=c.get("wall"),
                  window=c.get("window"), beams=c.get("beams"), why=FEATURE_WHY[c["type"]])
        if c["type"] == "platform":
            old_rug = next((q["box"] for q in L.objs if q["type"] == "rug" and q["zone"] == "conversation"), None)
            slide_rug_clear(L, c["box"])
            for oid in c["hosts"]:
                h = L.get(oid); h["elev"] = c["h"]; h["meta"]["on"] = o["id"]
        w = walk_check(L)
        if c["mount"] == "floor" and not walk_ok(base, w):
            L.objs.remove(o)
            if c["type"] == "platform":
                for oid in c["hosts"]: h = L.get(oid); h["elev"] = 0.0; h["meta"].pop("on", None)
                rug = next((q for q in L.objs if q["type"] == "rug" and q["zone"] == "conversation"), None)
                if rug and old_rug: rug["box"] = old_rug
            continue
        L.features.append(o["id"]); chosen.add(c["type"])
        if c["type"] == "niche": L.reserved.append(("niche", room.against(c["wall"], c["box"].pt(0, 0)[0] if c["wall"] in ("back", "front") else c["box"].pt(0, 0)[1], c["box"].w + 0.2, 0.5)))
    for p in prof["features"]["prefer"]:
        if p not in chosen: L.penalty += 15
    return [f for f in L.features]


# ---------------------------------------------------------------- 3a. walkways (grid flood fill)
def clearance_grid(L, extra=()):
    room = L.room; nx, ny = int(room.W / GRID), int(room.D / GRID); INF = 9e9
    occ = [[False] * nx for _ in range(ny)]
    for o in list(L.floor()) + list(extra):
        b = o["box"] if isinstance(o, dict) else o
        x0, y0, x1, y1 = b.bbox()
        for j in range(max(0, int(y0 / GRID)), min(ny, int(y1 / GRID) + 1)):
            for i in range(max(0, int(x0 / GRID)), min(nx, int(x1 / GRID) + 1)):
                if b.contains((i + .5) * GRID, (j + .5) * GRID): occ[j][i] = True
    d = [[0.0 if occ[j][i] else INF for i in range(nx)] for j in range(ny)]
    s2 = GRID * 1.4142
    for j in range(ny):
        for i in range(nx):
            v = d[j][i]
            if j: v = min(v, d[j - 1][i] + GRID, d[j - 1][i - 1] + s2 if i else INF, d[j - 1][i + 1] + s2 if i + 1 < nx else INF)
            if i: v = min(v, d[j][i - 1] + GRID)
            d[j][i] = v
    for j in range(ny - 1, -1, -1):
        for i in range(nx - 1, -1, -1):
            v = d[j][i]
            if j + 1 < ny: v = min(v, d[j + 1][i] + GRID, d[j + 1][i - 1] + s2 if i else INF, d[j + 1][i + 1] + s2 if i + 1 < nx else INF)
            if i + 1 < nx: v = min(v, d[j][i + 1] + GRID)
            d[j][i] = v
    obst = [row[:] for row in d]
    for j in range(ny):
        for i in range(nx):
            x, y = (i + .5) * GRID, (j + .5) * GRID
            d[j][i] = 0.0 if occ[j][i] else min(d[j][i] - GRID / 2, x, y, room.W - x, room.D - y)
    return d, nx, ny, obst


def flood(d, nx, ny, start, need):
    i0, j0 = int(start[0] / GRID), int(start[1] / GRID)
    seen = [[False] * nx for _ in range(ny)]
    if not (0 <= i0 < nx and 0 <= j0 < ny) or d[j0][i0] < need: return seen
    st = [(i0, j0)]; seen[j0][i0] = True
    while st:
        i, j = st.pop()
        for a, b in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            p, q = i + a, j + b
            if 0 <= p < nx and 0 <= q < ny and not seen[q][p] and d[q][p] >= need: seen[q][p] = True; st.append((p, q))
    return seen


def near(seen, nx, ny, pt, r):
    ci, cj, k = int(pt[0] / GRID), int(pt[1] / GRID), int(r / GRID) + 1
    for j in range(max(0, cj - k), min(ny, cj + k + 1)):
        for i in range(max(0, ci - k), min(nx, ci + k + 1)):
            if seen[j][i] and math.hypot((i + .5) * GRID - pt[0], (j + .5) * GRID - pt[1]) <= r: return True
    return False


def use_points(L):
    pts = []
    for o in L.floor():
        b, t = o["box"], o["type"]
        if o["meta"].get("on"): continue  # on a platform: reached by stepping up from its edge
        if t == "sofa":
            n = max(1, round(b.w / 0.75)); pts += [(o["id"], b.pt((k + .5 - n / 2) * b.w / n, b.d / 2 + 0.2)) for k in range(n)]
        elif t in ("armchair", "shelf", "sideboard", "cat_tree", "built_in_shelf", "window_seat"): pts.append((o["id"], b.front(0.25)))
        elif t == "desk_chair": pts.append((o["id"], b.pt(0, -(b.d / 2 + 0.25))))
    return pts


def walk_check(L):
    room = L.room; d, nx, ny, _ = clearance_grid(L)
    starts = [room.at(dr["wall"], dr["position"], 0.5) for dr in room.doors] or [(room.W / 2, room.D - 0.3)]
    wide = flood(d, nx, ny, starts[0], R["walkway"] / 2)
    narrow = flood(d, nx, ny, starts[0], R["squeeze"] / 2)
    zone_ok = {}
    for z in L.zones:
        objs = [o for o in L.floor() if o["zone"] == z or o["meta"].get("serves") == z]
        if objs: zone_ok[z] = any(near(wide, nx, ny, p, 0.6) for o in objs for p in o["box"].corners() + [o["box"].front(0.2)])
    for w in room.windows:
        off = 0.5
        while off < 1.6 and any(o["box"].contains(*room.at(w["wall"], w["position"], off)) for o in L.floor()): off += 0.05
        zone_ok[w["id"]] = near(wide, nx, ny, room.at(w["wall"], w["position"], off + 0.2), 0.6)
    use = {f"{oid}@{r3(p[0])},{r3(p[1])}": near(narrow, nx, ny, p, 0.2) for oid, p in use_points(L)}
    return dict(zones=zone_ok, use=use, grid=(d, nx, ny, wide))


def walk_ok(base, w):
    return all(w["zones"].get(k, True) or not v for k, v in base["zones"].items()) and \
        all(w["use"].get(k, True) or not v for k, v in base["use"].items()) and all(w["use"].values()) >= all(base["use"].values())


# ---------------------------------------------------------------- styling: cat tree, plants, balance
def weight(o):
    b = o["box"]; lay = TYPE_LAYER.get(o["type"], "furniture")
    if o["mount"] in ("ceiling", "surface") or lay in ("decor", "zones", "architecture") or o["type"] in ("curtain", "cushion", "throw"): return 0.0
    if o["type"] == "feature_wall" or o["type"] == "wainscoting": return 0.0
    w = b.w * b.d * (0.15 if o["type"] == "rug" else o["h"]) if o["mount"] != "wall" else b.w * o["h"] * 0.3
    return w * (1.3 if o.get("role") == "accent" else 1.0)


def balance(L):
    tot = sx = sy = 0.0
    for o in L.objs:
        w = weight(o); tot += w; sx += w * o["box"].cx; sy += w * o["box"].cy
    if not tot: return 0, 0, 0
    ox, oy = (sx / tot - L.room.W / 2) / L.room.W, (sy / tot - L.room.D / 2) / L.room.D
    return ox, oy, math.hypot(ox, oy)


def balance_after(L, b, it):
    tmp = L.add(it, b, "tmp"); v = balance(L)[2]; L.objs.remove(tmp); return v


def place_filler(L, it, zone, score_fn, base_walk, pad=0.12):
    room = L.room; s = it["size"]; cands = []
    for wall in WALLS:
        for t in range(int(room.wall_len(wall) / 0.25)):
            cands.append(room.against(wall, 0.2 + t * 0.25, s["w"], s["d"], 0.04))
    for o in L.floor():
        b = o["box"]
        if b.w > 0.9:
            for k in (1, -1): cands.append(Box(*b.pt(k * (b.w / 2 + s["w"] / 2 + 0.08), -b.d / 2 + s["d"] / 2 + 0.02), s["w"], s["d"], b.rot))
    scored = sorted(((score_fn(b), b) for b in cands if L.fits(b, s["h"], zone, pad=pad)), key=lambda c: -c[0])
    for sc, b in scored[:12]:
        o = L.add(it, b, zone)
        if walk_ok(base_walk, walk_check(L)): return o
        L.objs.remove(o)
    L.unplaced.append((it["id"], "no spot that keeps the walkways clear")); return None


def cluster_size(L, c, link=0.8):
    """How many plants a new plant at c would join (plants chained within `link` m)."""
    plants = [o["box"].pt(0, 0) for o in L.objs if o["type"] == "plant"]
    seen, stack = set(), [i for i, p in enumerate(plants) if dist(p, c) < link]
    while stack:
        i = stack.pop()
        if i in seen: continue
        seen.add(i); stack += [j for j, q in enumerate(plants) if j not in seen and dist(plants[i], q) < link]
    return len(seen)


def plant_corner(L):
    """The brightest corner with no zone in it (for the plant-corner variant)."""
    room = L.room; best = None
    for c in ((0, 0), (room.W, 0), (0, room.D), (room.W, room.D)):
        if any(dist(c, L.get(z["anchor"])["box"].pt(0, 0)) < 1.3 for z in L.zones.values()): continue
        if any(o["box"].contains(*c, 0.5) for o in L.floor()): continue
        sc = room.daylight(c) - (1 if room.camera_corner(*c) else 0)
        if best is None or sc > best[0]: best = (sc, c)
    return best and best[1]


def plant_score(L, it):
    """Plants go in groups of 2-3 (never a row), in the light, beside furniture."""
    room = L.room; corner_target = plant_corner(L) if L.V.get("feature") == "plant_corner" else None
    def f(b):
        c = b.pt(0, 0); s = room.daylight(c) * 3
        x, y = c; s += 1.0 if (min(x, room.W - x) < 0.6 and min(y, room.D - y) < 0.6) else 0
        by_piece = any(o["type"] != "plant" and b.gap(o["box"]) < 0.3 for o in L.floor())
        s += 1.5 if by_piece else 0
        n = cluster_size(L, c)
        if n: s += 3 if n < 3 else -8
        if not n and not by_piece: s -= 3
        if corner_target: s += 4 if dist(c, corner_target) < 1.1 else 0
        return s - balance_after(L, b, it) * 4
    return f


def place_styling(L, items, taste, needs):
    room = L.room; base = walk_check(L)
    ct = next((i for i in items if i["type"] == "cat_tree"), None)
    if ct:
        def cat_score(b):
            c = b.pt(0, 0); s = room.daylight(c) * 6
            s -= 3 if "work" in L.zones and dist(c, L.zones["work"]["centre"]) < 0.9 else 0
            corr = focal_corridor(L); s -= 6 if corr and b.overlaps(corr) else 0
            return s - balance_after(L, b, ct) * 8 + (0.5 if room.faces_camera(b.rot) else 0)
        place_filler(L, ct, "pets", cat_score, base)


def mirror_box(L, b):
    """Mirror a footprint across the focal centre line (for symmetric variants)."""
    f = L.focal; room = L.room
    if f["wall"] in ("back", "front"): return Box(2 * f["position"] - b.cx, b.cy, b.w, b.d, (-b.rot) % 360)
    return Box(b.cx, 2 * f["position"] - b.cy, b.w, b.d, (180 - b.rot) % 360)


def place_plants(L, items, taste, needs):
    base = walk_check(L); cat = any("cat" in n.lower() for n in needs)
    plants = [i for i in items if i["type"] == "plant"]; n = taste["plants"]; todo = plants[:n]; k = 0
    while k < len(todo):
        it = todo[k]; o = place_filler(L, it, "styling", plant_score(L, it), base); k += 1
        if o and cat: o["meta"]["cat_safe"] = True
        if o and L.V.get("symmetry") == "symmetric" and k < len(todo):  # pair it across the focal line
            mb = mirror_box(L, o["box"]); nxt = todo[k]
            mb = Box(mb.cx, mb.cy, nxt["size"]["w"], nxt["size"]["d"], mb.rot)
            if L.fits(mb, nxt["size"]["h"], "styling", pad=0.12) and dist(mb.pt(0, 0), o["box"].pt(0, 0)) > 1.0:
                p = L.add(nxt, mb, "styling", pair=o["id"])
                if walk_ok(base, walk_check(L)):
                    o["meta"]["pair"] = p["id"]; k += 1
                    if cat: p["meta"]["cat_safe"] = True
                else: L.objs.remove(p)
    if len(plants) > n: L.notes.append(f"{', '.join(i['id'] for i in plants[n:])} kept back: the {taste['styling_density']} styling wants {n} plants")


# ---------------------------------------------------------------- 2c. fill empty floor (never hand-placed)
FILLERS = dict(
    lounge_chair=dict(type="armchair", w=0.78, d=0.85, h=0.9, style="lounge", tags=["lounge"]),
    side_table=dict(type="side_table", w=0.42, d=0.42, h=0.55, style="drum"),
    reading_lamp=dict(type="floor_lamp", w=0.34, d=0.34, h=1.6, style="pole"),
    table_lamp=dict(type="table_lamp", w=0.22, d=0.22, h=0.34),
    pouf=dict(type="pouf", w=0.52, d=0.52, h=0.42),
    plant_group=[dict(type="plant", w=0.42, d=0.42, h=1.4, kind="tall"), dict(type="plant", w=0.42, d=0.42, h=0.7, kind="bush"), dict(type="plant", w=0.32, d=0.32, h=0.55, kind="cactus")],
)


def empty_regions(L, k=6):
    """Largest empty floor rectangles: away from furniture (0.3 m), door zones and reserved zones."""
    room = L.room; d, nx, ny, obst = clearance_grid(L)
    blocked = [[obst[j][i] < 0.3 for i in range(nx)] for j in range(ny)]
    for z in [z for _, z in room.door_zones()] + [z for _, z in L.reserved]:
        x0, y0, x1, y1 = z.bbox()
        for j in range(max(0, int(y0 / GRID)), min(ny, int(y1 / GRID) + 1)):
            for i in range(max(0, int(x0 / GRID)), min(nx, int(x1 / GRID) + 1)):
                if z.contains((i + .5) * GRID, (j + .5) * GRID): blocked[j][i] = True
    out = []
    for _ in range(k):
        h = [0] * nx; best = (0, None)
        for j in range(ny):
            for i in range(nx): h[i] = h[i] + 1 if not blocked[j][i] else 0
            st = []
            for i in range(nx + 1):
                cur = h[i] if i < nx else 0; start = i
                while st and st[-1][1] >= cur:
                    s0, hh = st.pop()
                    if hh * (i - s0) > best[0]: best = (hh * (i - s0), (s0, j - hh + 1, i, j + 1))
                    start = s0
                st.append((start, cur))
        if not best[1]: break
        i0, j0, i1, j1 = best[1]
        for j in range(j0, j1):
            for i in range(i0, i1): blocked[j][i] = True
        x0, y0, x1, y1 = i0 * GRID, j0 * GRID, i1 * GRID, j1 * GRID
        if min(x1 - x0, y1 - y0) >= R["empty_min"][0] and (x1 - x0) * (y1 - y0) >= R["empty_min"][1]:
            walls = [w for w, ok in (("left", x0 < 0.06), ("right", x1 > room.W - 0.06), ("back", y0 < 0.06), ("front", y1 > room.D - 0.06)) if ok]
            out.append(dict(x0=r3(x0), y0=r3(y0), x1=r3(x1), y1=r3(y1), area=r3((x1 - x0) * (y1 - y0)), walls=walls))
    return out


def try_fill(L, kind, reg, n, base):
    """Fill pieces must join something: a pouf sits on a corner of the conversation rug, a plant
    group stands beside furniture or in the light, a lounge spot only goes in a daylit corner."""
    room = L.room; added = []
    def add(spec, box, zone, **meta):
        it = mk(f"fill_{spec['type']}_{n}_{len(added) + 1}", spec["type"], spec["w"], spec["d"], spec["h"], style=spec.get("style"), kind=spec.get("kind"),
                tags=spec.get("tags", []), suggested=True, name=f"suggested {spec.get('style') or spec.get('kind') or ''} {spec['type'].replace('_', ' ')}".replace("  ", " "))
        o = L.add(it, box, zone, suggested=True, **meta); added.append(o); return o
    def undo():
        for o in added:
            if o in L.objs: L.objs.remove(o)
        added.clear(); return []
    conv = L.zones.get("conversation", {}).get("centre")
    inreg = lambda p: reg["x0"] - 0.3 <= p[0] <= reg["x1"] + 0.3 and reg["y0"] - 0.3 <= p[1] <= reg["y1"] + 0.3
    if kind == "lounge_spot":
        cx = 0 if "left" in reg["walls"] else room.W if "right" in reg["walls"] else None
        cy = 0 if "back" in reg["walls"] else room.D if "front" in reg["walls"] else None
        if cx is None or cy is None or room.daylight((cx, cy)) < 0.25: return []
        cam = room.camera_corner(cx, cy)
        lamp = None if cam or "reading_lamp" not in L.prof["fillers"] else mk("tmp_lamp", "floor_lamp", 0.34, 0.34, 1.6)
        ch = mk("tmp", "armchair", **{k: FILLERS["lounge_chair"][k] for k in ("w", "d", "h")})
        r_ = corner_seat(L, ch, lamp, cx, cy, "lounge", face_to=conv)
        if not r_: return []
        cb, lb = r_; chair = add(FILLERS["lounge_chair"], cb, "lounge")
        if lb: add(FILLERS["reading_lamp"], lb, "lounge")
        if "side_table" in L.prof["fillers"]:
            st = FILLERS["side_table"]; sb = side_table_for(L, cb, dict(size=st), "lounge")
            if sb:
                t = add(st, sb, "lounge")
                if not lb:
                    tl = FILLERS["table_lamp"]; it = mk(f"fill_table_lamp_{n}", "table_lamp", tl["w"], tl["d"], tl["h"], suggested=True, name="suggested table lamp")
                    added.append(put_on(L, it, t, 0, 0, suggested=True))
        L.zones.setdefault("lounge", dict(centre=cb.pt(0, 0.3), anchor=chair["id"]))
    elif kind == "plant_group":
        if not reg["walls"]: return []
        wall = reg["walls"][0]; g = FILLERS["plant_group"]
        lo, hi = (reg["x0"], reg["x1"]) if wall in ("back", "front") else (reg["y0"], reg["y1"])
        for u in sorted([lo + 0.45, (lo + hi) / 2, hi - 0.45], key=lambda u: -room.daylight(room.at(wall, u, 0.3))):
            for spec, du, off in ((g[0], 0.0, 0.04), (g[1], 0.42, 0.18), (g[2], -0.36, 0.22)):
                b = room.against(wall, u + du, spec["w"], spec["d"], off)
                if not L.fits(b, spec["h"], "styling", pad=0.12): undo(); break
                o = add(spec, b, "styling", group=f"plant_group_{n}")
                if any("cat" in x.lower() for x in L.needs): o["meta"]["cat_safe"] = True
            if added:
                anchored = any(o2["type"] not in ("plant",) and a["box"].gap(o2["box"]) < 0.4 for a in added for o2 in L.floor() if o2 not in added) \
                    or max(room.daylight(a["box"].pt(0, 0)) for a in added) > 0.4
                if anchored: break
                undo()
    elif kind == "pouf":
        rug = next((o for o in L.objs if o["type"] == "rug" and o["zone"] == "conversation"), None)
        if not rug: return []
        p = FILLERS["pouf"]; rb = rug["box"]; corr = focal_corridor(L)
        for a, b in sorted(((sa * (rb.w / 2 - 0.3), sb_ * (rb.d / 2 - 0.3)) for sa in (-1, 1) for sb_ in (-1, 1)),
                           key=lambda ab: dist(rb.pt(*ab), ((reg["x0"] + reg["x1"]) / 2, (reg["y0"] + reg["y1"]) / 2))):
            c = rb.pt(a, b)
            if not inreg(c): continue
            bx = Box(*c, p["w"], p["d"], facing(rb.cx - c[0], rb.cy - c[1]))
            if corr and bx.overlaps(corr): continue
            if L.fits(bx, p["h"], "conversation", pad=0.3, ignore=()):
                add(p, bx, "conversation", extra_seat=True); break
    if added and not walk_ok(base, walk_check(L)): return undo()
    return added


def fill_empty(L, phase):
    """Fill empty floor with the right kind of piece until the room balances."""
    room = L.room; n0 = len(L.fill_log)
    for k in range(R["fill_rounds"]):
        ox, oy, off = balance(L)
        if off <= R["balance"][0]: break
        regs = empty_regions(L)
        if not regs:
            L.fill_log.append(dict(phase=phase, result="stopped", why="no empty floor region of 0.9 m x 1.0 m2 or more is left")); break
        light = (-ox, -oy); n_ = math.hypot(*light) or 1
        def light_side(r):
            c = ((r["x0"] + r["x1"]) / 2 - room.W / 2, (r["y0"] + r["y1"]) / 2 - room.D / 2); m = math.hypot(*c) or 1
            return r["area"] * (1 + 2 * max(0, (c[0] * light[0] + c[1] * light[1]) / m / n_))
        base = walk_check(L); placed = None; why = []
        wide = base["grid"][3]
        for reg in sorted(regs, key=lambda r: -light_side(r)):
            kinds = []; skip = []
            corner = len(reg["walls"]) >= 2 and min(reg["x1"] - reg["x0"], reg["y1"] - reg["y0"]) >= 1.3
            if corner and "lounge_chair" in L.prof["fillers"] and "lounge" not in L.zones: kinds.append("lounge_spot")
            elif not corner: skip.append("no free corner for a lounge spot")
            if reg["walls"] and "plant_group" in L.prof["fillers"]: kinds.append("plant_group")
            elif not reg["walls"]: skip.append("a plant group needs a wall behind it")
            if "pouf" in L.prof["fillers"] and sum(o["type"] == "pouf" for o in L.objs) < 2: kinds.append("pouf")
            else: skip.append("the conversation group already has its 2 poufs")
            for kind in kinds:
                got = try_fill(L, kind, reg, len(L.fill_log) + 1, base)
                if got: placed = (kind, reg, got); break
                skip.append(f"a {kind.replace('_', ' ')} there would break a walkway or clearance rule")
            if placed: break
            cells = [(i, j) for j in range(int(reg["y0"] / GRID), int(reg["y1"] / GRID)) for i in range(int(reg["x0"] / GRID), int(reg["x1"] / GRID))]
            walk = sum(wide[j][i] for i, j in cells if j < len(wide) and i < len(wide[0])) / max(1, len(cells))
            why.append(f"{reg['x1'] - reg['x0']:.1f} x {reg['y1'] - reg['y0']:.1f} m at x {reg['x0']:.1f}-{reg['x1']:.1f}, y {reg['y0']:.1f}-{reg['y1']:.1f}"
                       f" ({walk * 100:.0f}% of it is the 90 cm walkway): " + "; ".join(dict.fromkeys(skip)))
        if not placed:
            L.fill_log.append(dict(phase=phase, result="stopped", balance=r3(off), why="nothing else fits the empty floor: " + " | ".join(why))); break
        kind, reg, got = placed
        L.fill_log.append(dict(phase=phase, result="filled", kind=kind, region=reg, added=[o["id"] for o in got],
                               balance_before=r3(off), balance_after=r3(balance(L)[2])))
    return L.fill_log[n0:]


# ---------------------------------------------------------------- soft furnishings + props (derived from the placed pieces)
def add_soft_and_props(L, taste):
    room, prof = L.room, L.prof; dens = DENSITY[taste["styling_density"]]; acc = prof["palette"]["accent"]
    for w in room.windows:
        for side in ("left", "right"):
            u = w["position"] + (-1 if side == "left" else 1) * (w["width"] / 2 - 0.15)
            it = mk(f"curtain_{w['id']}_{side}", "curtain", 0.54, 0.05, w["head"] - 0.05, colour=prof["materials"]["curtain"])
            L.add(it, room.against(w["wall"], u, 0.54, 0.05, 0.08), w["id"], mount="wall", elev=0.06, window=w["id"], side=side)
    sofa = next((o for o in L.objs if o["type"] == "sofa"), None)
    if sofa:
        b, w = sofa["box"], sofa["box"].w; mw = w / max(1, round(w / 0.72))
        if dens["throw"]:
            L.add(mk("throw", "throw", 0.6, 0.62, 0.03, colour=acc[2 % len(acc)]), Box(*b.pt(-w / 2 + mw / 2, 0.12), 0.6, 0.62, b.rot), "conversation", mount="surface", elev=0.43, on=sofa["id"])
        for k, (px, tilt) in enumerate([(0.29, -11.5), (0.07, 8.6), (-0.05, -5.7)][:dens["pillows"]]):
            col = [acc[0], prof["palette"]["dominant"][0], acc[2 % len(acc)]][k]
            L.add(mk(f"cushion_{k + 1}", "cushion", 0.42, 0.14, 0.38, colour=col), Box(*b.pt(px * w, -0.12), 0.42, 0.14, b.rot + tilt), "conversation", mount="surface", elev=0.47, on=sofa["id"])
    def prop(host_type, pid, typ, a, b_, w, d, h, colour, rot=0.0, upto=1):
        host = next((o for o in L.objs if o["type"] == host_type), None)
        if not host or upto > dens["props"]: return
        sx, sy = (host["box"].w / 0.92, host["box"].d / 0.92) if host_type == "coffee_table" else (1, 1)
        put_on(L, mk(pid, typ, w, d, h, colour=colour), host, a * sx, b_ * sy, rot)
    lamp_on = {o["meta"].get("on") for o in L.objs if o["type"] == "table_lamp"}
    sbd = next((o for o in L.objs if o["type"] == "sideboard"), None)
    prop("coffee_table", "coffee_book", "book", -0.12, 0.06, 0.24, 0.18, 0.05, acc[1 % len(acc)], 17)
    prop("coffee_table", "coffee_vase", "cup", 0.15, -0.08, 0.12, 0.12, 0.16, prof["palette"]["dominant"][0], upto=2)
    prop("sideboard", "sideboard_vase", "vase", -0.45, 0.0, 0.18, 0.18, 0.4, acc[1 % len(acc)])
    prop("sideboard", "sideboard_books", "books", 0.0 if sbd and sbd["id"] in lamp_on else 0.35, 0.0, 0.3, 0.22, 0.19, acc[0], upto=2)
    prop("desk", "computer", "computer", -0.15, -0.08, 0.4, 0.3, 0.3, "#EFE6D6")
    prop("desk", "desk_paper", "paper", -0.1, 0.18, 0.36, 0.12, 0.02, "#F3E6D3", upto=2)
    prop("desk", "desk_mug", "mug", 0.2, 0.1, 0.1, 0.1, 0.11, acc[0], upto=2)
    seat = next((o for o in L.objs if o["type"] == "window_seat"), None)
    if seat:
        for k in range(min(2, dens["pillows"])):
            put_on(L, mk(f"seat_cushion_{k + 1}", "cushion", 0.4, 0.14, 0.36, colour=acc[k % len(acc)]), seat, (-0.5 + k) * seat["box"].w / 3, -0.1, -10 + 20 * k)
    plat = next((o for o in L.objs if o["type"] == "platform"), None)
    if plat and dens["props"] >= 2:
        chair = L.get(L.zones["reading"]["anchor"]); c = chair["box"].pt(0, 0.15)
        it = mk("platform_rug", "rug", 1.1, 1.1, 0.015, colour="auto", shape="round")
        L.add(it, Box(*c, 1.1, 1.1), "reading", mount="surface", elev=plat["h"], on=plat["id"], shape="round")


# ---------------------------------------------------------------- 2g. colour 60/30/10
ACCENT_ORDER = ["art", "floor_lamp", "table_lamp", "pouf", "side_table", "shelf", "coffee_table", "armchair", "rug", "cat_tree", "desk_chair", "desk"]
# The 10 % accent is for small pops only; big pieces take the board's main (secondary) colours.
SMALL_ACCENT = ("art", "floor_lamp", "table_lamp", "ceiling_light", "pouf", "side_table", "desk_chair")
HERO_TYPES = ("sofa", "armchair")


def hex_lab(h):
    """#RRGGBB -> CIELAB (L, a, b), to judge how colourful and how different two colours look."""
    def lin(c):
        c /= 255; return c / 12.92 if c <= 0.04045 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = (lin(int(h.lstrip("#")[i:i + 2], 16)) for i in (0, 2, 4))
    x, y, z = (r * .4124 + g * .3576 + b * .1805) / .95047, r * .2126 + g * .7152 + b * .0722, (r * .0193 + g * .1192 + b * .9505) / 1.08883
    f = lambda t: t ** (1 / 3) if t > 0.008856 else 7.787 * t + 16 / 116
    return 116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))


def colourful(h, min_chroma=15): L, a, b = hex_lab(h); return math.hypot(a, b) >= min_chroma and 20 <= L <= 85
def delta_e(h1, h2): return math.dist(hex_lab(h1), hex_lab(h2))
def too_dark(h): return hex_lab(h)[0] < 22


def signature_colour(pal, avoid=()):
    """The colour the hero seat wears: the most-seen colourful main colour (secondaries first, ordered by coverage,
    then the second dominant), skipping colours too close to the walls. None if the board has none."""
    for c in pal["secondary"] + pal["dominant"][1:]:
        if colourful(c) and all(delta_e(c, w) > 18 for w in avoid if w): return c
    return None
NO_COLOUR = ("curtain", "cushion", "throw", "book", "books", "vase", "computer", "paper", "mug", "cup", "zone")


def visible_area(o):
    b, t = o["box"], o["type"]
    if t in NO_COLOUR or t == "plant": return 0.0
    if t == "rug": return b.w * b.d * 0.7
    if t in ("ceiling_beam",): return 0.0
    if o["mount"] == "wall": return b.w * o["h"]
    if o["mount"] == "ceiling": return 0.1
    return b.w * b.d + b.w * o["h"] * 0.6


def assign_colours(L, statement=None):
    pal, room, mats = L.prof["palette"], L.room, L.prof["materials"]
    roles = {h.upper(): r for r in ("dominant", "secondary", "accent") for h in pal[r]}
    shell = [("floor", "dominant", room.W * room.D)]
    for wall in WALLS:
        if wall in room.open_walls: continue
        a = room.wall_len(wall) * room.H - sum(o["width"] * ((o.get("head", 2.1) - o.get("sill", 0)) if o in room.windows else 2.1) for o in room.openings(wall))
        fin = room.spec.get("walls", {}).get(wall, {})
        shell.append((f"{wall} wall ({fin.get('finish', 'paint')})", "secondary" if fin.get("feature") else "dominant", a))
    tot = {"dominant": 0.0, "secondary": 0.0, "accent": 0.0}
    for _, r, a in shell: tot[r] += a
    auto = []
    for o in L.objs:
        if o["type"] in NO_COLOUR:
            o["role"], o["colour"] = "styling", o["item"].get("colour") if o["item"].get("colour") != "auto" else None; continue
        mat_ = o["item"].get("material")
        c = mats.get(mat_) if mat_ else o["item"].get("colour", "auto")
        if c in pal: c = pal[c][0]  # "secondary" = that role's first colour
        if c and c != "auto":
            o["colour"] = c; o["role"] = roles.get(c.upper(), "off-palette")
            if o["role"] in tot: tot[o["role"]] += visible_area(o)
            elif (n := f"{o['id']} colour {c} is not in the moodboard palette") not in L.notes: L.notes.append(n)
        else: auto.append(o)
    allarea = sum(tot.values()) + sum(visible_area(o) for o in auto)
    walls = [f.get("colour") for f in room.spec.get("walls", {}).values() if f.get("colour")]
    # hero = the piece that carries the board's signature colour: the statement if it's a seat, else the sofa
    hero = statement if (L.get(statement) or {}).get("type") in HERO_TYPES else next((o["id"] for o in auto if o["type"] == "sofa"), None)
    sig = signature_colour(pal, walls)
    auto.sort(key=lambda o: (o["id"] != hero, ACCENT_ORDER.index(o["type"]) if o["type"] in ACCENT_ORDER else 99))
    for o in auto:
        a = visible_area(o)
        if o["type"] == "plant": o["role"], o["colour"] = "natural", "#3E7F3A"; continue
        if o["id"] == hero and sig:
            o["role"], o["colour"] = "secondary", sig; tot["secondary"] += a; continue
        if o["type"] == "feature_wall": r = "accent" if len(pal["accent"]) else "secondary"
        elif o["type"] in SMALL_ACCENT and (tot["accent"] + a) / allarea <= R["split"]["accent"] + R["split_tol"] / 3: r = "accent"
        else: r = "secondary"
        tot[r] += a; o["role"] = r
        nb = [q.get("colour") for q in L.objs if q is not o and q.get("colour") and o["box"].gap(q["box"]) < 0.6]
        used = [q.get("colour") for q in L.objs if q.get("colour")]
        near_wall = lambda c: any(delta_e(c, w) < 18 for w in walls)
        # big pieces never go near-black (they'd read as holes in the room) unless nothing else is left
        options = [c for c in pal[r] if not too_dark(c)] if o["type"] not in SMALL_ACCENT else pal[r]
        o["colour"] = min(options or pal[r], key=lambda c: (c in nb) * 10 + near_wall(c) * 3 + (c == sig) * 2 + used.count(c) + pal[r].index(c) * 0.01)
    s = sum(tot.values())
    return {k: round(v / s, 3) for k, v in tot.items()}, shell


# ---------------------------------------------------------------- 3. checks
def run_checks(L, split, walk):
    room = L.room; C = []
    def add(rule, ok, detail, warn=False): C.append(dict(rule=rule, status="pass" if ok else ("warn" if warn else "fail"), detail=detail))
    g = lambda t: [o for o in L.objs if o["type"] == t and o["mount"] != "surface"]
    sofa = (g("sofa") or [None])[0]; table = (g("coffee_table") or [None])[0]
    fl = L.floor()
    def hosted(a, b): return a["meta"].get("on") == b["id"] or b["meta"].get("on") == a["id"]
    bad = [(a["id"], b["id"]) for k, a in enumerate(fl) for b in fl[k + 1:] if a["box"].overlaps(b["box"], -0.01)
           and {a["type"], b["type"]} != {"desk", "desk_chair"} and not hosted(a, b)]
    add("no furniture overlaps", not bad, "none" if not bad else ", ".join(f"{a}/{b}" for a, b in bad))
    for z, ok in walk["zones"].items():
        add(f"{R['walkway'] * 100:.0f} cm walkway door -> {z}", ok, "clear route" if ok else "no 90 cm route; the narrowest gap is in the way")
    blocked = [k.split("@")[0] for k, v in walk["use"].items() if not v]
    add(f"every seat/shelf front reachable ({R['squeeze'] * 100:.0f} cm+)", not blocked, "all reachable" if not blocked else "blocked: " + ", ".join(sorted(set(blocked))))
    for d, z in room.door_zones():
        hit = [o["id"] for o in fl if o["box"].overlaps(z)]
        add(f"{d['id']} kept clear ({R['door_depth'] * 100:.0f} cm in front)", not hit, "clear" if not hit else "blocked by " + ", ".join(hit))
    for w, z in room.window_zones():
        hit = [o["id"] for o in fl if o["box"].overlaps(z) and o["h"] + o["elev"] > w["sill"] - 0.02]
        low = [o["id"] for o in fl if o["box"].overlaps(z) and o["h"] + o["elev"] <= w["sill"] - 0.02]
        add(f"{w['id']} kept clear of tall pieces", not hit, ("clear" if not hit else "blocked by " + ", ".join(hit)) + (f"; below the sill: {', '.join(low)}" if low else ""))
    if sofa and table:
        gap = sofa["box"].gap(table["box"]); lo, hi = R["coffee_gap"]
        add(f"coffee table {lo * 100:.0f}-{hi * 100:.0f} cm from sofa", lo - 0.005 <= gap <= hi + 0.005, f"{gap * 100:.0f} cm")
        ratio = table["box"].w / sofa["box"].w
        add("coffee table ~2/3 of sofa length", abs(ratio - R["coffee_ratio"]) <= R["coffee_ratio"] * R["coffee_tol"],
            f"{table['box'].w:.2f} m vs sofa {sofa['box'].w:.2f} m = {ratio * 100:.0f}% (target 67% +-10 pts)", warn=True)
    rug = next((o for o in L.objs if o["type"] == "rug" and o["zone"] == "conversation"), None)
    if rug:
        seats = [o for o in fl if o["zone"] == "conversation" and o["type"] in ("sofa", "armchair")]
        miss = []
        for o in seats:
            b = o["box"]
            for a in (-1, 1):
                p = b.pt(a * (b.w / 2 - 0.05), b.d / 2 - 0.08)
                if not (rug["box"].contains(*p) if rug["meta"].get("shape") != "round" else dist(p, (rug["box"].cx, rug["box"].cy)) <= rug["box"].w / 2): miss.append(o["id"])
        add("rug under the front legs of every seat", not miss, f"{rug['box'].w:.1f} x {rug['box'].d:.1f} m {rug['meta'].get('shape', 'rect')}" + ("" if not miss else "; off the rug: " + ", ".join(sorted(set(miss)))))
        if sofa:
            over = (rug["box"].w - sofa["box"].w) / 2
            add("rug wider than the sofa (~15 cm each side)", over >= R["rug_beyond"] - 0.01, f"{over * 100:.0f} cm past each end", warn=True)
    seats = [o for o in fl if o["zone"] == "conversation" and o["type"] in ("sofa", "armchair")]
    if len(seats) > 1:
        far = max(dist(a["box"].pt(0, 0), b["box"].pt(0, 0)) for a in seats for b in seats)
        add(f"conversation seats within {R['conversation_max']:.1f} m", far <= R["conversation_max"], f"furthest pair {far:.2f} m centre to centre")
    surf = [o for o in fl if o["type"] in ("coffee_table", "side_table", "desk", "sideboard")]
    lonely = [o["id"] for o in fl if o["type"] in ("sofa", "armchair") and not any(o["box"].gap(s["box"]) <= R["reach"] for s in surf)]
    add("a table within reach of every seat", not lonely, "all seats" if not lonely else "missing for " + ", ".join(lonely), warn=True)
    for a in [o for o in L.objs if o["type"] == "art"]:
        below = L.get(a["meta"].get("above"))
        add("art centred ~145 cm", abs(a["elev"] - R["art_centre"]) <= 0.08, f"centre at {a['elev'] * 100:.0f} cm", warn=True)
        if below:
            ratio = a["box"].w / below["box"].w; gap = a["elev"] - a["h"] / 2 - below["h"]
            add("art ~2/3 the width of the furniture below", abs(ratio - R["art_ratio"]) <= 0.08, f"{a['box'].w:.2f} m over {below['box'].w:.2f} m = {ratio * 100:.0f}%")
            add(f"art {R['art_gap'][0] * 100:.0f}-{R['art_gap'][1] * 100:.0f} cm above the furniture", R["art_gap"][0] - 0.01 <= gap <= R["art_gap"][1] + 0.01, f"{gap * 100:.0f} cm gap", warn=True)
    layers = {"ceiling": g("ceiling_light"), "floor": g("floor_lamp"), "table": [o for o in L.objs if o["type"] == "table_lamp"]}
    add("layered lighting: ceiling + floor + table", all(layers.values()), ", ".join(f"{k}: {len(v)}" for k, v in layers.items()))
    lamps = [o for o in L.objs if o["type"] in ("floor_lamp", "table_lamp", "ceiling_light")]
    for z in ("reading", "work", "lounge"):
        if z in L.zones:
            c = L.get(L.zones[z]["anchor"])["box"].pt(0, 0); dmin = min([dist(c, l["box"].pt(0, 0)) for l in lamps] or [9])
            add(f"task light for the {z} zone", dmin <= R["task_light"], f"nearest lamp {dmin:.2f} m away")
    if "work" in L.zones:
        add("work spot by a window", bool(L.zones["work"].get("window")), f"desk at {L.zones['work'].get('window') or 'a wall without a window'}", warn=True)
    feats = [L.get(f) for f in L.features]
    add("room features: 1-2, rule-picked", 1 <= len(feats) <= 2, ", ".join(f"{f['type']} ({f['zone']})" for f in feats) or "none fitted", warn=True)
    composition_checks(L, add)
    ox, oy, off = balance(L)
    hint = ""
    if off > R["balance"][0]:
        side = ("left" if ox > 0 else "right") if abs(ox) >= abs(oy) else ("back" if oy > 0 else "front")
        stop = next((f["why"] for f in reversed(L.fill_log) if f["result"] == "stopped"), None)
        short = stop and ("the rest of the empty floor is mostly the 90 cm walkway, so filling it would break a walkway rule (see the fill log)" if "walkway" in stop else stop)
        hint = f"; the {side} side is light" + (f"; fill stopped: {short}" if stop else "")
    fills = [f for f in L.fill_log if f["result"] == "filled"]
    detail = f"weight centre {ox * 100:+.0f}% x, {oy * 100:+.0f}% y off the room centre" + (f" after {len(fills)} fill(s)" if fills else "") + hint
    add("visual balance", off <= R["balance"][0], detail, warn=off <= R["balance"][1])
    t, tol = R["split"], R["split_tol"]
    add("60/30/10 colour split", all(abs(split[k] - t[k]) <= tol for k in t), " / ".join(f"{k} {split[k] * 100:.0f}%" for k in t) + " (target 60/30/10, +-8 pts)", warn=True)
    for oid, why in L.unplaced: add(f"placed {oid}", False, why, warn=True)
    return C


# ---------------------------------------------------------------- solve
OPP = {"back": "front", "front": "back", "left": "right", "right": "left"}


def conv_candidates(room, focal, sofa, V=None):
    """Where the conversation group may go, for the variant's orientation and mount:
    faces = sofa opposite the focal wall, looking at it; frames = sofa on a side wall so the group
    looks across the room with the focal at its side; under_art = sofa under the art wall."""
    V = V or {}; ss = sofa["size"]; out = []
    orient = V.get("orient") or ("under_art" if focal["kind"] == "gallery" else "faces")
    if orient == "under_art" and focal["kind"] != "gallery": orient = "faces"
    gaps = {"wall": (0.0,), "float": (0.9, 1.1)}.get(V.get("mount"), (0.0, 0.9, 1.1))
    arr = V.get("arr") or ("U" if orient == "faces" else "facing")
    if orient == "faces" and arr == "facing": arr = "U"  # chairs opposite would turn their backs on the focal
    if orient == "under_art": walls, gaps = [focal["wall"]], (0.0,)
    elif orient == "faces": walls = [OPP[focal["wall"]]]
    else: walls = [w for w in WALLS if w not in (focal["wall"], OPP[focal["wall"]])]
    for wall in walls:
        L0 = room.wall_len(wall)
        for k in range(int((L0 - ss["w"]) / 0.15) + 1):
            for gap in gaps:
                out.append(dict(wall=wall, u=ss["w"] / 2 + k * 0.15, back_gap=gap, faces=orient == "faces", orient=orient, arr=arr))
    return out


WALL_OF_ROT = {0: "back", 90: "left", 270: "right", 180: "front"}


def art_over(L, art, host, wall, focal=False):
    """Art centred on the piece below: 2/3 of its width, centre ~145 cm, 15-30 cm above it."""
    room = L.room; hb = host["box"]
    aw = hb.w * R["art_ratio"]; ah = aw * art["size"]["h"] / art["size"]["w"]
    if L.prof["art"].get("arrangement", "gallery") != "single" and R["art_centre"] - ah / 2 - host["h"] > R["art_gap"][1]:
        ah = min(2 * (R["art_centre"] - host["h"] - 0.22), aw * 1.3)  # a low piece: the cluster grows taller instead of floating
    cz = max(R["art_centre"], host["h"] + R["art_gap"][0] + ah / 2)
    u = hb.cx if wall in ("back", "front") else hb.cy
    o = L.add(art, Box(*room.at(wall, u, 0.02), aw, 0.03, room.ROT[wall]), host["zone"], mount="wall", elev=cz,
              wall=wall, above=host["id"], focal=focal, content=L.prof["art"])
    o["h"] = ah; return o


def focal_corridor(L):
    """The strip between the sofa and the focal wall that should stay visually open."""
    so = next((o for o in L.objs if o["type"] == "sofa"), None); f = getattr(L, "focal", None)
    if not so or not f or not L.zones.get("conversation", {}).get("faces_focal"): return None
    sb = so["box"]; room = L.room; fp = room.at(f["wall"], f["position"], 0)
    a, b = sb.local(*fp); length = max(0.1, b - sb.d / 2)
    return Box(*sb.pt(0, sb.d / 2 + length / 2), sb.w, length, sb.rot)


def composition_checks(L, add):
    """Does the layout make sense, not just clear the walkways? (soft: warnings, scored by variants.py)"""
    room = L.room; f = L.focal; fl = L.floor(); cz = L.zones.get("conversation", {})
    so = next((o for o in fl if o["type"] == "sofa"), None)
    if so and f:
        orient = cz.get("orient", "faces")
        fp = room.at(f["wall"], f["position"], 0); a, b = so["box"].local(*fp); ang = abs(math.degrees(math.atan2(a, b)))
        if orient == "under_art": add("seating faces the focal point", True, "the focal art hangs over the sofa; the other seats face it")
        elif orient == "frames": add("seating faces the focal point", 55 <= ang <= 125, f"the group frames the {f['kind']} side-on ({ang:.0f}° from the sofa's line of sight)", warn=True)
        else:
            add("seating faces the focal point", ang <= 45, f"sofa turned {ang:.0f}° from the {f['kind']} on the {f['wall']} wall", warn=True)
            corr = focal_corridor(L); grp = {o["id"] for o in fl if o["zone"] == "conversation"}
            block = [o["id"] for o in fl if corr and o["id"] not in grp and o["h"] + o["elev"] > 1.0 and o["box"].overlaps(corr)]
            add("view to the focal point kept open", not block, "open" if not block else "tall pieces in the way: " + ", ".join(block), warn=True)
    rug = next((o for o in L.objs if o["type"] == "rug" and o["zone"] == "conversation"), None)
    if rug and room.area >= 20:
        c = (rug["box"].cx, rug["box"].cy); dmin = min(c[0], room.W - c[0], c[1], room.D - c[1])
        add("conversation group anchored on the rug, off the walls", dmin >= 1.2, f"rug centre {dmin:.1f} m from the nearest wall", warn=True)
    orphans = []
    for o in fl:
        if o["meta"].get("on") or o["type"] in ("platform", "half_wall"): continue
        others = [q for q in fl if q is not o and q["type"] not in ("half_wall",)]
        near_piece = min([o["box"].gap(q["box"]) for q in others] or [9])
        wall_gap = min(min(x, room.W - x, y, room.D - y) for x, y in o["box"].corners())
        if o["type"] == "plant" and near_piece > 0.5: orphans.append(o["id"])
        elif o["type"] != "plant" and near_piece > 0.6 and wall_gap > 0.15: orphans.append(o["id"])
    rows = [o["id"] for o in fl if o["type"] == "plant" and cluster_size(L, o["box"].pt(0, 0)) > 3]
    add("pieces grouped (no orphans, no plant rows)", not orphans and not rows,
        "every piece belongs to a group" if not (orphans or rows) else "; ".join(x for x in (("standing alone: " + ", ".join(orphans)) if orphans else "", ("plants in a row: " + ", ".join(rows)) if rows else "") if x), warn=True)
    seat = next((o for o in L.objs if o["type"] == "window_seat"), None)
    if "reading" in L.zones or seat:
        spots = ([L.get(L.zones["reading"]["anchor"])["box"].pt(0, 0)] if "reading" in L.zones else []) + ([seat["box"].pt(0, 0)] if seat else [])
        c = max(spots, key=room.daylight); dl = room.daylight(c)
        dw = min([dist(c, room.window_centre(w)) for w in room.windows] or [9])
        what = "the window seat" if seat and c == seat["box"].pt(0, 0) else "the reading chair"
        add("reading spot gets daylight", dl >= 0.3, f"{what} is {dw:.1f} m from the nearest window (daylight score {dl:.2f})", warn=True)
    elif any(k in " ".join(L.needs).lower() for k in ("read", "book")):
        add("reading spot gets daylight", False, "the brief mentions reading but there is no reading chair or window seat", warn=True)


def complete_group(L):
    """A U with one chair: a suggested pouf closes the empty table end (facing the table)."""
    if not L.zones.get("conversation", {}).get("faces_focal") or "pouf" not in L.prof["fillers"]: return
    so = next(o for o in L.objs if o["type"] == "sofa"); tb = next((o for o in L.objs if o["type"] == "coffee_table"), None)
    if not tb: return
    chairs = [o for o in L.objs if o["type"] == "armchair" and o["zone"] == "conversation"]
    p = FILLERS["pouf"]; base = walk_check(L)
    for side in (1, -1):
        c = tb["box"].pt(side * (tb["box"].w / 2 + 0.35 + p["w"] / 2), 0)
        if any(dist(c, ch["box"].pt(0, 0)) < 0.8 for ch in chairs): continue
        bx = Box(*c, p["w"], p["d"], facing(tb["box"].cx - c[0], tb["box"].cy - c[1]))
        if L.fits(bx, p["h"], "conversation"):
            o = L.add(mk("fill_pouf_end", "pouf", p["w"], p["d"], p["h"], suggested=True, name="suggested pouf"), bx, "conversation", suggested=True, extra_seat=True)
            if walk_ok(base, walk_check(L)):
                L.fill_log.append(dict(phase="complete the group", result="filled", kind="pouf", region=dict(x0=r3(bx.cx), y0=r3(bx.cy), x1=r3(bx.cx), y1=r3(bx.cy), walls=[]),
                                       added=[o["id"]], balance_before=r3(balance(L)[2]), balance_after=r3(balance(L)[2])))
                return
            L.objs.remove(o)


def core(L, items, zones, focal, cand, needs):
    L.focal = focal
    if not place_conversation(L, items, zones, focal, cand): return False
    place_work(L, items, zones); place_reading(L, items, zones)
    place_features(L, needs)
    place_conv_side_table(L, items, zones); place_rest(L, items, zones)
    return True


def solve(spec, taste_override=None, profile_override=None, V=None):
    V = dict(V or {})
    room = Room(spec["room"]); items = copy.deepcopy(spec["furniture"]); needs = spec.get("needs", [])
    prof = load_profile(spec, profile_override)
    if V.get("feature") and V["feature"] != "plant_corner":
        prof["features"]["prefer"] = [V["feature"]] + [p for p in prof["features"]["prefer"] if p != V["feature"]]
        if V["feature"] not in prof["features"]["allow"]: prof["features"]["allow"] = prof["features"]["allow"] + [V["feature"]]
    for i in items: i["size"] = i.get("size") or i["options"][0]
    zones = assign_zones(items, needs, V.get("lounge")); focal = choose_focal(room, needs, items, V.get("focal"))
    taste = run_taste(dict(spec, furniture=items), prof, taste_override)
    sofa = next(i for i in items if i["type"] == "sofa"); best = None
    for cand in conv_candidates(room, focal, sofa, V):
        L = Layout(room, prof, V); L.needs = needs
        if not core(L, items, zones, focal, cand, needs): continue
        split, _ = assign_colours(L, taste["statement_piece"])
        hard = [c for c in run_checks(L, split, walk_check(L)) if c["rule"] not in ("visual balance", "room features: 1-2, rule-picked", "pieces grouped (no orphans, no plant rows)")]
        fails = sum(c["status"] == "fail" for c in hard); warns = sum(c["status"] == "warn" for c in hard)
        so = L.get(sofa["id"])["box"]; along = so.cx if cand["wall"] in ("back", "front") else so.cy
        if cand["orient"] == "faces": target = (focal["position"] + room.wall_len(cand["wall"]) / 2) / 2
        else: target = room.wall_len(cand["wall"]) / 2
        target += V.get("lateral", 0) * 0.6 * (0 if V.get("symmetry") == "symmetric" else 1)
        sc = -100 * fails - 10 * warns - L.penalty - 2 * abs(along - target) - 20 * balance(L)[2]
        if best is None or sc > best[0]: best = (sc, cand)
    if best is None: raise SystemExit("could not fit the conversation group for this variant")
    L = Layout(room, prof, V); L.needs = needs
    core(L, items, zones, focal, best[1], needs)
    assign_colours(L, taste["statement_piece"])
    place_styling(L, items, taste, needs)
    complete_group(L)
    fill_empty(L, "before plants")
    place_plants(L, items, taste, needs)
    fill_empty(L, "after plants")
    add_soft_and_props(L, taste)
    split, shell = assign_colours(L, taste["statement_piece"])
    walk = walk_check(L); checks = run_checks(L, split, walk)
    return L, focal, taste, split, shell, checks, walk


# ---------------------------------------------------------------- layers, names, export
def zone_of(o, L):
    host = L.get(o["meta"].get("on")) if o["meta"].get("on") else None
    if host and o["mount"] == "surface": return zone_of(host, L)
    z = o["zone"]
    if z in ("styling", "pets", "storage", "tmp") or z is None:
        near_ = [(dist(o["box"].pt(0, 0), L.get(v["anchor"])["box"].pt(0, 0)), k) for k, v in L.zones.items()]
        near_ = [n for n in near_ if n[0] < 1.6]
        return min(near_)[1] if near_ else ({"pets": "pets", "storage": "storage"}.get(z, "room"))
    return z


def export(spec, L, focal, taste, split, shell, checks, walk):
    room, prof = L.room, L.prof
    rows = []
    # architecture
    rows.append(dict(id="floor", type="floor", zone="room", mount="floor", position=dict(x=room.W / 2, y=room.D / 2, z=0), rotation_deg=0,
                     size=dict(w=room.W, d=room.D, h=0.012), finish=room.spec.get("floor", "concrete"), colour=prof["materials"].get("floor") or "#CBC3B7", colour_role="dominant"))
    for wall in WALLS:
        fin = room.spec.get("walls", {}).get(wall, {})
        b = room.against(wall, room.wall_len(wall) / 2, room.wall_len(wall), 0.14, -0.14)
        rows.append(dict(id=f"wall_{wall}", type="wall", zone=wall, mount="floor", position=dict(x=r3(b.cx), y=r3(b.cy), z=0), rotation_deg=b.rot,
                         size=dict(w=room.wall_len(wall), d=0.14, h=room.H), finish=fin.get("finish", "paint"),
                         colour=fin.get("colour") if fin.get("feature") else prof["palette"]["dominant"][0],
                         colour_role="secondary" if fin.get("feature") else "dominant", render=wall not in room.open_walls))
    for o in room.windows + room.doors:
        b = room.against(o["wall"], o["position"], o["width"], 0.14, -0.14); win = o in room.windows
        rows.append(dict(id=o["id"], type="window" if win else "door", zone=o["wall"], mount="wall", position=dict(x=r3(b.cx), y=r3(b.cy), z=o.get("sill", 0) if win else 0),
                         rotation_deg=b.rot, size=dict(w=o["width"], d=0.14, h=(o["head"] - o["sill"]) if win else 2.1), **{k: v for k, v in o.items() if k in ("sill", "head", "view", "swing", "style")}))
    for o in L.objs:
        b = o["box"]; m = {k: v for k, v in o["meta"].items() if v is not None}
        lay = TYPE_LAYER.get(o["type"], "decor")
        if o["id"] == taste["statement_piece"]: m["statement"] = True
        if o["item"].get("suggested"): m["suggested"] = True
        rows.append(dict(id=o["id"], type=o["type"], name_full=o["name"], zone=zone_of(o, L), mount=o["mount"],
                         position=dict(x=r3(b.cx), y=r3(b.cy), z=r3(o["elev"])), rotation_deg=r3(b.rot),
                         size=dict(w=r3(b.w), d=r3(b.d), h=r3(o["h"])), shape=m.pop("shape", o["item"].get("shape", "rect")),
                         colour_role=o.get("role"), colour=o.get("colour"), style=o["item"].get("style"), kind=o["item"].get("kind"), layer=lay, **m))
    # zone helpers
    for z, info in L.zones.items():
        mem = [o["box"] for o in L.objs if zone_of(o, L) == z and o["mount"] == "floor"]
        if not mem: continue
        bb = bbox_box(mem, 0.15)
        rows.append(dict(id=f"zone_{z}", type="zone", zone=z, mount="helper", position=dict(x=r3(bb.cx), y=r3(bb.cy), z=0), rotation_deg=0,
                         size=dict(w=r3(bb.w), d=r3(bb.d), h=1.0), anchor=info["anchor"]))
    # layer + layer.zone.type_nn names
    count = {}
    for r in rows:
        r["layer"] = TYPE_LAYER.get(r["type"], "decor")
        key = (r["layer"], r["zone"], r["type"]); count[key] = count.get(key, 0) + 1
        r["name"] = f"{r['layer']}.{r['zone']}.{r['type']}_{count[key]:02d}"
    rows.sort(key=lambda r: LAYERS.index(r["layer"]))
    for r in rows:
        if r.get("on"): r["on_name"] = next((q["name"] for q in rows if q["id"] == r["on"]), None)
    return {
        "generator": "hey jenna design_logic.py",
        "coordinates": "plan metres: x left->right wall, y back->front wall; z = height of the base (wall art: centre height); rotation_deg = direction the front faces, 0 = +y",
        "naming": "layer.zone.type_nn",
        "room": dict(name=room.spec.get("name"), width=room.W, depth=room.D, height=room.H, walls=room.spec.get("walls", {}),
                     windows=room.windows, doors=room.doors, light=room.light, open_walls_in_render=sorted(room.open_walls)),
        "variant": L.V, "style_profile": prof, "materials": prof["materials"], "palette": prof["palette"],
        "focal_point": {k: v for k, v in focal.items() if k != "score"},
        "zones": {z: dict(centre=[r3(v) for v in info["centre"]], anchor=info["anchor"], **{k: v for k, v in info.items() if k not in ("centre", "anchor")}) for z, info in L.zones.items()},
        "features": [dict(name=next(r["name"] for r in rows if r["id"] == f), type=L.get(f)["type"], why=L.get(f)["meta"]["why"]) for f in L.features],
        "fill_log": L.fill_log,
        "taste": taste, "colour_split": split, "shell_colours": [dict(surface=s, role=r, area=r3(a)) for s, r, a in shell],
        "layers": {l: [r["name"] for r in rows if r["layer"] == l] for l in LAYERS},
        "objects": rows, "checks": checks, "notes": L.notes,
        "summary": {s: sum(c["status"] == s for c in checks) for s in ("pass", "warn", "fail")},
    }


def report_md(out, spec):
    s = out["summary"]; p = out["style_profile"]
    lines = [f"# Rule-check report: {out['room']['name']} ({p['name']} profile)", "",
             f"**{s['pass']} pass, {s['warn']} warn, {s['fail']} fail.** Generated by `design_logic.py` from `{spec.get('_source', 'input')}`.", "",
             f"- Room: {out['room']['width']} x {out['room']['depth']} m, {out['room']['height']} m walls",
             f"- Needs: {', '.join(spec.get('needs', []))}",
             f"- Style profile: {p['name']} (shape family {p['shape_family']}, {p['light_warmth_k']} K light, art: {p['art']['content']}, {p['art']['arrangement']})",
             f"- Focal point: {out['focal_point']['kind']} on the {out['focal_point']['wall']} wall. Why: {out['focal_point']['why']}",
             f"- Zones: " + "; ".join(f"{z} (anchor {v['anchor']})" for z, v in out["zones"].items()),
             f"- Taste ({out['taste']['source']}): statement piece `{out['taste']['statement_piece']}`, styling density `{out['taste']['styling_density']}`, {out['taste']['plants']} plants",
             f"- Colour split: " + ", ".join(f"{k} {v * 100:.0f}%" for k, v in out["colour_split"].items()), "",
             "| | Rule | Result |", "|---|---|---|"]
    icon = {"pass": "✅", "warn": "⚠️", "fail": "❌"}
    for c in out["checks"]: lines.append(f"| {icon[c['status']]} | {c['rule']} | {c['detail']} |")
    lines += ["", "## Room features", ""] + ([f"- `{f['name']}`: {f['why']}" for f in out["features"]] or ["- none fitted"])
    lines += ["", "## Empty-space fill", ""]
    if not out["fill_log"]: lines.append("- balance passed without fills")
    for f in out["fill_log"]:
        if f["result"] == "filled":
            r = f["region"]
            if f["phase"] == "complete the group": lines.append(f"- complete the group: the empty end of the coffee table gets a **pouf** ({', '.join(f['added'])})"); continue
            lines.append(f"- {f['phase']}: empty {r['x1'] - r['x0']:.1f} x {r['y1'] - r['y0']:.1f} m region at x {r['x0']:.1f}-{r['x1']:.1f}, y {r['y0']:.1f}-{r['y1']:.1f}"
                         f" (walls: {', '.join(r['walls']) or 'none'}) → **{f['kind']}** ({', '.join(f['added'])}); balance {f['balance_before'] * 100:.0f}% → {f['balance_after'] * 100:.0f}%")
        else: lines.append(f"- {f['phase']}: stopped. {f['why']}")
    if out["notes"]: lines += ["", "## Notes", ""] + [f"- {n}" for n in out["notes"]]
    cat = [o["name"] for o in out["objects"] if o.get("cat_safe")]
    if cat: lines += [f"- Cat in the brief: {', '.join(cat)} should be cat-safe species (parlour palm, calathea, spider plant, Boston fern)."]
    lines += ["", "## Layers", "", "| layer | objects |", "|---|---|"]
    for l, names in out["layers"].items(): lines.append(f"| {l} | {len(names)} |")
    lines += ["", "## Placements", "", "| name | x, y (m) | rot | size w x d x h | colour |", "|---|---|---|---|---|"]
    for o in out["objects"]:
        if o["layer"] in ("architecture", "zones"): continue
        pp, z = o["position"], o["size"]
        lines.append(f"| `{o['name']}`{' *' if o.get('suggested') else ''} | {pp['x']:.2f}, {pp['y']:.2f}{f' @ {pp[chr(122)]:.2f}' if pp['z'] else ''} | {o['rotation_deg']:.0f}° | {z['w']:.2f} x {z['d']:.2f} x {z['h']:.2f} | {o['colour_role']} {o['colour'] or ''} |")
    lines += ["", "\\* suggested by the empty-space fill (not on the furniture list: a shopping-list addition)"]
    return "\n".join(lines) + "\n"


def plan_svg(out, walk):
    W, D = out["room"]["width"], out["room"]["depth"]; S = 100; pad = 40
    o = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W * S + 2 * pad} {D * S + 2 * pad + 30}" font-family="Helvetica,Arial" font-size="11">',
         f'<rect width="100%" height="100%" fill="#FBF6EE"/><g transform="translate({pad},{pad})">',
         f'<rect x="0" y="0" width="{W * S}" height="{D * S}" fill="#EDE6DA" stroke="#3B2F29" stroke-width="4"/>']
    d, nx, ny, wide = walk["grid"]
    for j in range(ny):
        i = 0
        while i < nx:  # run-length rows keep the file small
            if wide[j][i]:
                k = i
                while k < nx and wide[j][k]: k += 1
                o.append(f'<rect x="{i * GRID * S:.0f}" y="{j * GRID * S:.0f}" width="{(k - i) * GRID * S + .5:.1f}" height="{GRID * S + .5:.1f}" fill="#CFE6CF"/>'); i = k
            else: i += 1
    for w in out["room"]["windows"] + out["room"]["doors"]:
        a, b = w["position"] - w["width"] / 2, w["position"] + w["width"] / 2; col = "#7FB0E6" if w in out["room"]["windows"] else "#D6483C"
        x0, y0, x1, y1 = {"back": (a, 0, b, 0), "front": (a, D, b, D), "left": (0, a, 0, b), "right": (W, a, W, b)}[w["wall"]]
        o.append(f'<line x1="{x0 * S}" y1="{y0 * S}" x2="{x1 * S}" y2="{y1 * S}" stroke="{col}" stroke-width="9"/>')
    def poly(r):
        p = r["position"]; z = r["size"]; b = Box(p["x"], p["y"], z["w"], z["d"], r["rotation_deg"]); return b, " ".join(f"{x * S:.1f},{y * S:.1f}" for x, y in b.corners())
    rows = [r for r in out["objects"] if r["layer"] not in ("architecture",) and r["mount"] in ("floor", "helper", "wall", "ceiling")
            and r["type"] not in ("curtain", "ceiling_beam", "feature_wall", "wainscoting")]
    order = sorted(rows, key=lambda r: (r["type"] != "zone", r["layer"] != "features", r["type"] != "rug", r["mount"] != "floor"))
    for r in order:
        b, pts = poly(r)
        if r["type"] == "zone":
            o.append(f'<polygon points="{pts}" fill="none" stroke="#8A7F72" stroke-width="1" stroke-dasharray="2 4"/>')
            o.append(f'<text x="{(b.cx - b.w / 2) * S + 4:.1f}" y="{(b.cy - b.d / 2) * S + 12:.1f}" fill="#8A7F72" font-size="10">{r["name"]}</text>'); continue
        col = r["colour"] or "#999"
        dash = ' stroke-dasharray="5 3"' if r["mount"] != "floor" else (' stroke-dasharray="8 2 2 2"' if r.get("suggested") else "")
        op = 0.35 if r["type"] in ("rug", "platform") else 0.85
        o.append(f'<polygon points="{pts}" fill="{col}" fill-opacity="{op}" stroke="#3B2F29" stroke-width="{2 if r["layer"] == "features" else 1.2}"{dash}/>')
        fx, fy = b.front(); o.append(f'<line x1="{b.cx * S:.1f}" y1="{b.cy * S:.1f}" x2="{fx * S:.1f}" y2="{fy * S:.1f}" stroke="#3B2F29" stroke-width="1"/>')
        lab = r["name"].split(".")[-1]; ty = (b.cy + (b.d / 2 * 0.8 if r["type"] in ("rug", "platform") else 0)) * S + 4
        o.append(f'<text x="{b.cx * S:.1f}" y="{ty:.1f}" text-anchor="middle" fill="#1d1a17">{lab}{"*" if r.get("suggested") else ""}</text>')
    o.append(f'</g><text x="{pad}" y="{D * S + 2 * pad + 12}" fill="#3B2F29">green = 90 cm walkway from the door · red = door · blue = window · thick = room feature · * = suggested fill · dashed = wall/ceiling</text></svg>')
    return "\n".join(o)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("input"); ap.add_argument("-o", "--out", default="layout.json")
    ap.add_argument("--report"); ap.add_argument("--svg")
    ap.add_argument("--profile", help="style_profile JSON (from the moodboard); overrides the input's")
    ap.add_argument("--taste", help="JSON from an AI taste pass")
    a = ap.parse_args()
    spec = json.load(open(a.input)); spec["_source"] = os.path.basename(a.input) + (f" + {os.path.basename(a.profile)}" if a.profile else "")
    prof = json.load(open(a.profile)) if a.profile else None
    taste = json.load(open(a.taste)) if a.taste else None
    # optional design variant in the input (orient / lounge / mount / lateral …), see conv_candidates
    L, focal, t, split, shell, checks, walk = solve(spec, taste, prof, spec.get("variant"))
    out = export(spec, L, focal, t, split, shell, checks, walk)
    json.dump(out, open(a.out, "w"), indent=2)
    if a.report: open(a.report, "w").write(report_md(out, spec))
    if a.svg: open(a.svg, "w").write(plan_svg(out, walk))
    s = out["summary"]; print(f"{a.out}: {len(out['objects'])} objects, {s['pass']} pass / {s['warn']} warn / {s['fail']} fail")
    for f in out["features"]: print(f"  feature {f['name']}")
    for f in out["fill_log"]: print(f"  fill {f['phase']}: {f['result']} {f.get('kind', '')} {f.get('added', '')} {f.get('why', '')}")
    for c in checks:
        if c["status"] != "pass": print(f"  {c['status']:4}  {c['rule']}: {c['detail']}")


if __name__ == "__main__":
    main()
