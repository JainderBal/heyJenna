/** Input for the design engine (the shape engines/layout/design_logic.py reads). */
export interface EngineSpec {
  room: Record<string, unknown>;
  needs: string[];
  style_profile: Record<string, unknown>;
  furniture: EngineItem[];
}

export interface EngineItem {
  id: string;
  type: string;
  name: string;
  size: { w: number; d: number; h: number };
  colour: string;
  tags?: string[];
  kind?: string;
  on?: string;
  placement?: string;
  hang_height?: number;
  suggested?: boolean;
}

/** One placed thing in the result (plan metres; rotation_deg = which way its front faces). */
export interface EngineObject {
  id: string;
  type: string;
  name: string;
  name_full?: string;
  layer: string;
  zone: string;
  mount: string;
  position: { x: number; y: number; z: number };
  rotation_deg: number;
  size: { w: number; d: number; h: number };
  colour?: string;
  colour_role?: string;
  [extra: string]: unknown;
}

export interface EngineResult {
  objects: EngineObject[];
  checks: { rule: string; status: 'pass' | 'warn' | 'fail'; detail: string }[];
  summary: { pass: number; warn: number; fail: number };
  zones: Record<string, unknown>;
  focal_point: Record<string, unknown>;
  [extra: string]: unknown;
}

/** Anything that turns a spec into a layout. Today: the Python engine. Later maybe a TS port. */
export interface LayoutEngine {
  run(spec: EngineSpec): Promise<EngineResult>;
}

export const LAYOUT_ENGINE = Symbol('LAYOUT_ENGINE');
