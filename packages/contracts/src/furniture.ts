import { z } from 'zod';

/** Furniture types the layout engine knows how to place. */
export const FURNITURE_TYPES = [
  'sofa', 'armchair', 'coffee_table', 'side_table', 'shelf', 'desk', 'desk_chair', 'sideboard',
  'pouf', 'cat_tree', 'rug', 'floor_lamp', 'table_lamp', 'ceiling_light', 'plant', 'art', 'mirror', 'wall_shelf',
  // bedrooms, dining rooms, kitchens and halls
  'bed', 'nightstand', 'dresser', 'wardrobe', 'dining_table', 'dining_chair', 'bench',
] as const;
export const FurnitureType = z.enum(FURNITURE_TYPES);
export type FurnitureType = z.infer<typeof FurnitureType>;

/** Size in metres: w = width (along the wall), d = depth, h = height. */
export const Size = z.object({ w: z.number().positive(), d: z.number().positive(), h: z.number().positive() });
export type Size = z.infer<typeof Size>;
