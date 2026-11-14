# Style dials for hey jenna

How interior designers describe and control a room's style, turned into a set of continuous **dials**. The AI sets the dials from a moodboard and the room generator reads them.

Named presets ("Japandi", "70s") don't fit real moodboards, which are usually a mix. So a style here is a point in dial space. Named styles become example settings (section 4), and the AI can land anywhere between them.

**Who this is for:** anyone on the team, including people who aren't designers. Every dial says what it means, how to judge it from a photo, and which part of the generator it drives.

Contents
1. [What designers work with](#1-what-designers-work-with): the research in short
2. [How to read the dial tables](#2-how-to-read-the-dial-tables)
3. [The dials](#3-the-dials): 9 families, 55 dials
4. [Ten styles as dial settings](#4-ten-styles-as-dial-settings)
5. [What the AI can read and what to ask the user](#5-what-the-ai-can-read-and-what-to-ask-the-user)
6. [From dials to the generator](#6-from-dials-to-the-generator): how this maps onto `design_logic.py` today
7. [Draft JSON schema](#7-draft-json-schema)
8. [Sources and caveats](#8-sources-and-caveats)

---

## 1. What designers work with

Interior design is usually taught as **seven elements** (the raw ingredients) plus **seven or so principles** (how you arrange them). Teaching material lists the elements as space, line, form, light, colour, texture and pattern ([Benha University course notes](https://beng.stafpu.bu.edu.eg/Architectural%20Engineering/5648/crs-14382/Files/Elements%20of%20Interior%20Design.pdf), [Flooring America](https://www.flooringamerica.com/blog/7-elements-of-interior-design)). The principles are balance, rhythm, emphasis, proportion and scale, harmony and unity, contrast and variety, though authors don't agree on one exact list ([Benha University principles](https://beng.stafpu.bu.edu.eg/Architectural%20Engineering/5648/crs-14382/Files/Principles%20of%20Interior%20Design.pdf), [VDCI](https://vdci.edu/learn/interior-design/design-principles-harmony-scale-proportion-balance-rhythm), [Design Files](https://blog.designfiles.co/principles-of-interior-design/)).

What each one means for a generator:

| Concept | What designers mean | What it becomes here |
|---|---|---|
| **Space** | Positive space (filled) vs negative space (empty). The room is the frame for everything else. | `negative_space`, `furniture_float`, `grouping` |
| **Line** | Direction is a line's most expressive quality: horizontal reads calm and grounded, vertical reads formal and tall, diagonal reads energetic. Straight lines feel functional and curved lines feel restful. | `line_direction`, `curvature` |
| **Form** | The 3D shape of objects (geometric vs natural/organic) and of the room itself. | `curvature`, `mass`, `leg_lift`, `leg_style`, `arm_style`, `ornament` |
| **Light** | Daylight plus the artificial layers. Shapes mood. | Lighting family |
| **Colour** | Sets mood. A dark scheme feels gloomy in a dim room but energetic in a bright one. | Colour family |
| **Texture** | Surface quality, either actual (velvet, jute) or visual (wood grain). | `texture`, `sheen`, `rawness` |
| **Pattern** | Deliberate repetition on fabric, wallpaper or tile. Its scale should suit the room. | Pattern family |
| **Balance** | Distribution of *visual weight*: symmetrical, asymmetrical or radial ([VDCI](https://vdci.edu/learn/interior-design/design-principles-harmony-scale-proportion-balance-rhythm)). | `symmetry`. The balance *check* stays a fixed rule. |
| **Rhythm** | Repetition or progression of line, form, colour or texture that moves the eye. | `repetition` |
| **Emphasis** | Every room needs a focal point that catches the eye first. | `focal_point`, `statement_strength` |
| **Proportion and scale** | Scale is size relative to the room and to people. Proportion is how the parts relate to the whole. | `furniture_scale`. Fixed ratios (coffee table ⅔ of sofa, art ⅔ of furniture below) stay in the rules. |
| **Harmony and unity** | Everything reads as one room, usually through a shared palette or material. | Comes from the palette roles and `eclecticism` |
| **Contrast and variety** | Deliberate differences: light vs dark, smooth vs rough, old vs new. | `value_contrast`, `eclecticism`, `texture` |

### Colour systems
- **Three attributes.** Professionals describe a colour by *hue* (colour family), *value* (lightness) and *chroma* (strength or saturation). This is the [Munsell system](https://en.wikipedia.org/wiki/Munsell_color_system), the first to separate them into perceptually even steps. Our colour dials use the same three axes.
- **60/30/10.** About 60% dominant colour (walls, floor, the biggest pieces, often a neutral), 30% secondary, 10% accent. It's a starting point, not a law ([Ideal Home](https://idealhome.co.uk/all-rooms/all-rooms-decor/60-30-10-rule), [Homebuilding & Renovating](https://www.homebuilding.co.uk/home-improvements/60-30-10-rule)). `design_logic.py` already uses this split (`R["split"]`). The `accent_share` dial lets a maximalist room push the accent past 10%.
- **Temperature.** Warm colours (reds, oranges, yellows, warm whites) feel close and cosy. Cool colours (blues, greens, grey-whites) recede and feel airy.
- **Schemes.** Monochrome, analogous (neighbouring hues), complementary (opposite hues), triadic. This becomes one dial, `hue_spread`.

### Materials and finishes
Each style has a material signature. Mid-century uses teak and walnut with brass or molded plastic ([Chairish](https://www.chairish.com/blog/what-makes-a-piece-of-furniture-mid-century-modern)). Industrial uses exposed brick, concrete, black steel and reclaimed wood with patina ([MasterClass](https://www.masterclass.com/articles/industrial-interior-design-explained), [Houzz](https://www.houzz.com/magazine/your-guide-to-industrial-style-stsetivw-vs~121791085)). Art Deco uses lacquer, brass, chrome, marble, glass and exotic woods, with "smooth, glossy and reflective" finishes ([Chairish Art Deco guide](https://www.chairish.com/blog/sc-art-deco-interior-design-guide/)). Wabi-sabi uses limewash, plaster, rough ceramics and aged wood, and prefers rough to smooth ([Style by Emily Henderson](https://stylebyemilyhenderson.com/what-is-wabi-sabi-design)). Four questions separate these: **how dark is the wood, which metal, how shiny, how raw**. Those are the material dials.

### Furniture form language
Designers identify furniture by its silhouette: how high it sits, whether you see its legs, how thick it is, what the arms look like, how curved it is and how decorated it is.
- **Legs.** Tapered or splayed legs are a "consistent marker" of mid-century, while boxy or turned legs point elsewhere ([Chairish](https://www.chairish.com/blog/what-makes-a-piece-of-furniture-mid-century-modern)).
- **Visual weight.** Leggy pieces feel airy. Skirted pieces upholstered down to the floor feel grounded and monolithic, and designers mix the two ([Livingetc](https://www.livingetc.com/advice/visual-weight-in-interior-design), [Homes & Gardens](https://homesandgardens.com/interior-design/legs-v-no-legs-debate)).
- **Curvature.** Mid-century mixes clean lines with organic curves. Art Deco mixes geometric steps with fan curves. Industrial is rectilinear.

### Era and style families
What actually separates the families is a handful of dial differences, not a whole new vocabulary:
- **Scandinavian vs Japandi.** Scandinavian is lighter and brighter, with pale wood, white walls and soft pops of colour. Japandi is darker and warmer, with more raw material, black accents, lower furniture and stricter emptiness ([2Modern](https://2modern.com/blogs/trend-report/difference-scandinavian-japandi-design), [MasterClass](https://www.masterclass.com/articles/japandi), [Livingetc](https://www.livingetc.com/features/japandi-style)).
- **Boho vs maximalist.** Both layer heavily. Boho is warm, natural and handmade (kilims, block prints, rattan). Maximalism is about density whatever the palette, held together by a unifying colour story ([Apartment Therapy](https://www.apartmenttherapy.com/maximalist-design-36897524), [Livingetc](https://www.livingetc.com/ideas/modern-boho-trend), [Galerie](https://galeriemagazine.com/designers-share-secrets-for-making-the-most-out-of-maximalism/)).
- **1970s.** Earth tones (avocado, mustard, burnt orange, harvest gold, chocolate, rust), shag, low modular seating and the conversation pit. Designers suggest scaling it down: "one earth-tone chair … reads intentional; a full room … reads like a costume" ([Apartment Therapy](https://www.apartmenttherapy.com/living-room-trends-over-the-past-fifty-plus-years-36806162), [Wayfair UK](https://www.wayfair.co.uk/sca/ideas-and-advice/styles/1970s-interior-design-trends-T9246)). That is an argument for continuous dials over presets.
- **Coastal, farmhouse and traditional** differ mostly in palette, symmetry and ornament. Traditional means symmetrical layouts, detailed woodwork, silk, velvet and polished wood. Coastal means light, hazy blues and wicker ([Houzz style guide](https://www.houzz.com/products/interior-design-styles-guide), [Redfin](https://www.redfin.com/blog/popular-interior-design-styles/)).

### Density and styling
"Layered" and "curated" are different things. Curated means fewer objects, each with space around it. Layered means more pieces, overlapping textiles and grouped objects. Maximalism done well is still edited ("more without clutter", [Duffy London](https://www.duffylondon.com/the-journal/maximalist-interior-design)). So density gets one dial and *order* (styled vs lived-in) gets another.

### Pattern mixing
The usual rule is three scales: one large, one medium, one small. Large patterns go on big surfaces (rug, statement chair) and small ones on accents (cushions). Never two large prints, and tie them together with a shared colour ([Homes & Gardens](https://www.homesandgardens.com/decor/using-scale-to-mix-patterns), [MasterClass](https://www.masterclass.com/articles/tips-for-mixing-patterns-in-your-home-decor)).

### Lighting design
There are three layers. **Ambient** is the soft, even base. **Task** is bright and focused (desk, reading chair). **Accent** grazes a wall or picks out an object. Homes usually sit at 2700–5000 K: warm for living and resting, neutral for working, ideally one temperature per room. Dimmers matter ([Houzz](https://www.houzz.com.sg/magazine/a-beginner-s-guide-to-creating-layers-of-light-stsetivw-vs~65017170), [Pembrooke & Ives](https://www.pembrookeandives.com/journal/2026/05/06/how-to-layer-lighting-in-every-room-of-the-home/), [Build-Construct](https://build-construct.com/architecture/interior-lighting-design-ambient-task-and-accent-lighting-for-residential-spaces/)). Mood comes from *how much* light there is and *how even* it is (flat vs pools of light), so those get two dials.

### Spatial planning
Walkways of about 90 cm (36 in), secondary paths of about 60 cm, and 35–45 cm between sofa and coffee table ([CBC](https://amp.cbc.ca/life/thegoods/design-by-numbers-simple-standards-to-instantly-improve-your-living-room-layout-1.4484853), [Homes & Gardens](https://www.homesandgardens.com/interior-design/the-library-how-to-design-the-perfect-living-room-layout)). These are **rules, not style**, and they already live in `design_logic.py`'s `R` table. Style decides *how* a layout feels inside those rules:
- whether seating hugs the walls or floats in a group;
- how tight the groups are;
- which focal point everything faces.

Pushing every piece against the walls is a classic amateur mistake. Designers pull the conversation group in and anchor it on a rug.

### Soft furnishings, art and plants
Rugs, curtains, cushions and throws carry most of a room's texture and pattern. Art is chosen for content (abstract, botanical, photographic) and arrangement (one statement piece, a pair, a grid, a salon wall). Plants link to biophilic design: the [Terrapin Bright Green *14 Patterns*](https://www.terrapinbrightgreen.com/reports/14-patterns/) report groups it into nature in the space (plants, water, views), natural analogues (biomorphic forms, natural materials) and nature *of* the space (prospect, refuge). The `plant_amount`, `curvature` and natural-material dials together cover the first two.

---

## 2. How to read the dial tables

- **Range.** Most dials are a number from **0 to 1**, with both ends described in words. A few are a choice from a list (marked *enum*) or a real unit (kelvin).
- **Judge it from a photo.** What a designer (or the vision model) looks at to set the dial.
- **Drives.** The generator part it feeds:
  - `palette`: the colour roles;
  - `shape`: furniture generators;
  - `materials`;
  - `layout`: placement preferences, never the rules;
  - `features`: built-in room features;
  - `props`: decor, soft furnishings, plants, art;
  - `lighting`.
- **AI.** How reliably a vision model can set the dial from moodboard images. ●●● reliable, ●●○ usable with a confidence score, ●○○ ask the user or use a default. Section 5 explains why.

---

## 3. The dials

### A. Colour (8 dials)

| Dial | Meaning | Range | Judge it from a photo | Drives | AI |
|---|---|---|---|---|---|
| `colour_roles` | The actual colours, split into dominant / secondary / accent (60/30/10). This is the parameter the other colour dials describe. | hex lists | Cluster the image colours by area. Walls, floor and big upholstery are dominant, mid-size furniture is secondary, small bright bits are accent. | palette | ●●● |
| `palette_temperature` | Overall warm vs cool | 0 cool (blue-grey, cool white) … 1 warm (terracotta, cream, ochre) | Average hue of the big surfaces, ignoring the light's colour cast (see `light_warmth_k`). | palette | ●●○ |
| `palette_value` | How light the room's colours are (the "key") | 0 dark and moody … 1 light and airy | Average lightness of walls and floor. | palette | ●●● |
| `palette_saturation` | How strong the colours are (Munsell chroma) | 0 muted, greyed … 1 vivid, pure | Do the colours look "dusty" or like paint straight from the tin? | palette | ●●● |
| `value_contrast` | Spread between the darkest and lightest areas | 0 tonal, everything similar … 1 graphic (black on white) | Squint at the photo: do you see blocks of dark and light, or one soft wash? | palette, materials | ●●● |
| `hue_spread` | How many colour families appear | 0 monochrome … 0.3 analogous … 0.6 complementary … 1 rainbow/eclectic | Count clearly different hues outside the neutrals. | palette | ●●● |
| `accent_share` | Share of area given to accent colours | 0.05 … 0.25 (default 0.10) | Area of the boldest colours vs the whole image. | palette (`R["split"]` target) | ●●○ |
| `wall_treatment` | What the walls do | *enum*: `plain_paint`, `colour_drenched` (walls and trim one colour), `two_tone`, `limewash_plaster`, `wallpaper`, `panelling`, `exposed_brick`, `concrete`, `tile` | Look at the walls directly. | materials, features | ●●● |

### B. Line and form (8 dials)

These feed the **parametric furniture generators**. One set of form dials should shape every piece, so a sofa, a side table and a lamp read as one family.

| Dial | Meaning | Range | Judge it from a photo | Drives | AI |
|---|---|---|---|---|---|
| `curvature` | Rectilinear vs rounded or organic | 0 square, hard corners … 0.5 softened corners … 1 blobby, organic, arched | Corner radius on sofas and tables, round vs rectangular tabletops and rugs, arches. | shape (corner radius, round/oval variants), props | ●●● |
| `line_direction` | Is the room low and horizontal or tall and vertical? | 0 tall and vertical (high backs, tall shelving, Deco) … 1 low-slung and horizontal (floor seating, long low sideboards) | Seat and back heights relative to the windows. Is the silhouette stretched sideways or upwards? | shape (height/length ratios), layout (tall items) | ●●○ |
| `leg_lift` | How much floor shows under the furniture (visual weight) | 0 skirted, plinth or sits on the floor … 1 high on slim legs, lots of floor visible | Can you see floor under the sofa and cabinets? | shape (leg height vs body), affects the balance weight | ●●● |
| `leg_style` | The kind of leg | *enum*: `tapered_splayed`, `straight_square`, `turned`, `cabriole`, `hairpin`, `tubular_chrome` (incl. cantilever), `sled_frame`, `block`, `bun`, `plinth`, `none` | Look at the legs. | shape | ●●○ (small in photos) |
| `mass` | How thick and heavy the pieces are | 0 slender frames, thin tops … 1 chunky, overstuffed, thick slabs | Thickness of arms, cushions and tabletops relative to the overall size. | shape (member thickness, cushion depth) | ●●● |
| `arm_style` | Sofa and armchair arms | *enum*: `none`, `track` (square), `slope`, `rolled`, `flared`, `rounded_wrap`, `wood_frame` | Look at the sofa ends. | shape | ●●○ |
| `ornament` | Decoration on the furniture itself | 0 plain … 0.5 piping, fluting, tufting … 1 carving, inlay, gilding, fringe | Count the decorative details on frames and upholstery. | shape (detail modifiers), materials | ●●○ |
| `modularity` | One-piece vs modular, segmented forms | 0 single classic pieces … 1 modular blocks, sectional, stacked cushions (70s) | Is the sofa made of repeated blocks or channel tufting? | shape (sofa builder) | ●●● |

### C. Materials and texture (8 dials)

| Dial | Meaning | Range | Judge it from a photo | Drives | AI |
|---|---|---|---|---|---|
| `wood_tone` | Colour of the main wood | 0 pale (ash, birch, whitewash) … 0.5 oak, honey … 1 dark (walnut, ebony, wenge) | Sample the wood surfaces. Mixed woods → take the dominant one and note the second. | materials (`wood`, `wood_light`) | ●●● |
| `wood_amount` | How much of the room is wood | 0 none … 1 wood everywhere (floors, panelling, furniture) | Area share of wood. | materials, shape (which pieces get wood) | ●●● |
| `metal_finish` | The main metal | *enum*: `none`, `black_iron`, `chrome`, `brushed_steel`, `brass`, `bronze_copper`, `white_powder` | Colour and reflection of legs, frames and lamps. | materials (`metal`) | ●●○ |
| `metal_amount` | How visible metal is | 0 hidden … 1 structural and everywhere (industrial, Deco) | Area and number of metal parts. | materials, shape (metal frames vs wood) | ●●○ |
| `sheen` | Matte vs glossy surfaces | 0 chalky and matte … 1 lacquer, mirror, high gloss | Highlights and reflections on furniture and walls. | materials (roughness value in Blender) | ●●○ |
| `texture` | How tactile the surfaces are | 0 sleek and smooth … 1 rough (bouclé, shag, jute, rattan, raw plaster) | Visible weave, pile and grain in close-ups. | materials (fabric, bump strength), props | ●●○ |
| `rawness` | How finished vs raw, aged or imperfect | 0 pristine and new … 1 weathered, patina, exposed structure, handmade wobble | Exposed brick or concrete, distressed wood, hand-thrown ceramics. | materials, features (beams, exposed brick) | ●●○ |
| `natural_materials` | Natural vs synthetic materials | 0 plastic, glass, chrome, laminate … 1 rattan, linen, wool, jute, stone, clay | Count natural vs synthetic materials. | materials (`fabric`), props (baskets, ceramics), plant pots | ●●○ |

Plus one list parameter, `fabric` (*enum*, ranked): `linen`, `cotton`, `boucle`, `velvet`, `leather`, `wool`, `corduroy`, `shag`, `sheepskin`. It feeds `materials.fabric`.

### D. Pattern (3 dials)

| Dial | Meaning | Range | Judge it from a photo | Drives | AI |
|---|---|---|---|---|---|
| `pattern_amount` | How much patterned surface there is | 0 all solids … 1 pattern on pattern | Share of area that is patterned (rug, cushions, wallpaper, curtains). | props, materials (textures) | ●●● |
| `pattern_scale` | The dominant print size | 0 small, fine … 1 large, bold | Repeat size relative to a cushion. The rule is one large, one medium, the rest small. | props | ●●○ |
| `pattern_motif` | What the patterns are | *enum list*: `stripe`, `check`, `geometric` (Deco chevron, fan, 70s supergraphic), `organic_abstract`, `floral_botanical`, `handmade_global` (kilim, block print, mudcloth), `damask_traditional`, `none` | Name the motifs you see. | props (rug, cushion, curtain textures), art | ●●● |

### E. Composition (5 dials, from the principles)

| Dial | Meaning | Range | Judge it from a photo | Drives | AI |
|---|---|---|---|---|---|
| `symmetry` | Formal vs relaxed balance | 0 asymmetric, off-centre … 1 mirror symmetry (pairs of lamps, chairs either side) | Does the room mirror across the focal point? | layout (pairing, centring), props (pairs) | ●●○ |
| `repetition` | Rhythm through matching repeated elements | 0 everything different … 1 sets, pairs, repeated shapes and colours | Count matching items and repeated motifs. | props, shape (reuse one generator variant) | ●●○ |
| `statement_strength` | How hard one hero piece stands out | 0 quiet, nothing dominates … 1 one bold piece (colour, size or shape) owns the room | Is there one piece your eye goes to first? | palette (accent goes on it), layout (focal). Sets `taste.statement_piece`. | ●●○ |
| `eclecticism` | Matched set vs collected mix of eras and styles | 0 everything from one family … 1 vintage + modern + global mix | Do the pieces look bought together or collected over years? | shape (allow mixed form dials per piece), props | ●●○ |
| `furniture_scale` | Size of the pieces relative to the room | 0 small, apartment-scale … 1 generous, oversized | Seat depth and sofa length vs door and window size. | shape (size options), layout | ●○○ (moodboard rooms are a different size from the user's) |

### F. Space and layout (6 dials)

These change **preferences** inside the fixed rules. They never change `R`.

| Dial | Meaning | Range | Judge it from a photo | Drives | AI |
|---|---|---|---|---|---|
| `negative_space` | How much empty floor and wall | 0 full, every corner used … 1 airy, gallery-like | Share of floor and wall left empty. | layout (`fill_empty` stop point, filler count) | ●●○ |
| `furniture_float` | Pieces against the walls vs floated in the room | 0 everything against the walls … 1 conversation groups floated in the middle, anchored on a rug | Is there floor visible behind the sofa? Is the group in the middle of the room? | layout (anchor scoring) | ●●○ |
| `grouping` | Loose and spread out vs tight clusters | 0 pieces spread evenly … 1 tight groups with clear gaps between them | Do the objects form clusters (plants together, chair + lamp + table) or a row along the walls? | layout (zone padding, filler and plant placement) | ●●○ |
| `focal_point` | What the room is arranged around | *enum*: `window_view`, `fireplace`, `feature_wall`, `art`, `tv`, `statement_furniture`, `shelving` | What the seating faces. | layout (`choose_focal`), features | ●○○ (depends on the user's room and habits) |
| `zone_definition` | Open, blended zones vs clearly separate ones | 0 one open space … 1 each zone marked with its own rug, platform or half wall | Do rugs, levels or screens divide the room? | features (platform, half_wall), props (rugs per zone) | ●●○ |
| `architectural_detail` | Plain box vs detailed shell | 0 plain flat walls … 1 mouldings, beams, panelling, arches, niches | Look at walls, ceiling and windows. | features (`allow`, `prefer`, `max`) | ●●● (but ask renters whether they can build) |

### G. Density and styling (4 dials)

| Dial | Meaning | Range | Judge it from a photo | Drives | AI |
|---|---|---|---|---|---|
| `styling_density` | How many objects and accessories | 0 bare … 0.33 sparse … 0.66 balanced … 1 layered and full | Count objects on surfaces, cushions and wall items. | props (`DENSITY` table). Maps to sparse / balanced / layered. | ●●● |
| `styling_order` | Precise and styled vs relaxed and lived-in | 0 casual (books in piles, throw tossed) … 1 composed (odd-number groupings, objects spaced out, aligned) | Do the vignettes look arranged? | props (jitter, rotation, grouping rules) | ●●○ |
| `textile_layers` | How much soft layering | 0 none … 1 rug on rug, throws, many cushions, layered curtains | Count the textiles on the sofa and floor. | props (cushion count, throw, double rug) | ●●● |
| `books_and_objects` | How much personal collection shows | 0 hidden … 1 full shelves, collections on display | Look at the shelves. | props (`books`, `vase`, shelf fill) | ●●● |

### H. Soft furnishings, art and plants (8 dials)

| Dial | Meaning | Range | Judge it from a photo | Drives | AI |
|---|---|---|---|---|---|
| `rug_type` | The main rug | *enum*: `none`, `flatweave_solid`, `jute_sisal`, `shag`, `persian_vintage`, `geometric`, `kilim_handmade`, `sheepskin` | Look at the floor. | props | ●●● |
| `rug_shape` | Rug outline | *enum*: `rect`, `round`, `organic` | Look at the floor. | props | ●●● |
| `window_treatment` | Curtains or blinds | *enum*: `none`, `sheer`, `linen_drape`, `heavy_drape`, `roman_blind`, `venetian`, `shutters`, `bead_or_fringe` | Look at the windows. | props (`curtain`), materials | ●●● |
| `art_amount` | How much wall art | 0 bare walls … 1 walls covered | Count framed pieces relative to wall area. | props (art count) | ●●● |
| `art_arrangement` | How art is hung | *enum*: `single_statement`, `pair`, `grid`, `salon` (mixed sizes, dense), `ledge_leaning` | Look at the hanging pattern. | props (`art.arrangement`) | ●●● |
| `art_content` | What the art shows | *enum*: `abstract_colour`, `line_drawing`, `botanical`, `photography`, `graphic_poster`, `landscape`, `classical_portrait`, `textile_hanging`, `mirror` | Look at the art. | props (`art.content`) | ●●● |
| `plant_amount` | How much greenery | 0 none … 1 jungle | Count plants and the area they cover. | props (`plant_count`) | ●●● |
| `plant_kind` | Which plants | *enum list*: `sculptural_single` (fiddle-leaf, olive), `trailing`, `palms`, `cacti_succulents`, `branches_ikebana`, `bushy_mixed` | Plant silhouettes. | props (plant builder `kind`) | ●●○ |

### I. Lighting (5 dials)

| Dial | Meaning | Range | Judge it from a photo | Drives | AI |
|---|---|---|---|---|---|
| `light_warmth_k` | Colour temperature of the artificial light | 2200 (candle-warm) … 2700 (standard warm) … 3000 … 4000 (neutral) | Colour cast of lamplight on white surfaces. **Careful:** the camera's white balance and photo filters distort this. | lighting (Blender lamp colour) | ●○○ (default 2700 and let the user adjust) |
| `light_level` | Overall brightness and mood | 0 dim, moody, pools of dark … 1 bright, airy, daylight-filled | Photo exposure and dark corners. Also distorted by photography. | lighting (world strength, lamp power), palette (read with `palette_value`) | ●●○ |
| `light_drama` | Even light vs pools of light (how much the accent layer stands out) | 0 flat and even … 1 strong contrast, lit objects against dark | Bright spots on art or objects vs evenness. | lighting (accent lamp power vs ambient) | ●●○ |
| `light_layers` | Which layers appear | *set*: `ambient_ceiling`, `pendant`, `floor_lamp`, `table_lamp`, `wall_sconce`, `picture_light`, `led_strip`, `candles` | Count the fixtures you can see. | lighting, props (lamp items) | ●●● |
| `fixture_style` | Look of the lamps | *enum*: `paper_lantern`, `globe_opal`, `mushroom`, `arc`, `cage_edison`, `pleated_fringed`, `brass_geometric`, `minimal_tube` | Look at the lamps. Mostly follows from the form and material dials, so treat this as an override. | shape (lamp builders) | ●●○ |

**Era is not a dial.** "1970s" or "mid-century" is a *region* of dial space (section 4). An optional `era_hints` list (`1930s`, `1950s`, `1960s`, `1970s`, `1980s`, `contemporary`) can still bias motif and prop choice, e.g. lava lamp or atomic clock.

---

## 4. Ten styles as dial settings

These are **example settings, not presets**: points the AI can sit near or between. 0 = left end of the dial, 1 = right end. Where sources disagree (e.g. Japandi contrast) the number is a reasonable middle.

**Colour and form**

| Dial | Mid-century | 1970s | Scandi | Japandi | Industrial | Boho | Maximalist | Art Deco | Coastal | Traditional |
|---|---|---|---|---|---|---|---|---|---|---|
| palette_temperature | .6 | .85 | .3 | .55 | .35 | .8 | .55 | .5 | .25 | .6 |
| palette_value | .6 | .4 | .9 | .55 | .35 | .65 | .4 | .35 | .9 | .5 |
| palette_saturation | .5 | .6 | .2 | .1 | .2 | .5 | .85 | .7 | .35 | .45 |
| value_contrast | .5 | .4 | .3 | .6 | .6 | .3 | .75 | .85 | .3 | .5 |
| hue_spread | .5 | .45 | .2 | .1 | .15 | .6 | .9 | .45 | .3 | .4 |
| curvature | .5 | .75 | .4 | .5 | .15 | .7 | .5 | .6 | .45 | .55 |
| line_direction | .7 | .9 | .5 | .85 | .5 | .75 | .5 | .3 | .5 | .4 |
| leg_lift | .8 | .2 | .7 | .4 | .6 | .35 | .5 | .5 | .5 | .3 |
| leg_style | tapered_splayed | plinth / tubular_chrome | tapered / straight | block / low straight | hairpin / black_iron | none (floor) / turned | mixed | plinth / block | turned / straight | turned / cabriole / bun |
| mass | .3 | .8 | .3 | .5 | .6 | .5 | .6 | .6 | .55 | .7 |
| ornament | .1 | .2 | .05 | 0 | .1 | .5 | .7 | .7 | .2 | .8 |
| modularity | .2 | .9 | .2 | .3 | .1 | .4 | .3 | .1 | .2 | 0 |

**Materials, pattern, composition**

| Dial | Mid-century | 1970s | Scandi | Japandi | Industrial | Boho | Maximalist | Art Deco | Coastal | Traditional |
|---|---|---|---|---|---|---|---|---|---|---|
| wood_tone | .7 teak/walnut | .6 | .15 ash/birch | .5 light + dark | .6 reclaimed | .4 | .6 | .9 lacquer/ebony | .2 whitewash | .75 mahogany |
| metal_finish | brass | chrome | none / black | black / none | black_iron | brass | brass | brass | brushed_steel | brass (antique) |
| metal_amount | .3 | .4 | .1 | .1 | .85 | .2 | .4 | .7 | .15 | .3 |
| sheen | .3 | .4 | .1 | .1 | .3 | .1 | .5 | .9 | .1 | .5 |
| texture | .3 | .85 | .45 | .6 | .7 | .9 | .6 | .3 | .6 | .4 |
| rawness | .1 | .2 | .2 | .5 | .9 | .5 | .2 | 0 | .5 | .1 |
| natural_materials | .6 | .5 | .8 | .95 | .5 | .95 | .5 | .3 | .85 | .6 |
| fabric | wool / leather | boucle / corduroy / shag | wool / sheepskin | linen | leather | linen / cotton | velvet | velvet | linen / cotton | silk / velvet |
| pattern_amount | .3 | .5 | .15 | .05 | .1 | .7 | .95 | .5 | .3 | .6 |
| pattern_motif | geometric, organic_abstract | geometric (supergraphic), floral | stripe, geometric | none | none | handmade_global | all, mixed scales | geometric (chevron, fan, sunburst) | stripe | damask, floral, stripe |
| symmetry | .3 | .3 | .4 | .4 | .3 | .1 | .4 | .9 | .5 | .9 |
| statement_strength | .6 | .7 | .3 | .4 | .5 | .4 | .5 | .8 | .3 | .5 |
| eclecticism | .3 | .4 | .15 | .1 | .35 | .8 | .9 | .2 | .25 | .2 |

**Space, styling, lighting**

| Dial | Mid-century | 1970s | Scandi | Japandi | Industrial | Boho | Maximalist | Art Deco | Coastal | Traditional |
|---|---|---|---|---|---|---|---|---|---|---|
| negative_space | .6 | .4 | .75 | .9 | .6 | .25 | .1 | .5 | .65 | .4 |
| furniture_float | .5 | .85 (conversation pit) | .4 | .5 | .5 | .4 | .5 | .6 | .5 | .65 |
| grouping | .6 | .9 | .5 | .6 | .5 | .6 | .7 | .7 | .5 | .7 |
| styling_density | .35 | .6 | .3 | .15 | .35 | .8 | .95 | .5 | .4 | .6 |
| styling_order | .7 | .4 | .7 | .9 | .5 | .3 | .5 | .9 | .6 | .85 |
| textile_layers | .3 | .7 | .5 | .3 | .2 | .9 | .8 | .4 | .5 | .6 |
| rug_type | geometric | shag | flatweave_solid | jute_sisal | persian_vintage | kilim_handmade | persian_vintage | geometric | jute_sisal | persian_vintage |
| art_arrangement | single_statement | grid / gallery | pair / ledge | single_statement | single_statement | salon | salon | single_statement / mirror | pair | pair / symmetrical |
| art_content | abstract_colour | graphic_poster | line_drawing / graphic_poster | branches, calligraphy (single) | photography | textile_hanging | everything | mirror / geometric | photography / landscape | landscape / portrait |
| plant_amount | .4 | .6 | .3 | .3 | .3 | .9 | .6 | .2 | .35 | .3 |
| plant_kind | sculptural_single | trailing | bushy_mixed | branches_ikebana | sculptural_single | trailing, palms | mixed | palms | palms | bushy_mixed |
| light_warmth_k | 2700 | 2400 | 2700 | 2700 | 2400 (Edison) | 2400 | 2700 | 2700 | 3000 | 2700 |
| light_level | .6 | .4 | .85 | .5 | .45 | .55 | .5 | .45 | .9 | .55 |
| light_drama | .5 | .5 | .3 | .5 | .6 | .4 | .5 | .7 | .2 | .5 |
| fixture_style | globe_opal / arc | mushroom | paper_lantern / minimal | paper_lantern | cage_edison | pleated_fringed / rattan | pleated_fringed | brass_geometric | globe_opal | pleated (fabric shade) |

Where the two existing profiles sit:
- **`profiles/retro.json`** ≈ halfway between Mid-century and 1970s, with `hue_spread` ≈ .7 (the red/blue/yellow/pink accents) and `pattern_amount` ≈ .4.
- **`profiles/garden.json`** ≈ Boho with lower saturation (.35), `plant_amount` .85 and `natural_materials` .9. It isn't one of the ten. That's the reason for dials over presets.

---

## 5. What the AI can read and what to ask the user

### Why dials, not labels
Image classifiers *can* label a room's style. The [MMIS benchmark](https://arxiv.org/abs/2407.05980) reports about 86–88% top-1 accuracy over many style classes. But style labels are subjective. Researchers note that designers apply several style guidelines at once and that hard labels lose that ([Furniture style compatibility, arXiv 2010.10557](https://arxiv.org/abs/2010.10557)). A moodboard of 8 images may contain 3 "styles". Continuous dials average cleanly where labels don't.

### Reading a moodboard: method
1. **Score each image on its own**, giving a value and a 0–1 confidence for each dial (confidence is low when the feature isn't visible, e.g. no legs in shot).
2. **Combine** with a confidence-weighted median, not a mean, so one odd image doesn't drag the room.
3. **Report the spread.** If images disagree strongly on a dial (spread > 0.35), the moodboard is mixed on that dial: either ask the user, or set `eclecticism` higher and let pieces vary.
4. **Separate the room from the photo.** Exposure, white balance and filters change how light, warm and saturated an image looks. Read colour from object surfaces (walls, upholstery), not the overall image tint.

### Confidence tiers

**Reliable from images (●●●).** Visible, physical and consistent:
- colours (`colour_roles`, `palette_value`, `palette_saturation`, `value_contrast`, `hue_spread`);
- `wall_treatment`;
- `curvature`, `leg_lift`, `mass`, `modularity`;
- `wood_tone`, `wood_amount`;
- `pattern_amount`, `pattern_motif`;
- `styling_density`, `textile_layers`, `books_and_objects`;
- `rug_type`, `rug_shape`, `window_treatment`, `art_amount`, `art_arrangement`, `art_content`, `plant_amount`;
- `light_layers`, `architectural_detail`.

**Usable with a confidence score (●●○).** Visible but small, ambiguous or affected by the camera:
- `palette_temperature`, `accent_share`;
- `line_direction`, `leg_style`, `arm_style`, `ornament`;
- `metal_finish`, `metal_amount`, `sheen`, `texture`, `rawness`, `natural_materials`;
- `pattern_scale`;
- `symmetry`, `repetition`, `statement_strength`, `eclecticism`;
- `negative_space`, `furniture_float`, `grouping`, `zone_definition`;
- `styling_order`, `plant_kind`, `light_level`, `light_drama`, `fixture_style`.

Layout dials (`negative_space`, `furniture_float`, `grouping`) are readable as a *preference*, but a moodboard room is a different shape and size from the user's room. Use them to bias scoring, never to copy positions.

**Ask the user, or use a sensible default (●○○).** These depend on the user's life or room, not on taste:

| Ask about | Why images can't tell | Default |
|---|---|---|
| `focal_point` (especially "is there a TV?") | Moodboards are usually TV-free. Real rooms often aren't. | the window or feature wall, as `choose_focal` does now |
| `furniture_scale` | Moodboard rooms are a different size | fit to room: largest size option that passes the rules |
| `light_warmth_k` | Camera white balance hides the true lamp colour | 2700 K |
| Things they can't change (renting: no built-ins, no wall paint) | Not in photos | ask once, then filter `features.allow` and `wall_treatment` |
| Pets, kids, durability | Not in photos | affects `fabric` (no bouclé or velvet with cats), rug pile, glass tables |
| What they already own and are keeping | Not in photos | locks those pieces. Their form dials then pull the others. |
| Colours they hate | Moodboards show likes, not dislikes | none |
| Needs and zones (WFH, reading, guests) | Already an input (`needs`) | none |
| Budget | Out of scope here (matching layer) | none |

A good default UI: show the 6–8 most visible dials as sliders after the AI reads the moodboard (warm↔cool, light↔dark, calm↔colourful, straight↔curvy, leggy↔grounded, bare↔layered, raw↔polished, plants), and ask the ●○○ questions as two or three quick choices.

---

## 6. From dials to the generator

How the dials resolve into today's `DEFAULT_PROFILE` fields in `design_logic.py`, and what's new:

| Profile field today | Comes from |
|---|---|
| `palette.dominant/secondary/accent` | `colour_roles`. If missing, generate from `palette_temperature`, `palette_value`, `palette_saturation`, `hue_spread`, `value_contrast`. |
| `R["split"]` targets | Stay rules. `accent_share` can only move the accent target within ±`split_tol`. |
| `shape_family` (`retro`, `modern`, `garden`) | Becomes a *derived* label for the Blender builders until they read form dials directly: high `curvature` + `modularity` → `retro`. Low `curvature` + high `leg_lift` + low `ornament` → `modern`. High `natural_materials` + `plant_amount` → `garden`. |
| `materials.wood`, `wood_light` | `wood_tone` (and its partner tone) |
| `materials.metal` | `metal_finish` |
| `materials.fabric` | `fabric[0]`, filtered by the pets answer |
| `materials.floor`, `curtain` | `wood_tone` / `palette`, and `window_treatment` + `colour_roles` |
| `styling_density` (sparse / balanced / layered) | `styling_density` < .4 → sparse, < .7 → balanced, else layered |
| `plant_count` | `round(plant_amount × 8)`, capped by floor space |
| `art.content`, `art.arrangement` | `art_content`, `art_arrangement` |
| `light_warmth_k` | same |
| `features.allow/prefer/max` | `architectural_detail` (sets `max`: 0 → 0, 1 → 3), `zone_definition` (prefers `platform`, `half_wall`), `rawness` (prefers `ceiling_beam`, exposed brick), `wall_treatment` (`wainscoting`, `feature_wall`). Filtered by the renter answer. |
| `fillers` | `negative_space` (how many) and `grouping` (plant_group vs single plants) |
| `taste.statement_piece` | `statement_strength` > .5 → pick the boldest-colour large piece. Otherwise none. |

New hooks that `design_logic.py` doesn't have yet:
- **Furniture generators** read `curvature`, `line_direction`, `leg_lift`, `leg_style`, `mass`, `arm_style`, `ornament` and `modularity` as continuous parameters (corner radius, leg height and taper, cushion thickness, arm profile), not one builder per family.
- **Material shader:** `sheen` → roughness, `texture` → bump or noise strength, `rawness` → colour variation and edge wear.
- **Layout scoring:**
  - `furniture_float` rewards floor space behind the sofa when the room allows it.
  - `grouping` rewards clusters (e.g. plants in 2–3 groups, not one per wall).
  - `symmetry` rewards pairs either side of the focal centre line.
  - Seats should **face the focal point**.
  These address the current render, where the sofa faces an empty floor, everything lines the walls and plants are one per wall.
- **Lighting:** `light_level` → world and ambient strength, `light_drama` → accent vs ambient ratio (designers use about 3× on a focal object), `light_layers` → which lamp items to add.

---

## 7. Draft JSON schema

A style profile = dials + where each value came from. Values are optional: anything missing falls back to the generator default. `meta` per dial carries confidence and source so the UI knows what to ask.

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "$id": "https://heyjenna.app/schemas/style-profile.json",
  "title": "hey jenna style profile",
  "type": "object",
  "$defs": {
    "unit": { "type": "number", "minimum": 0, "maximum": 1 },
    "hex": { "type": "string", "pattern": "^#[0-9A-Fa-f]{6}$" },
    "meta": {
      "type": "object",
      "properties": {
        "confidence": { "$ref": "#/$defs/unit" },
        "spread": { "$ref": "#/$defs/unit", "description": "disagreement across moodboard images" },
        "source": { "enum": ["ai", "user", "default", "derived"] }
      }
    }
  },
  "properties": {
    "name": { "type": "string" },
    "source": { "type": "string", "description": "e.g. 'moodboard: 8 images, 2026-11-10'" },
    "nearest_styles": {
      "type": "array",
      "description": "for display only; never drives the generator",
      "items": {
        "type": "object",
        "properties": { "style": { "type": "string" }, "weight": { "$ref": "#/$defs/unit" } }
      }
    },
    "era_hints": {
      "type": "array",
      "items": { "enum": ["1930s", "1950s", "1960s", "1970s", "1980s", "contemporary"] }
    },

    "colour": {
      "type": "object",
      "properties": {
        "roles": {
          "type": "object",
          "properties": {
            "dominant":  { "type": "array", "items": { "$ref": "#/$defs/hex" } },
            "secondary": { "type": "array", "items": { "$ref": "#/$defs/hex" } },
            "accent":    { "type": "array", "items": { "$ref": "#/$defs/hex" } }
          }
        },
        "palette_temperature": { "$ref": "#/$defs/unit" },
        "palette_value":       { "$ref": "#/$defs/unit" },
        "palette_saturation":  { "$ref": "#/$defs/unit" },
        "value_contrast":      { "$ref": "#/$defs/unit" },
        "hue_spread":          { "$ref": "#/$defs/unit" },
        "accent_share":        { "type": "number", "minimum": 0.05, "maximum": 0.25 },
        "wall_treatment": { "enum": ["plain_paint", "colour_drenched", "two_tone", "limewash_plaster", "wallpaper", "panelling", "exposed_brick", "concrete", "tile"] }
      }
    },

    "form": {
      "type": "object",
      "properties": {
        "curvature":      { "$ref": "#/$defs/unit" },
        "line_direction": { "$ref": "#/$defs/unit" },
        "leg_lift":       { "$ref": "#/$defs/unit" },
        "leg_style": { "enum": ["tapered_splayed", "straight_square", "turned", "cabriole", "hairpin", "tubular_chrome", "sled_frame", "block", "bun", "plinth", "none"] },
        "mass":           { "$ref": "#/$defs/unit" },
        "arm_style": { "enum": ["none", "track", "slope", "rolled", "flared", "rounded_wrap", "wood_frame"] },
        "ornament":       { "$ref": "#/$defs/unit" },
        "modularity":     { "$ref": "#/$defs/unit" }
      }
    },

    "materials": {
      "type": "object",
      "properties": {
        "wood_tone":   { "$ref": "#/$defs/unit" },
        "wood_amount": { "$ref": "#/$defs/unit" },
        "metal_finish": { "enum": ["none", "black_iron", "chrome", "brushed_steel", "brass", "bronze_copper", "white_powder"] },
        "metal_amount": { "$ref": "#/$defs/unit" },
        "sheen":        { "$ref": "#/$defs/unit" },
        "texture":      { "$ref": "#/$defs/unit" },
        "rawness":      { "$ref": "#/$defs/unit" },
        "natural_materials": { "$ref": "#/$defs/unit" },
        "fabric": {
          "type": "array",
          "items": { "enum": ["linen", "cotton", "boucle", "velvet", "leather", "wool", "corduroy", "shag", "sheepskin"] }
        }
      }
    },

    "pattern": {
      "type": "object",
      "properties": {
        "amount": { "$ref": "#/$defs/unit" },
        "scale":  { "$ref": "#/$defs/unit" },
        "motif": {
          "type": "array",
          "items": { "enum": ["stripe", "check", "geometric", "organic_abstract", "floral_botanical", "handmade_global", "damask_traditional", "none"] }
        }
      }
    },

    "composition": {
      "type": "object",
      "properties": {
        "symmetry":           { "$ref": "#/$defs/unit" },
        "repetition":         { "$ref": "#/$defs/unit" },
        "statement_strength": { "$ref": "#/$defs/unit" },
        "eclecticism":        { "$ref": "#/$defs/unit" },
        "furniture_scale":    { "$ref": "#/$defs/unit" }
      }
    },

    "space": {
      "type": "object",
      "properties": {
        "negative_space":  { "$ref": "#/$defs/unit" },
        "furniture_float": { "$ref": "#/$defs/unit" },
        "grouping":        { "$ref": "#/$defs/unit" },
        "focal_point": { "enum": ["window_view", "fireplace", "feature_wall", "art", "tv", "statement_furniture", "shelving"] },
        "zone_definition":      { "$ref": "#/$defs/unit" },
        "architectural_detail": { "$ref": "#/$defs/unit" }
      }
    },

    "styling": {
      "type": "object",
      "properties": {
        "density":        { "$ref": "#/$defs/unit" },
        "order":          { "$ref": "#/$defs/unit" },
        "textile_layers": { "$ref": "#/$defs/unit" },
        "books_and_objects": { "$ref": "#/$defs/unit" }
      }
    },

    "soft_art_plants": {
      "type": "object",
      "properties": {
        "rug_type":  { "enum": ["none", "flatweave_solid", "jute_sisal", "shag", "persian_vintage", "geometric", "kilim_handmade", "sheepskin"] },
        "rug_shape": { "enum": ["rect", "round", "organic"] },
        "window_treatment": { "enum": ["none", "sheer", "linen_drape", "heavy_drape", "roman_blind", "venetian", "shutters", "bead_or_fringe"] },
        "art_amount": { "$ref": "#/$defs/unit" },
        "art_arrangement": { "enum": ["single_statement", "pair", "grid", "salon", "ledge_leaning"] },
        "art_content": {
          "type": "array",
          "items": { "enum": ["abstract_colour", "line_drawing", "botanical", "photography", "graphic_poster", "landscape", "classical_portrait", "textile_hanging", "mirror"] }
        },
        "plant_amount": { "$ref": "#/$defs/unit" },
        "plant_kind": {
          "type": "array",
          "items": { "enum": ["sculptural_single", "trailing", "palms", "cacti_succulents", "branches_ikebana", "bushy_mixed"] }
        }
      }
    },

    "lighting": {
      "type": "object",
      "properties": {
        "warmth_k": { "type": "integer", "minimum": 2200, "maximum": 4000 },
        "level":    { "$ref": "#/$defs/unit" },
        "drama":    { "$ref": "#/$defs/unit" },
        "layers": {
          "type": "array",
          "items": { "enum": ["ambient_ceiling", "pendant", "floor_lamp", "table_lamp", "wall_sconce", "picture_light", "led_strip", "candles"] }
        },
        "fixture_style": { "enum": ["paper_lantern", "globe_opal", "mushroom", "arc", "cage_edison", "pleated_fringed", "brass_geometric", "minimal_tube"] }
      }
    },

    "user_constraints": {
      "type": "object",
      "description": "answers the AI cannot read from images (section 5)",
      "properties": {
        "has_tv": { "type": "boolean" },
        "renting": { "type": "boolean", "description": "true filters out built-in features and wall paint" },
        "pets": { "type": "array", "items": { "enum": ["cat", "dog", "other"] } },
        "kids": { "type": "boolean" },
        "keep_items": { "type": "array", "items": { "type": "string" } },
        "avoid_colours": { "type": "array", "items": { "$ref": "#/$defs/hex" } }
      }
    },

    "meta": {
      "type": "object",
      "description": "per-dial confidence, keyed by dotted path, e.g. 'form.curvature'",
      "additionalProperties": { "$ref": "#/$defs/meta" }
    }
  }
}
```

**Example**: a moodboard between mid-century and 70s, close to today's `retro.json`, shortened:

```json
{
  "name": "warm retro",
  "nearest_styles": [{ "style": "1970s", "weight": 0.55 }, { "style": "mid-century", "weight": 0.45 }],
  "colour": {
    "roles": { "dominant": ["#F1E7DA", "#CBC3B7"], "secondary": ["#2F6E3E", "#B9733A"], "accent": ["#D6483C", "#2E4FC4", "#E9A23B"] },
    "palette_temperature": 0.75, "palette_value": 0.55, "palette_saturation": 0.6, "value_contrast": 0.45, "hue_spread": 0.7,
    "wall_treatment": "exposed_brick"
  },
  "form": { "curvature": 0.7, "line_direction": 0.8, "leg_lift": 0.45, "leg_style": "tubular_chrome", "mass": 0.6, "arm_style": "rounded_wrap", "ornament": 0.1, "modularity": 0.75 },
  "materials": { "wood_tone": 0.65, "metal_finish": "chrome", "sheen": 0.35, "texture": 0.65, "rawness": 0.3, "fabric": ["boucle", "corduroy"] },
  "space": { "negative_space": 0.45, "furniture_float": 0.7, "grouping": 0.75, "focal_point": "window_view" },
  "styling": { "density": 0.55, "order": 0.55 },
  "soft_art_plants": { "art_arrangement": "grid", "art_content": ["abstract_colour"], "plant_amount": 0.5 },
  "lighting": { "warmth_k": 2700, "level": 0.5 },
  "meta": {
    "lighting.warmth_k": { "confidence": 0.3, "source": "default" },
    "space.focal_point": { "confidence": 0.4, "source": "ai" },
    "form.leg_style": { "confidence": 0.55, "spread": 0.4, "source": "ai" }
  }
}
```

---

## 8. Sources and caveats

The sources are linked inline. They cover design-school teaching material ([Benha University](https://beng.stafpu.bu.edu.eg/Architectural%20Engineering/5648/crs-14382/Files/Elements%20of%20Interior%20Design.pdf), [VDCI](https://vdci.edu/learn/interior-design/design-principles-harmony-scale-proportion-balance-rhythm)), colour science ([Munsell](https://en.wikipedia.org/wiki/Munsell_color_system)), a research report on biophilic design ([Terrapin Bright Green](https://www.terrapinbrightgreen.com/reports/14-patterns/)), computer-vision papers ([MMIS](https://arxiv.org/abs/2407.05980), [arXiv 2010.10557](https://arxiv.org/abs/2010.10557)), and established design publications and trade guides (Houzz, Livingetc, Homes & Gardens, Apartment Therapy, MasterClass, Galerie, Chairish).

Caveats:
- **Style definitions come mostly from publications and trade guides, not textbooks.** I couldn't read standard textbooks such as Ching's *Interior Design Illustrated* online. The elements and principles above match what design schools teach, but the exact list of principles varies by author.
- **The numbers in section 4 are my synthesis**, read from the sources' descriptions, not measured values. Calibrate them by having the vision model score 20–30 labelled reference photos per style and replacing the numbers with its medians.
- **Lighting ratios** (the ~3× accent level) come from course material, not a lighting standard. Fine for a stylized render, not for specifying real fixtures.
- **Clearances** (90 cm walkways, 35–45 cm sofa to table) are designer rules of thumb, not building codes. They already live in `design_logic.py`'s `R` table and the dials never change them.
