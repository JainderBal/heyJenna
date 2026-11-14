/** Rules for 3D models we fetch for the UI; the same as the render worker's (workers/render/worker.py). */
export const MAX_MODEL_BYTES = 40 * 1024 * 1024;

export class BadModelError extends Error {}

/** https, an allowed host, no credentials. Returns the normalised URL. */
export function checkModelUrl(raw: string, hosts: string[]): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BadModelError('Not a valid URL');
  }
  if (url.protocol !== 'https:') throw new BadModelError('Model URLs must be https');
  if (url.username || url.password) throw new BadModelError('Model URLs must not carry credentials');
  if (!hosts.includes(url.hostname.toLowerCase())) throw new BadModelError(`Models are only fetched from ${hosts.join(', ')}`);
  return url;
}

/** A binary glTF file under the size limit. */
export function checkGlb(data: Buffer, maxBytes = MAX_MODEL_BYTES): Buffer {
  if (data.length > maxBytes) throw new BadModelError('Model is too large');
  if (data.length < 12 || data.subarray(0, 4).toString('latin1') !== 'glTF') throw new BadModelError('Not a .glb (binary glTF) file');
  return data;
}
