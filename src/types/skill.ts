// 与 src-tauri/src/skills.rs 的 SkillDescriptor 对应(serde camelCase)。

export type SkillStatus = "stable" | "beta" | "draft";
export type FormCapability = "axes" | "manifestNoAxes" | "proseOnly";

export interface Axis {
  name: string;
  values: string[];
  multi: boolean;
  blockingGate: boolean;
  defaultValue?: string | null;
}

export interface OnDemandRef {
  condition: string;
  path: string;
}

export interface SkillDescriptor {
  id: string;
  name: string;
  description: string;
  status: SkillStatus;
  version?: string | null;
  formCapability: FormCapability;
  hasManifest: boolean;
  alwaysLoad: string[];
  axes: Axis[];
  onDemand: OnDemandRef[];
  dir: string;
}
