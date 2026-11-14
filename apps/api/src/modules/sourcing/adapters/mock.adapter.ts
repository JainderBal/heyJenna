import { Injectable } from '@nestjs/common';
import { FurnitureType } from '@hey-jenna/contracts';
import { RawListing, SourceAdapter, SourceQuery } from './source.adapter';

type Fixture = [FurnitureType, string, number, 'new' | 'used'];

/**
 * Fake products so the whole flow works with no API keys (development + tests).
 * URLs point at example.com and are clearly not real listings.
 */
const FIXTURES: Fixture[] = [
  ['sofa', 'Vintage 70s rust velvet 3 seat sofa 84"W x 36"D x 31"H', 650, 'used'],
  ['sofa', 'Mid century teak frame sofa, mustard wool, 200 x 85 x 78 cm', 890, 'used'],
  ['sofa', 'Modern grey linen sofa, scandinavian, 210 x 92 x 80 cm', 1199, 'new'],
  ['sofa', 'Cream boucle modular sofa 220 x 95 x 70 cm', 1499, 'new'],
  ['sofa', 'Green velvet chesterfield sofa', 720, 'used'],
  ['armchair', 'Retro orange lounge chair, chrome base 78 x 82 x 88 cm', 280, 'used'],
  ['armchair', 'Cream boucle accent chair 75 x 80 x 78 cm', 349, 'new'],
  ['armchair', 'Rattan peacock armchair, natural', 220, 'used'],
  ['armchair', 'Black leather club chair 85 x 90 x 80 cm', 400, 'used'],
  ['coffee_table', 'Mid century teak oval coffee table 120 x 60 x 42 cm', 180, 'used'],
  ['coffee_table', 'Round white tulip coffee table 90 x 90 x 41 cm', 260, 'new'],
  ['coffee_table', 'Smoked glass chrome coffee table, retro', 150, 'used'],
  ['coffee_table', 'Light oak scandinavian coffee table 110 x 55 x 40 cm', 199, 'new'],
  ['side_table', 'Red retro drum side table 45 x 45 x 55 cm', 60, 'used'],
  ['side_table', 'Rattan side table, natural', 75, 'new'],
  ['side_table', 'Walnut mid century end table', 95, 'used'],
  ['rug', 'Vintage orange and cream wool rug 160x230 cm', 210, 'used'],
  ['rug', 'Beni ourain cream shag rug 5x8', 340, 'new'],
  ['rug', 'Jute natural flatweave rug 200 x 300 cm', 180, 'new'],
  ['rug', 'Green and mustard 70s pattern rug 6x9', 260, 'used'],
  ['floor_lamp', 'Retro chrome arc floor lamp with white globe', 140, 'used'],
  ['floor_lamp', 'Pink globe pole floor lamp, 70s', 90, 'used'],
  ['floor_lamp', 'Black steel minimalist floor lamp 160 cm', 79, 'new'],
  ['table_lamp', 'Orange mushroom table lamp, vintage', 55, 'used'],
  ['table_lamp', 'Brass desk lamp, adjustable', 70, 'new'],
  ['ceiling_light', 'Opal glass globe pendant light 40 cm', 85, 'new'],
  ['ceiling_light', 'Rattan pendant shade, natural', 60, 'new'],
  ['shelf', 'Teak wall bookshelf, mid century, 90 x 30 x 180 cm', 240, 'used'],
  ['shelf', 'White KALLAX style shelf unit 77 x 39 x 147 cm', 89, 'new'],
  ['shelf', 'Chrome and glass etagere, retro', 160, 'used'],
  ['desk', 'Mid century teak writing desk 120 x 60 x 75 cm', 220, 'used'],
  ['desk', 'White oak desk scandinavian 140 x 70 x 74 cm', 329, 'new'],
  ['desk_chair', 'Vintage orange swivel desk chair, chrome', 110, 'used'],
  ['desk_chair', 'Black ergonomic office chair', 180, 'new'],
  ['sideboard', 'Danish teak sideboard credenza 160 x 45 x 75 cm', 520, 'used'],
  ['sideboard', 'White lacquer media console 180 x 40 x 50 cm', 299, 'new'],
  ['pouf', 'Moroccan leather pouf, tan', 65, 'new'],
  ['pouf', 'Mustard velvet ottoman, round', 85, 'used'],
  ['cat_tree', 'Modern wood cat tree with window perch 50 x 50 x 120 cm', 120, 'new'],
  ['plant', 'Fiddle leaf fig plant, 120 cm, with pot', 45, 'new'],
  ['plant', 'Monstera plant in terracotta pot', 35, 'new'],
  ['plant', 'Snake plant, 80 cm', 25, 'new'],
  ['plant', 'Parlour palm, 70 cm', 30, 'new'],
  ['art', 'Abstract colour block print, orange and blue, framed 70 x 100 cm', 85, 'new'],
  ['art', 'Vintage botanical poster set, framed', 60, 'used'],
];

@Injectable()
export class MockAdapter implements SourceAdapter {
  readonly name = 'mock';
  enabled() {
    return true;
  }
  async search(q: SourceQuery): Promise<RawListing[]> {
    return FIXTURES.map((f, i) => ({ f, i }))
      .filter(({ f }) => f[0] === q.type)
      .slice(0, q.limit)
      .map(({ f: [, title, price, condition], i }) => ({
        source: 'mock',
        externalId: `mock-${i}`,
        url: `https://example.com/mock/listing-${i}`,
        title,
        price,
        currency: 'CAD',
        imageUrl: null,
        condition,
        location: 'Toronto, ON',
      }));
  }
}
