/**
 * Real product models (IKEA GLBs) for the room viewer. The API serves them at
 * GET /rooms/:roomId/listings/:listingId/model behind the dev login header, so they are fetched
 * like src/api/client.ts does (x-dev-user) as an ArrayBuffer and handed to GLTFLoader.parse.
 *
 * Bytes are cached per listing for the session (no GPU memory); each viewer parses a listing once
 * and clones it for every object that uses it, and disposes its parsed copies on unmount.
 */
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { ApiError, apiUrl, devUser } from '../api/client';
import { disposeTree as disposeModel } from './three-kit';

const BYTES = new Map<string, Promise<ArrayBuffer>>();

export function modelPath(roomId: string, listingId: string) {
  return `/rooms/${roomId}/listings/${listingId}/model`;
}

function bytes(roomId: string, listingId: string): Promise<ArrayBuffer> {
  const key = `${roomId}/${listingId}`;
  let p = BYTES.get(key);
  if (!p) {
    p = fetch(apiUrl(modelPath(roomId, listingId)), { headers: { 'x-dev-user': devUser() } }).then((res) => {
      if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
      return res.arrayBuffer();
    });
    p.catch(() => BYTES.delete(key)); // let a later viewer try again
    BYTES.set(key, p);
  }
  return p;
}

/** One viewer's parsed models: listingId → template scene. */
export class ModelCache {
  private parsed = new Map<string, Promise<THREE.Object3D>>();
  private loader = new GLTFLoader();
  private disposed = false;

  constructor(private roomId: string) {}

  /** A fresh clone of the listing's model (shares geometry and materials with the template). */
  async get(listingId: string): Promise<THREE.Object3D> {
    let p = this.parsed.get(listingId);
    if (!p) {
      p = bytes(this.roomId, listingId)
        .then((buf) => this.loader.parseAsync(buf, ''))
        .then((gltf) => {
          const root = gltf.scene;
          root.traverse((o) => {
            if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
          });
          if (this.disposed) disposeModel(root);
          return root;
        });
      p.catch(() => this.parsed.delete(listingId));
      this.parsed.set(listingId, p);
    }
    const tpl = await p;
    if (this.disposed) throw new Error('viewer closed');
    return tpl.clone(true);
  }

  dispose() {
    this.disposed = true;
    for (const p of this.parsed.values()) p.then(disposeModel, () => undefined);
    this.parsed.clear();
  }
}
