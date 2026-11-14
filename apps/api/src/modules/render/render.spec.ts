import { DIAL_DEFAULTS } from '@hey-jenna/contracts';
import { RenderService } from './render.service';
import { RENDER_DIAL_KEYS } from './render-dials';

const job = { id: 'j1', roomId: 'r1', layoutId: 'l1', status: 'running', attempts: 1, imageKey: null, modelKey: null, error: null, createdAt: new Date(), updatedAt: new Date() };

function service(profile: unknown) {
  const repo = { claimNext: jest.fn(async () => job) };
  const layouts = { getDataForWorker: jest.fn(async () => ({ objects: [] })) };
  const style = { getProfile: jest.fn(async () => profile) };
  const events = { publish: jest.fn() };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new RenderService(repo as any, {} as any, layouts as any, style as any, {} as any, events as any);
}

describe('RenderService claim', () => {
  it('carries the materials and lighting dials in the job payload', async () => {
    const dials = { ...DIAL_DEFAULTS, sheen: 0.9, light_drama: 0.8, light_layers: ['candles'] as typeof DIAL_DEFAULTS.light_layers };
    const claimed = await service({ dials }).claim('w1');
    expect(Object.keys(claimed!.dials!).sort()).toEqual([...RENDER_DIAL_KEYS].sort());
    expect(claimed!.dials).toMatchObject({ sheen: 0.9, light_drama: 0.8, light_layers: ['candles'] });
  });

  it('sends dials: null when the room has no moodboard yet', async () => {
    expect((await service(null).claim('w1'))!.dials).toBeNull();
  });
});
