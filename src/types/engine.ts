// 与 src-tauri/src/engine.rs 的类型一一对应(serde camelCase)。
// 这是 FE↔RS 的边界契约,改动需同步两侧。

export type SandboxTier = "workspaceWrite" | "dangerFullAccess";

export interface TaskSpec {
  instruction: string;
  workdir: string;
  sandboxTier?: SandboxTier;
  model?: string | null;
  needsNetwork?: boolean;
  stdinContext?: string | null;
}

export interface Usage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
}

// DomainEvent:Rust #[serde(tag="kind", rename_all="camelCase")]
export type DomainEvent =
  | { kind: "started"; taskId: string; argv: string[] }
  | { kind: "threadStarted"; threadId: string }
  | { kind: "turnStarted" }
  | { kind: "reasoning"; text: string }
  | { kind: "assistantMessage"; text: string }
  | { kind: "commandRun"; command: string; status?: string | null }
  | { kind: "artifact"; path: string; changeKind: string }
  | { kind: "plan"; steps: unknown }
  | { kind: "progress"; text: string }
  | { kind: "turnCompleted"; usage: Usage }
  | { kind: "raw"; codexType: string; json: unknown }
  | { kind: "engineError"; class: string; message: string }
  | {
      kind: "finished";
      outcome: string; // success | failure | cancelled
      exitCode?: number | null;
      threadId?: string | null;
      usage: Usage;
      artifactCount: number;
    };

export interface EngineStatus {
  bin: string;
  version?: string | null;
  loggedIn: boolean;
}

export interface PyEnvStatus {
  uv?: string | null;
  ready: boolean;
  venv: string;
  python?: string | null;
}

export interface ToolCheck {
  name: string;
  ok: boolean;
  path?: string | null;
  hint?: string | null;
}

export interface DoctorReport {
  engine: EngineStatus;
  pyenv: PyEnvStatus;
  tools: ToolCheck[];
}
