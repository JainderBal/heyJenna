import Anthropic from '@anthropic-ai/sdk';
import { RoomKind } from '@hey-jenna/contracts';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import sharp from 'sharp';
import * as z from 'zod/v4';

const WallEnum = z.enum(['back', 'front', 'left', 'right']);

const OpeningSchema = z.object({
  wall: WallEnum.describe('back = top of the room as drawn, front = bottom, left, right'),
  position: z.number().describe('centre of the opening along that wall, metres from the wall start (left end for back/front, back end for left/right)'),
  width: z.number().describe('opening width in metres'),
});

const BoxSchema = z.object({
  left: z.number(),
  top: z.number(),
  right: z.number(),
  bottom: z.number(),
});

export const PlanReadingSchema = z.object({
  scaleSource: z.enum(['printed', 'door', 'guess']).describe('printed = dimensions written on the plan; door = scaled from a door ≈ 0.9 m wide; guess = neither'),
  rooms: z.array(
    z.object({
      name: z.string().describe('room label as printed, in its own language (e.g. "Chambre 1"), or a short name like "Bedroom 2"'),
      kind: z.enum(RoomKind.options).describe('walk-in / dressing = closet; rangement = storage; salle de lavage = laundry; balcon / terrace = balcony'),
      printedSize: z.string().nullable().describe('the size label exactly as printed, e.g. "10\'11\" x 13\'4\"" or "3.2 x 4.1 m"; null when none is printed'),
      width: z.number().describe('left-to-right size in metres'),
      depth: z.number().describe('top-to-bottom size in metres'),
      x: z.number().describe('left edge of the room in the whole plan, metres from the plan left'),
      y: z.number().describe('top edge of the room in the whole plan, metres from the plan top'),
      box: BoxSchema.describe('the room on the image as fractions of the image size (0..1): left, top, right, bottom'),
      openWalls: z.array(WallEnum).describe('sides with no wall, where the room runs straight into a neighbouring room (open-plan)'),
      windows: z.array(OpeningSchema),
      doors: z.array(OpeningSchema),
      confidence: z.number().describe('0..1, how sure you are of this room and its size'),
    }),
  ),
  notes: z.array(z.string()).describe('short caveats, e.g. "no dimensions printed, scaled from the entry door"'),
});
export type PlanReading = z.infer<typeof PlanReadingSchema>;

export interface FloorPlanReader {
  read(image: Buffer): Promise<PlanReading>;
}
/** Null when ANTHROPIC_API_KEY is missing: no fake detection. */
export const FLOOR_PLAN_READER = Symbol('FLOOR_PLAN_READER');

/** Throws when Claude's reply is not a usable plan. */
class FloorPlanReadError extends Error {}

const SYSTEM = `You are an architect reading a photo or scan of a residential floor plan.
Find every room and space, including closets, walk-ins, storage, laundry and balconies, and measure it in metres.
Use the printed dimensions when present (convert feet/inches to metres) and copy the label as printed into printedSize.
Printed sizes do not say which number is the width: match them to the room's shape as drawn.
If none are printed, scale from a door, taking a standard door as 0.9 m wide, and set scaleSource to "door".
Orient every room as drawn: back = top of the image, front = bottom. Include windows and doors on each room's walls.
When rooms share one open space with no wall between them (e.g. kitchen, dining and living), list each as its own room
and mark the shared sides in openWalls. Give each room's box on the image as fractions of the image width and height.`;

type ParseClient = { beta: { messages: { parse: (args: never) => Promise<{ stop_reason: string | null; parsed_output: unknown }> } } };

/** Reads a floor plan with Claude vision; the reply is schema-checked. */
export class ClaudeFloorPlanReader implements FloorPlanReader {
  private readonly client: ParseClient;

  constructor(apiKey: string, private readonly model: string, client?: ParseClient) {
    this.client = client ?? (new Anthropic({ apiKey }) as unknown as ParseClient);
  }

  async read(image: Buffer): Promise<PlanReading> {
    const jpeg = await sharp(image).rotate().resize(1568, 1568, { fit: 'inside', withoutEnlargement: true }).jpeg({ quality: 85 }).toBuffer();
    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(PlanReadingSchema) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: jpeg.toString('base64') } },
            { type: 'text', text: 'List every room in this floor plan with its size, position, windows and doors.' },
          ],
        },
      ],
    } as never);

    if (response.stop_reason === 'refusal') throw new FloorPlanReadError('Claude declined to read this floor plan');
    const checked = PlanReadingSchema.safeParse(response.parsed_output);
    if (!checked.success) throw new FloorPlanReadError(`Unusable reply from Claude (stop_reason: ${response.stop_reason})`);
    return checked.data;
  }
}
