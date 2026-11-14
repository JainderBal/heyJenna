import { Injectable, Logger } from '@nestjs/common';
import { execFile } from 'child_process';
import { mkdtemp, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join, resolve } from 'path';
import { promisify } from 'util';
import { AppConfig } from '../../../common/config/app-config.service';
import { EngineResult, EngineSpec, LayoutEngine } from './layout-engine';

const run = promisify(execFile);

/** engines/layout/design_logic.py, found from the repo root whether we run from src or dist. */
export const ENGINE_SCRIPT = resolve(__dirname, '../../../../../../engines/layout/design_logic.py');

export class EngineFailedError extends Error {}

/** Runs the Python design engine as a child process: spec.json in, layout.json out. */
@Injectable()
export class PythonLayoutEngine implements LayoutEngine {
  private readonly log = new Logger(PythonLayoutEngine.name);

  constructor(private readonly config: AppConfig) {}

  async run(spec: EngineSpec): Promise<EngineResult> {
    const dir = await mkdtemp(join(tmpdir(), 'hj-layout-'));
    const input = join(dir, 'spec.json');
    const output = join(dir, 'layout.json');
    try {
      await writeFile(input, JSON.stringify(spec));
      const started = Date.now();
      await run(this.config.get('PYTHON_BIN'), [ENGINE_SCRIPT, input, '-o', output], { timeout: 60_000, maxBuffer: 4 * 1024 * 1024 });
      this.log.log(`engine placed ${spec.furniture.length} items in ${Date.now() - started} ms`);
      return JSON.parse(await readFile(output, 'utf8')) as EngineResult;
    } catch (e) {
      const err = e as { stderr?: string; message: string };
      const last = (err.stderr ?? '').trim().split('\n').pop();
      throw new EngineFailedError(last || err.message);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  }
}
