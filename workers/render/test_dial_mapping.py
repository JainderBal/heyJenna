"""python3 workers/render/test_dial_mapping.py   (no Blender needed)"""
import os, sys, unittest
sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "blender"))
from dial_mapping import map_dials, adjust_colour, DEFAULTS


class Mapping(unittest.TestCase):
    def test_sheen_lowers_roughness_texture_raises_bump(self):
        self.assertGreater(map_dials({"sheen": 0})["roughness_scale"], map_dials({"sheen": 1})["roughness_scale"])
        self.assertLess(map_dials({"texture": 0})["bump_strength"], map_dials({"texture": 1})["bump_strength"])

    def test_light_level_scales_world_and_lamps(self):
        dim, bright = map_dials({"light_level": 0}), map_dials({"light_level": 1})
        self.assertLess(dim["world_strength"], bright["world_strength"])
        self.assertLess(dim["light_scale"], bright["light_scale"])

    def test_drama_widens_key_to_fill(self):
        flat, dramatic = map_dials({"light_drama": 0}), map_dials({"light_drama": 1})
        self.assertEqual(flat["key_to_fill"], 1)
        self.assertEqual(dramatic["key_to_fill"], 4)
        self.assertLess(dramatic["fill_scale"], flat["fill_scale"])

    def test_layers_pick_extra_lamps_and_ignore_layout_ones(self):
        names = lambda ls: [l["name"] for l in map_dials({"light_layers": ls})["extra_lamps"]]
        self.assertEqual(names(["pendant", "floor_lamp", "table_lamp"]), [])
        self.assertEqual(names(["wall_sconce", "candles", "bogus", "pendant"]), ["wall_sconce", "candles"])

    def test_accent_lamps_brighter_with_drama(self):
        e = lambda dr: map_dials({"light_drama": dr, "light_layers": ["picture_light"]})["extra_lamps"][0]["energy"]
        self.assertLess(e(0), e(1))

    def test_defaults_and_bad_values_are_safe(self):
        self.assertEqual(map_dials(None), map_dials(DEFAULTS))
        m = map_dials({"sheen": 9, "texture": "x", "accent_share": None})
        self.assertGreaterEqual(m["roughness_scale"], 0.25)

    def test_palette_adjustments(self):
        c = lambda **k: map_dials(k)["colour"]
        grey = "#808080"
        self.assertEqual(adjust_colour(grey, c(palette_value=0.5, value_contrast=0.5, palette_saturation=0.5, palette_temperature=0.5)), "#808080")
        light = adjust_colour(grey, c(palette_value=1))
        dark = adjust_colour(grey, c(palette_value=0))
        self.assertGreater(int(light[1:3], 16), int(dark[1:3], 16))
        warm, cool = adjust_colour(grey, c(palette_temperature=1)), adjust_colour(grey, c(palette_temperature=0))
        self.assertGreater(int(warm[1:3], 16), int(cool[1:3], 16))   # red
        self.assertLess(int(warm[5:7], 16), int(cool[5:7], 16))      # blue
        vivid = "#D6483C"
        sat = lambda h: max(int(h[i:i+2], 16) for i in (1, 3, 5)) - min(int(h[i:i+2], 16) for i in (1, 3, 5))
        self.assertGreater(sat(adjust_colour(vivid, c(palette_saturation=1))), sat(adjust_colour(vivid, c(palette_saturation=0))))
        self.assertGreater(sat(adjust_colour(vivid, c(accent_share=0.25))), sat(adjust_colour(vivid, c(accent_share=0.05))))
        self.assertNotEqual(adjust_colour(vivid, c(hue_spread=1)), adjust_colour(vivid, c(hue_spread=0)))


if __name__ == "__main__": unittest.main()
