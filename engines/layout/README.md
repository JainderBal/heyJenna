# hey jenna: design logic

`design_logic.py` turns a room, the user's needs, a moodboard **style profile** and a furniture list into a checked, layered `layout.json`. The Blender script `../blender/build_room_v6_layout.py` renders that file in the v6 clay style. The module uses the Python standard library only.

```bash
python3 design_logic.py example_input.json -o layout.json --report rule-report.md --svg layout-plan.svg
python3 design_logic.py example_input.json --profile profiles/garden.json -o layout-garden.json --report rule-report-garden.md --svg layout-plan-garden.svg
/Applications/Blender.app/Contents/MacOS/Blender -b -P ../blender/build_room_v6_layout.py            # renders layout.json
```

## Input

| key | what |
|---|---|
| `room` | width, depth, wall height, windows and doors (`wall`, `position` along the wall, `width`, `sill`, `head`, `view`), wall finishes (`feature: true` for a feature wall), floor finish, light direction, `open_walls_in_render` (walls the iso camera cuts away) |
| `needs` | free text, for example "one cat", "works from home", "reads in the evening" |
| `style_profile` | filled from the moodboard (see below). `--profile file.json` replaces it |
| `furniture` | id, type, real `size` {w, d, h} or several `options` the logic chooses from, `colour` (a hex, a role name such as `"secondary"`, or `"auto"`), optional `material`, `style`, `tags` |

## Style profile: what the moodboard can change

