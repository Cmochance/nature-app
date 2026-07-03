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
  /** 使用兼容旧版解析策略(对应 Codex < 0.145 输出格式)。 */
  useLegacyParser?: boolean;
}

export interface Usage {
  input_tokens: number;
  cached_input_tokens: number;
  output_tokens: number;
  reasoning_output_tokens: number;
}

/** 轻量语义版本号。 */
export interface SemVer {
  major: number;
  minor: number;
  patch: number;
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
      /** 错误是否可自动重试(网络超时/API限流等)。 */
      canRetry: boolean;
    };

export interface EngineStatus {
  bin: string;
  version?: string | null;
  /** 解析后的语义版本号。 */
  semver?: SemVer | null;
  /** 是否需要使用兼容旧版解析策略。 */
  needsLegacyParsing: boolean;
  loggedIn: boolean;
}

export interface PyEnvStatus {
  uv?: string | null;
  ready: boolean;
  venv: string;
  python?: string | null;
  /** 在 uv venv 中能否导入 matplotlib。 */
  matplotlib_ok: boolean;
  /** 在 uv venv 中能否导入 seaborn。 */
  seaborn_ok: boolean;
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

export type LoginEvent =
  | { type: "url"; data: string }
  | { type: "message"; data: string }
  | { type: "done"; data: { ok: boolean; error?: string | null } };
