import { glbSize } from './glb-bounds';

/** A minimal GLB: JSON chunk only (bounds live there; no geometry needed). */
function glb(json: object): Buffer {
  let text = JSON.stringify(json);
  while (text.length % 4) text += ' ';
  const body = Buffer.from(text);
  const header = Buffer.alloc(20);
  header.write('glTF', 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(20 + body.length, 8);
  header.writeUInt32LE(body.length, 12); header.write('JSON', 16);
  return Buffer.concat([header, body]);
}

describe('glbSize', () => {
  it('reads the LACK table (one mesh, no transforms)', () => {
    const file = glb({ scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      accessors: [{ min: [-0.275, 0, -0.45], max: [0.275, 0.449, 0.45] }] });
    expect(glbSize(file)).toEqual({ w: 0.9, d: 0.55, h: 0.449 });
  });
  it('combines several meshes and applies node scale/translation', () => {
    const file = glb({ scenes: [{ nodes: [0] }],
      nodes: [{ children: [1, 2], scale: [2, 2, 2] }, { mesh: 0 }, { mesh: 0, translation: [0.5, 0, 0] }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], accessors: [{ min: [0, 0, 0], max: [0.5, 0.4, 0.3] }] });
    expect(glbSize(file)).toEqual({ w: 2, d: 0.6, h: 0.8 });
  });
  it('rejects non-GLB data', () => expect(glbSize(Buffer.from('<html>'))).toBeNull());
});