| parameter | values | what it changes |
|---|---|---|
| `palette.dominant / secondary / accent` | hex lists | the colours used for the 60/30/10 split. Roles are assigned by visible area, the taste step's statement piece always gets an accent colour, and touching pieces never share a colour. Wall paint is `dominant[0]` |
| `shape_family` | `retro`, `modern`, `garden` | written to every object, so the renderer can pick builders. **Only `retro` builders exist today**; the other families render with retro shapes in their own palette and materials |
| `materials` | `wood`, `wood_light`, `metal` (chrome / black / brass), `floor` (hex or `null` to keep the room's floor), `curtain`, `fabric` | wood pieces (sideboard, platform, window seat, beams), metal parts, floor colour, curtain colour |
| `styling_density` | `sparse`, `balanced`, `layered`, `null` | cushions (1/2/3), the throw, the number of props on surfaces, and the default plant count. `null` lets the taste step decide |
| `plant_count` | number or `null` | plants from the list that get placed (the empty-space fill can add plant groups on top) |
| `art` | `content`, `arrangement` (`gallery`, `pair`, `single`), `colours` | what fills the frames and how many there are. Size and height stay with the rules |
| `light_warmth_k` | 2200–4000 | colour temperature of every lamp |
| `features` | `allow`, `prefer`, `max` (at most 2) | which room features may be used and which are preferred. Each still has to pass its own rule (below) |
| `fillers` | `lounge_chair`, `plant_group`, `side_table`, `pouf`, `reading_lamp` | which kinds of piece the empty-space fill may suggest |

Precedence: an AI taste pass (`TASTE_HOOK` or `--taste`) overrides the profile, and the profile overrides the rule defaults. Whatever wins, placement and every check run afterwards.

## What stays fixed (the profile can't change these)

All values are in the `R` dict at the top of `design_logic.py`.

- **Walkways**: 90 cm main routes from the door to every zone and window, and 38 cm or more to reach every seat, shelf and desk chair.
- **Doors and windows**: 90 cm kept clear in front of doors. Nothing taller than the sill within 45 cm of a window.
- **Coffee table**: 40–45 cm from the sofa, about 2/3 of the sofa's length (±15%).
- **Rug sizing**: tucks 15 cm under the front legs of every conversation seat and runs about 15 cm past each end of the sofa. The smallest option that does this is chosen.
- **Art**: centred about 145 cm from the floor, about 2/3 the width of the furniture below, 15–30 cm above it.
- **Seating**: conversation seats within 3 m of each other, and a table within 75 cm of every seat.
- **Lighting**: ceiling, floor and table layers, plus a lamp within 1.5 m of every task zone (reading, work, lounge).
- **Zones**: 30 cm between pieces of different zones, 15 cm around room features.
- **Balance**: the centre of visual weight is within 10% of the room centre to pass, 18% to warn.
- **Colour**: the 60/30/10 targets, ±8 points.
- **The room itself**: wall positions, openings, the brick feature wall and the floor finish are facts of the room. The profile can repaint plain walls and recolour the floor, but it can't move or remove anything.

## Composition (does the layout make sense?)

Clearance rules alone let a layout pass while making no sense, so these rules drive placement and are also checked:

- **Focal point first.** A wall that is 35% or more glass (more if it's also the feature wall) is the focal point, ahead of a created gallery wall. Fireplaces and good views still win.
- **Seating faces the focal point.** The search tries every sofa position that faces it, backing onto the opposite wall or floating with a walkway (0.9 m+) behind. Chairs go at the table ends facing each other, so the U opens toward the focal and nobody sits with their back to it. If there's one chair, a suggested pouf closes the other end.
- **The view stays open.** Nothing taller than 1 m (outside the group) stands in the strip between the sofa and the focal wall. Tall features, the reading lamp and the cat tree are steered out of it.
- **Off the walls.** In rooms of 20 m² or more, the rug centre is at least 1.2 m from every wall. The group is centred between the focal and the middle of the room.
- **Grouped, not scattered.** Plants cluster in 2s and 3s beside furniture or in the light. Every piece has a neighbour within 0.6 m or stands against a wall. Empty-space fills must join something (a corner of the rug, a piece of furniture, a daylit corner).
- **Reading in daylight.** The reading chair goes beside a window, turned so the light comes over the shoulder, unless no window spot fits. Then a corner is used and the check warns.
- **Art over the right piece.** If the sofa faces the windows, the art goes over the sideboard on a blank closed wall. Over a low piece, a gallery cluster grows taller so it stays 15–30 cm above the furniture with its centre near 145 cm.

## Room features ("lift the room")

Every candidate is generated by a rule. It gets a base score, plus 5 if the profile prefers it. The best 1–2 are kept (only 1 if the room is under 15 m²), and each one has to keep every walkway passing.

| feature | when it's a candidate |
|---|---|
| `platform` | the room is 18 m² or more and there's a reading corner. It's sized to hold that corner (chair, lamp, side table, shelf); the conversation rug may slide along the sofa, within its overhang allowance, to clear it |
| `niche` | a blank stretch of a closed wall 0.45–1.4 m long with nothing tall in front. The floor in front of it stays clear |
| `built_in_shelf` | a blank closed wall of 1.4 m or more with 35 cm free in front |
| `half_wall` | the room is 22 m² or more and the work and conversation zones are less than 3.6 m apart |
| `feature_wall` | only if the room has no feature wall yet |
| `wainscoting` | a closed, non-feature wall with a blank run of 2 m or more |
| `window_seat` | a window with a sill of 45 cm or more and nothing under it (features are placed before the sideboard) |
| `ceiling_beam` | walls 2.6 m or taller |

## Empty-space fill

After the zones, features and cat tree are placed, the fill works in rounds while balance isn't passing:

1. Find the largest empty floor rectangles: 30 cm or more from furniture, outside door and reserved zones, at least 0.9 m on the short side and 1 m².
2. Try the regions on the light side of the room first.
3. Pick the kind of piece by context: a corner with 1.3 m or more gets a **lounge spot** (angled chair and side table, plus a reading lamp, or a low table lamp in the corner nearest the camera). A region against a wall gets a **plant group** (tall, bush, small). A region near the conversation group gets a **pouf** (2 at most).
4. Each piece is kept only if every walkway still passes. Then the fill re-checks balance and repeats.

The fill runs before and after the plants, at most 5 rounds each. When it stops, `fill_log` and the report say why: for each region left, what was tried and why it doesn't fit. In the example, what's left is mostly the 90 cm walkway. Filled pieces are marked `suggested: true` (shopping-list additions, not on the user's list).

## Layers and names

Every object has a `layer` and a `name` of the form `layer.zone.type_nn`, for example `furniture.conversation.sofa_01` or `features.corner.platform_01`. `layout.json["layers"]` lists the names in each layer. The Blender script makes one collection per layer, in this order:

1. `architecture`: floor, walls, windows, doors
2. `features`: platform, niche, built-ins, half wall, window seat, beams, wainscoting
3. `zones`: invisible helper boxes (`zones.conversation.zone_01`, …), hidden in renders
4. `furniture`
5. `soft_furnishings`: rugs, curtains, throws, cushions
6. `lighting`: lamps and their lights, plus sun and window light
7. `decor`: props on surfaces
8. `plants`
9. `art`

For architecture, the zone part of the name is the wall (`architecture.back.window_01`). For features it's where the feature sits (`corner`, a wall, `between`, `ceiling`, a window id).

## Example profiles

- `profiles/retro.json` is the 70s retro loft (the v6 palette, chrome, orange sheers, gallery of colour blocks, 2700 K). It prefers a platform and a niche. Its output is `layout.json`, `rule-report.md`, `layout-plan.svg`, and the render `../blender/render-v6-composed.png` (`render-v6-layers.png` is the earlier, clearance-only round).
- `profiles/garden.json` is a green garden room (sage, rattan, linen, botanical pair, 3000 K, layered styling, 6 plants). It prefers a window seat and ceiling beams. Its output is `layout-garden.json`, `rule-report-garden.md`, `layout-plan-garden.svg`. It isn't rendered yet.

## Many candidates, scored: `variants.py`

```bash
python3 variants.py example_input.json --profile profiles/retro.json --out variants/retro --n 40 --seed 7
python3 variants.py example_input.json --profile profiles/retro.json --replay variants/retro/pick_1/layout.json   # rebuilds one pick exactly
```

**Generation.** Each candidate is a set of design choices, sampled with `random.Random(seed)`. Candidate `s7-14` is always the same layout, and its choices are stored in `layout.json["variant"]`. `design_logic.solve(..., V=variant)` then places everything by the usual rules, searching sofa positions within those choices. The choices are:

| choice | options |
|---|---|
| `focal` | the room's top focal candidates that the camera can see (window wall, art wall, plus fireplace, view or TV when the room has one) |
| `orient` | `faces` (sofa looks at the focal), `frames` (group on a side wall, focal side-on), `under_art` (sofa under the art wall) |
| `mount` | sofa against a `wall`, or `float` with a 0.9–1.1 m walkway behind it |
| `arr` | `U` (chairs at the table ends), `L` (chairs in a row off one sofa end), `facing` (chairs across the table; never when the sofa faces the focal) |
| `lounge` | the comfy chair makes a `reading` spot, or joins the `conversation` (sofa + 2 chairs) |
| `reading_spot` | by a `window` (light over the shoulder) or in a `corner` |
| `feature` | which feature is preferred: `platform`, `niche`, `window_seat`, `half_wall`, or `plant_corner` (plants grouped in the brightest free corner) |
| `rug` | `front` legs on, `all` seating on, or `round` (falls back to the nearest rug that works, with a note) |
| `lateral` | which side of the group the circulation passes (−1, 0, 1) |
| `symmetry` | `symmetric` (group centred on the focal line, plants mirrored in pairs) or `asymmetric` |

**Hard gate.** A candidate is rejected if any check fails. That covers overlaps, walkways, door and window clearance, coffee-table gap, rug under the front legs, conversation distance, layered lighting and task light. In the example, about half the 40 candidates are rejected.

**Soft score (0–100).** A weighted mean of the parts below, minus 2.5 per warning. The weights are in `WEIGHTS`, and each pick's `score.md` shows every part with the reason behind it.

| part | weight | what it measures (style-dials principle) |
|---|---|---|
| focal | 15 | focal strength (fireplace or view 1.0, window wall 0.95, TV 0.85, art wall 0.75) × how well the seating faces or frames it (emphasis) |
| conversation | 12 | every seat pair 1.2–3 m apart and turned toward each other |
| balance | 9 | centre of visual weight within 20% of the room centre (balance) |
| weight_spread | 5 | visual weight spread evenly over the four quadrants |
| daylight | 10 | daylight at the reading spot (chair or window seat) and the desk |
| sightline | 8 | from the doorway, the focal point and the statement piece aren't hidden behind anything taller than 1.3 m |
| zone_sep | 8 | conversation, reading, work and lounge zone anchors at least 1–2.5 m apart |
| colour | 6 | closeness to 60/30/10 |
| proportion | 8 | coffee table and art near 2/3 of the piece they serve; rug at least 15 cm past each sofa end (proportion) |
| rhythm | 5 | accent colours that repeat in 2+ places at least 2 m apart (rhythm) |
| emphasis | 6 | one statement piece and no other large accent piece competing with it (emphasis) |
| grouping | 7 | no orphans, no plant rows (plants chained within 0.8 m count as one cluster, at most 3) |
| float | 4 | the conversation rug sits off the walls (`furniture_float`) |

**Picking 3.** The script ranks by score and takes the best candidate that differs from every earlier pick in at least 3 real decisions. Those are the focal, orientation, arrangement, wall or float, reading spot, rug shape, features, sofa position (more than 1 m apart, or turned differently) and reading position. If fewer than 3 qualify, it relaxes to 2 differences.

**Output** per profile in `variants/<profile>/`:
- `candidates.json`: every candidate with its choices, score, warnings, or the reason it was rejected.
- For each pick, `pick_N/layout.json` (with `variant` and `pick`), `plan.svg`, `score.md` (the breakdown) and `rule-report.md`.

Renders: `../blender/render-v6-pick{1,2,3}.png` and `../blender/compare-v6-variants.jpg` (next to the reference). The garden plans are compared in `../blender/compare-garden-plans.jpg`.
