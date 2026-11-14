import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { Logger } from '@nestjs/common';
import sharp from 'sharp';
import * as z from 'zod/v4';
import { nearestColourName } from './colour-names';
import { PaletteResult } from './palette';
import { Vibe, VibeReader } from './vibe';

const VibeSchema = z.object({
  name: z.string().describe('2-4 word name for the style, e.g. "70s motel lounge"'),
  vibe: z.array(z.string()).describe('4-8 short mood tags'),
  keywords: z.array(z.string()).describe('4-8 words a person would type into IKEA to find matching furniture: eras, styles, materials, finishes'),
  shapeFamily: z.enum(['retro', 'modern', 'garden']).describe('retro = rounded 60s-70s forms; modern = clean straight lines; garden = natural, rattan, plants'),
  woodHex: z.string().describe('the main wood tone seen, as #RRGGBB, or "" if none'),
  metal: z.string().describe('main metal finish, e.g. chrome, brass, black steel, or "" if none'),
  fabric: z.string().describe('main upholstery fabric, e.g. boucle, velvet, linen, leather'),
  stylingDensity: z.enum(['sparse', 'balanced', 'layered']).describe('how full of objects, plants and textiles the rooms are'),
});

const SYSTEM = `You are an interior designer reading a client's moodboard.
Describe the style so a search engine can find real, buyable furniture that matches it.
Prefer concrete shop words (materials, eras, named styles) over abstract mood words in "keywords".`;

/** Reads the moodboard with Claude vision. The answer is schema-checked JSON. */
export class ClaudeVibeReader implements VibeReader {
  private readonly log = new Logger(ClaudeVibeReader.name);
  private readonly client: Anthropic;

  constructor(apiKey: string, private readonly model: string) {
    this.client = new Anthropic({ apiKey });
  }

  async read(images: Buffer[], palette: PaletteResult): Promise<Vibe> {
    // Shrink to ≤1024 px JPEG: enough detail for style, far fewer tokens
    const jpegs = await Promise.all(
      images.slice(0, 6).map((img) => sharp(img).rotate().resize(1024, 1024, { fit: 'inside' }).jpeg({ quality: 82 }).toBuffer()),
    );
    const colours = [...palette.dominant, ...palette.secondary, ...palette.accent]
      .map((h) => `${h} (${nearestColourName(h)})`)
      .join(', ');

    const response = await this.client.beta.messages.parse({
      model: this.model,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      output_config: { effort: 'medium', format: betaZodOutputFormat(VibeSchema) },
      system: SYSTEM,
      messages: [
        {
          role: 'user',
          content: [
            ...jpegs.map((data) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: 'image/jpeg' as const, data: data.toString('base64') },
            })),
            { type: 'text', text: `Colours already measured from these images: ${colours}.\nDescribe this moodboard's style.` },
          ],
        },
      ],
    });

    if (response.stop_reason === 'refusal') throw new Error('Claude declined to read this moodboard');
    const out = response.parsed_output;
    if (!out) throw new Error(`No structured answer (stop_reason: ${response.stop_reason})`);
    this.log.log(`moodboard read by ${response.model}: ${out.name}`);

    return {
      name: out.name,
      vibe: out.vibe,
      keywords: out.keywords,
      shapeFamily: out.shapeFamily,
      materials: {
        wood: /^#[0-9A-Fa-f]{6}$/.test(out.woodHex) ? out.woodHex.toUpperCase() : undefined,
        metal: out.metal || undefined,
        fabric: out.fabric || undefined,
      },
      stylingDensity: out.stylingDensity,
      source: 'claude',
    };
  }
}
