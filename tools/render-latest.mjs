#!/usr/bin/env node
// Queues a render of each room's latest layout, runs the worker once per room, and saves the PNGs.
//   node tools/render-latest.mjs <outDir> <roomId> [roomId…]     (API running, AUTH_MODE=dev)
import { execFileSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join } from 'path';

const API = process.env.API_URL ?? 'http://localhost:3000';
const [outDir, ...rooms] = process.argv.slice(2);
for (const room of rooms) {
  const layout = (await (await fetch(`${API}/rooms/${room}/layouts`)).json())[0];
  const job = await (await fetch(`${API}/rooms/${room}/layouts/${layout.id}/renders`, { method: 'POST' })).json();
  execFileSync('python3', ['workers/render/worker.py', '--env-file', 'apps/api/.env', '--once'], { stdio: 'inherit' });
  const status = await (await fetch(`${API}/rooms/${room}/renders/${job.id}`)).json();
  if (status.status !== 'done') {
    console.log(room, 'render', status.status, status.error?.slice(0, 200));
    continue;
  }
  const png = Buffer.from(await (await fetch(`${API}/rooms/${room}/renders/${job.id}/image`)).arrayBuffer());
  const file = join(outDir, `${room}.png`);
  writeFileSync(file, png);
  console.log(room, '→', file);
}
