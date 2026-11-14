/**
 * Read a floor-plan image with Claude and print the normalised preview, to check the reader by hand.
 *   npx ts-node --transpile-only scripts/read-plan.ts test/fixtures/floor-plans/condo-2br-fr.png [model]
 * Reads ANTHROPIC_API_KEY (and ANTHROPIC_MODEL when no model is given) from apps/api/.env.
 */
import { readFileSync } from 'fs';
import { config } from 'dotenv';
import { ClaudeFloorPlanReader } from '../src/modules/projects/floor-plan/floor-plan.reader';
import { normalisePlan } from '../src/modules/projects/floor-plan/normalise';

config();

async function main() {
  const [file, modelArg] = process.argv.slice(2);
  if (!file) throw new Error('usage: read-plan.ts <image> [model]');
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not set in apps/api/.env');
  const model = modelArg || process.env.ANTHROPIC_MODEL || 'claude-opus-5-5';

  const started = Date.now();
  const reading = await new ClaudeFloorPlanReader(key, model).read(readFileSync(file));
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  console.log(JSON.stringify({ model, seconds, reading, preview: normalisePlan(reading) }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
