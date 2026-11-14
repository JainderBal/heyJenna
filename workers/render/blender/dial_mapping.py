"""Style dials -> render settings. Pure Python (no bpy) so it can be unit-tested with plain python3.

Neutral dial values (sheen .25, texture .45, light_level .6, light_drama .5, palette_* .5,
value_contrast .5, hue_spread .4, accent_share .10) change the scene very little.
"""
import colorsys

DEFAULTS = {
    "sheen": 0.25, "texture": 0.45, "light_level": 0.6, "light_drama": 0.5,
    "light_layers": ["ambient_ceiling", "floor_lamp", "table_lamp"],
    "palette_temperature": 0.5, "palette_value": 0.5, "palette_saturation": 0.5,
    "value_contrast": 0.5, "hue_spread": 0.4, "accent_share": 0.10,
}
# Layers drawn by the layout's own lamp objects; the rest become extra lamps (pos = fractions of room width/depth, height in m).
LAYOUT_LAYERS = {"pendant", "floor_lamp", "table_lamp"}
EXTRA_LAMPS = {
    "ambient_ceiling": {"kind": "AREA", "pos": (0.5, 0.5), "h": 2.6, "energy": 160, "accent": False},
    "wall_sconce": {"kind": "POINT", "pos": (0.1, 0.5), "h": 1.6, "energy": 40, "accent": True},
    "picture_light": {"kind": "POINT", "pos": (0.5, 0.06), "h": 1.9, "energy": 45, "accent": True},
    "led_strip": {"kind": "AREA", "pos": (0.5, 0.94), "h": 2.4, "energy": 60, "accent": False},
    "candles": {"kind": "POINT", "pos": (0.6, 0.6), "h": 0.7, "energy": 8, "accent": True},
}


def _unit(v, default):
    try: return max(0.0, min(1.0, float(v)))
    except (TypeError, ValueError): return default


def normalise(dials):
    d = dict(DEFAULTS)
    for k, v in (dials or {}).items():
        if k in d and v is not None: d[k] = v
    for k in d:
        if k == "light_layers": d[k] = [x for x in (d[k] or []) if isinstance(x, str)]
        elif k == "accent_share":
            try: d[k] = max(0.05, min(0.25, float(d[k])))
            except (TypeError, ValueError): d[k] = DEFAULTS[k]
        else: d[k] = _unit(d[k], DEFAULTS[k])
    return d


def map_dials(dials):
    """dials dict (any subset of the 11) -> settings the Blender script applies."""
    d = normalise(dials)
    scale = 0.4 + 1.2 * d["light_level"]  # .6 -> 1.12
    drama = d["light_drama"]
    lamps = [dict(name=n, **EXTRA_LAMPS[n]) for n in d["light_layers"] if n in EXTRA_LAMPS and n not in LAYOUT_LAYERS]
    for l in lamps:  # accent-type lamps get brighter with drama, ambient ones dimmer
        l["energy"] = round(l["energy"] * ((0.5 + 2 * drama) if l["accent"] else (1.3 - 0.6 * drama)), 2)
    return {
        "roughness_scale": round(1.35 - 1.1 * d["sheen"], 4),  # multiplies each material's roughness
        "bump_strength": round(0.6 * d["texture"], 4),         # 0 smooth ... 0.6 rough
        "world_strength": round(0.85 * scale, 4),               # 0.85 is the previous fixed value
        "light_scale": round(scale, 4),                         # all lamps
        "key_to_fill": round(1 + 3 * drama, 3),                 # designers use ~3x on a focal object
        "fill_scale": round(1.25 - 0.5 * drama, 4),             # sun / window / world, the "fill"
        "accent_scale": round(1 + 2 * drama, 4),                # layout lamps (pendant, floor, table)
        "extra_lamps": lamps,
        "colour": {
            "warmth": round(d["palette_temperature"] - 0.5, 4),  # -.5 cool ... +.5 warm
            "value_gain": round(0.7 + 0.6 * d["palette_value"], 4),
            "saturation_gain": round(0.4 + 1.2 * d["palette_saturation"], 4),
            "contrast": round(0.6 + 0.8 * d["value_contrast"], 4),
            "hue_spread_deg": round((d["hue_spread"] - 0.4) * 90, 2),  # accents drift apart in hue
            "accent_gain": round(1 + (d["accent_share"] - 0.10) * 4, 4),
        },
    }


def adjust_colour(hexc, colour):
    """Apply map_dials()['colour'] to one '#RRGGBB'. Vivid colours count as accents."""
    h = hexc.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hh, s, v = colorsys.rgb_to_hsv(r, g, b)
    accent = s > 0.45
    if accent:
        # deterministic side so a palette's accents spread apart rather than all moving one way
        side = 1 if (int(h, 16) % 2) else -1
        hh = (hh + side * colour["hue_spread_deg"] / 360) % 1.0
        s *= colour["accent_gain"]
    s = s * colour["saturation_gain"]
    v = (0.5 + (v - 0.5) * colour["contrast"]) * colour["value_gain"]
    r, g, b = colorsys.hsv_to_rgb(hh, max(0, min(1, s)), max(0, min(1, v)))
    k = colour["warmth"] * 0.2  # warm: more red, less blue; cool: the reverse
    r, b = r * (1 + k), b * (1 - k)
    return "#" + "".join(f"{int(round(max(0, min(1, x)) * 255)):02X}" for x in (r, g, b))
