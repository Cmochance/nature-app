import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n } from "../i18n";
import { skillName } from "../skillsMeta";
import { Icon } from "../icons";

export interface TraceSummaryItem {
  traceId: string;
  taskId: string;
  skillId: string | null;
  skillName: string | null;
  outcome: string;
  startedAt: string; // Unix timestamp string
  artifactCount: number;
}

type DetailMode = { type: "list" } | { type: "detail"; traceId: string };

export default function TraceView() {
  const { t, lang } = useI18n();
  const [traces, setTraces] = useState<TraceSummaryItem[]>([]);
  const [mode, setMode] = useState<DetailMode>({ type: "list" });
  const [eventsRaw, setEventsRaw] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [traceMeta, setTraceMeta] = useState<{ instruction: string; outcome: string; errors: string[] } | null>(null);

  useEffect(() => { fetchTraces(); }, []);

  async function fetchTraces() {
    try {
      const list = await invoke<TraceSummaryItem[]>("list_all_traces", { limit: 50 });
      setTraces(list);
    } catch { /* silent */ }
  }

  async function selectTrace(traceId: string) {
    if ((mode as any).traceId === traceId) return;
    setLoading(true);
    setMode({ type: "detail", traceId });
    try {
      const evts = await invoke<string[]>("get_trace_events", { traceId });
      setEventsRaw(evts);
      // load metadata for instruction text
      const metaPath = `${(await getTracesRoot())}/${traceId}/metadata.json`;
      const raw = await fetch(metaPath)
        .then(r => r.ok ? r.text() : "")
        .catch(() => "");
      if (raw) {
        try {
          const m = JSON.parse(raw) as Pick<TraceSummaryItem, "outcome"> & { instruction: string; errors: string[] };
          setTraceMeta(m);
        } catch { /* ignore */ }
      }
    } catch {
      setEventsRaw([]);
      setTraceMeta(null);
    } finally {
      setLoading(false);
    }
  }

  async function getTracesRoot(): Promise<string> {
    const home = typeof window !== "undefined" ? localStorage.getItem("NATURE_APP_HOME") || "" : "";
    return `${home || "~"}/.nature-app/traces`;
  }

  function formatOutcome(outcome: string): string {
    switch (outcome) {
      case "success": return t("status.ready");
      case "failure": return t("run.cmdFailed");
      case "cancelled": return t("run.cancelled");
      default: return outcome;
    }
  }

  function outcomeEmoji(outcome: string): string {
    switch (outcome) {
      case "success": return "✅";
      case "failure": return "❌";
      case "cancelled": return "⏹️";
      default: return "❓";
    }
  }

  function parseTimestamp(ts: string): string {
    try {
      const secs = parseInt(ts, 10);
      if (!secs || isNaN(secs)) return ts;
      return new Date(secs * 1000).toLocaleString();
    } catch {
      return ts;
    }
  }

  // Compact preview of each event line
  function renderEventPreview(jsonLine: string, index: number) {
    try {
      const ev = JSON.parse(jsonLine);
      const kind = ev.kind || "unknown";
      let preview = `[${kind}]`;
      if (kind === "reasoning" && ev.text) preview += ` ${ev.text.slice(0, 60)}`;
      else if (kind === "commandRun" && ev.command) preview += ` $ ${ev.command.slice(0, 80)}${ev.status ? ` [${ev.status}]` : ""}`;
      else if (kind === "assistantMessage" && ev.text) preview += ` ${ev.text.slice(0, 80)}`;
      else if (kind === "artifact" && ev.path) preview += ` ${ev.path.split("/").pop()}`;
      else if (kind === "engineError") preview += ` ${ev.class}: ${(ev.message ?? "").slice(0, 80)}`;
      else if (kind === "started" && ev.argv) preview += ` ${ev.argv[1]?.slice(0, 60)}`;
      else if (kind === "finished") preview += ` ${ev.outcome}${ev.canRetry ? " (retryable)" : ""}`;

      return (
        <div key={index} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11.5, padding: "1px 0", color: "var(--text)", whiteSpace: "pre-wrap", wordBreak: "break-word" }}>
          {preview}
        </div>
      );
    } catch {
      return <div key={index} style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 10, padding: "1px 0", color: "var(--text-soft)", overflowX: "hidden", textOverflow: "ellipsis" }}>{jsonLine.slice(0, 180)}</div>;
    }
  }

  // ===== Detail mode =====
  if (mode.type === "detail") {
    return (
      <div className="scroll-area" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        {/* Header */}
        <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--border)", display: "flex", alignItems: "center", gap: 8 }}>
          <button className="pick-btn" onClick={() => setMode({ type: "list" })} title={t("common.back")}>
            <Icon name="arrowLeft" />
          </button>
          <span style={{ fontWeight: 600, fontSize: 13 }}>
            {lang === "zh" ? "执行日志 · " : "Log · "}
            {mode.traceId.slice(0, 8)}…
          </span>
          {traceMeta && (
            <>
            <span className="spacer" />
            <span style={{ fontSize: 11, opacity: 0.6, maxWidth: 200, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={traceMeta.instruction}>
              {traceMeta.instruction.slice(0, 100)}…
            </span>
            </>
          )}
        </div>

        {/* Instruction summary */}
        {traceMeta && traceMeta.errors.length > 0 && (
          <details style={{ padding: "8px 14px", background: "var(--warn-soft)", borderBottom: "1px solid var(--warn)", cursor: "pointer" }}>
            <summary style={{ fontSize: 11, color: "var(--warn)" }}>
              {lang === "zh" ? `发现 ${traceMeta.errors.length} 个错误` : `${traceMeta.errors.length} error(s) detected`}
            </summary>
            <ul style={{ margin: "6px 0 0", paddingLeft: 18, fontSize: 11 }}>
              {traceMeta.errors.map((err, i) => <li key={i} style={{ fontFamily: "monospace", color: "var(--warn)" }}>{err}</li>)}
            </ul>
          </details>
        )}

        {/* Events stream */}
        <div style={{ flex: 1, overflowY: "auto", padding: "6px 14px" }}>
          {loading && <div style={{ textAlign: "center", padding: 16, color: "var(--text-soft)" }}>{lang === "zh" ? "加载中…" : "Loading…"}</div>}
          {!loading && eventsRaw.length === 0 && (
            <div style={{ textAlign: "center", padding: 16, color: "var(--text-soft)" }}>{lang === "zh" ? "暂无事件记录" : "No events recorded"}</div>
          )}
          {!loading && eventsRaw.map((line, i) => renderEventPreview(line, i))}
        </div>

        {/* Footer hint */}
        {!loading && eventsRaw.length > 0 && (
          <div style={{ borderTop: "1px solid var(--border)", padding: "6px 14px", fontSize: 10, color: "var(--text-soft)", textAlign: "center" }}>
            {lang === "zh" ? `${eventsRaw.length} 条事件` : `${eventsRaw.length} events`}
          </div>
        )}
      </div>
    );
  }

  // ===== List mode =====
  return (
    <div className="scroll-area">
      <div className="page narrow">
        <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>
          {lang === "zh" ? "审计追踪" : "Audit Traces"}
        </span>
        <h1 className="h-title" style={{ fontSize: 24, margin: "0 0 22px" }}>
          {lang === "zh" ? "执行日志" : "Execution Logs"}
        </h1>

        {traces.length === 0 ? (
          <div style={{ padding: 24, color: "var(--text-soft)", textAlign: "center", lineHeight: 1.6 }}>
            {lang === "zh"
              ? "暂无执行日志。\n完成任务后会自动生成记录。\n每条日志包含完整的输入指令、执行步骤和最终结果。"
              : "No execution logs yet.\nRecords are created automatically after tasks complete.\nEach log contains the full input instruction, execution steps, and final result."}
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {traces.map((trace) => (
              <div
                key={trace.traceId}
                className="clickable"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  padding: "10px 12px",
                  background: "var(--bg-alt)",
                  borderRadius: "var(--radius-xs)",
                  cursor: "pointer",
                  border: "1px solid transparent",
                  transition: "all 0.15s ease",
                }}
                onClick={() => selectTrace(trace.traceId)}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = "var(--border)"; e.currentTarget.style.background = "var(--bg-elevated)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = "transparent"; e.currentTarget.style.background = "var(--bg-alt)"; }}
              >
                <span style={{ fontSize: 12, flexShrink: 0 }}>{outcomeEmoji(trace.outcome)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, display: "flex", alignItems: "center", gap: 6 }}>
                    {trace.skillName && (
                      <span className="skill-chip" style={{ fontSize: 11 }}>
                        {skillName(trace.skillId || "", lang, trace.skillName!)}
                      </span>
                    )}
                    <span style={{ fontFamily: "'IBM Plex Mono', monospace", fontSize: 11, opacity: 0.5 }}>{trace.taskId.slice(0, 8)}</span>
                  </div>
                  <div style={{ fontSize: 11, color: "var(--text-soft)", marginTop: 2 }}>
                    {parseTimestamp(trace.startedAt)} · {formatOutcome(trace.outcome)} · {trace.artifactCount} artifacts
                  </div>
                </div>
                <Icon name="chevronRight" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
