import { useCallback, useRef, useState } from "react";
import { invoke, Channel } from "@tauri-apps/api/core";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { DomainEvent, TaskSpec, Usage } from "./types/engine";
import type { SkillDescriptor } from "./types/skill";
import type { PlotSpec, PlotData } from "./types/plot";
import type { Lang } from "./i18n";
import { fileName } from "./lib";

type TFunc = (k: string, v?: Record<string, string | number>) => string;

export interface LaunchSpec {
  skill: SkillDescriptor | null;
  instruction: string; // 发给后端的完整指令
  userText: string;     // 用户原始输入(气泡展示 + polishing 对照)
  workdir: string;
  files: string[];
  needsNetwork: boolean;
  title: string;
}

export type RunItem =
  | { k: "user"; text: string; files: string[] }
  | { k: "reasoning"; text: string }
  | { k: "command"; text: string; status: "run" | "ok" | "fail" }
  | { k: "artifact"; path: string; changeKind: string }
  | { k: "assistant"; text: string }
  | { k: "plan" }
  | { k: "progress"; text: string }
  | { k: "turn"; usage: Usage }
  | { k: "note"; text: string; cls?: "err" | "warn" };

interface ActiveRun {
  skill: SkillDescriptor | null;
  workdir: string;
  title: string;
  userText: string;
  needsNetwork: boolean;
}

export interface PlotParams { spec: PlotSpec; data: PlotData; }

export interface RunController {
  active: ActiveRun | null;
  items: RunItem[];
  artifacts: string[];
  result: string | null;
  running: boolean;
  tokens: { in: number; out: number };
  nonce: number;
  canRefine: boolean;
  plotParams: PlotParams | null; // figure 任务导出的 plot_spec/plot_data(供图表微调)
  launch: (spec: LaunchSpec) => void;
  sendFollowup: (text: string) => void;
  cancel: () => void;
  refine: (text: string) => void;
}

export function useRun(opts: { dangerSandbox: boolean; lang: Lang; t: TFunc }): RunController {
  const [items, setItems] = useState<RunItem[]>([]);
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [tokens, setTokens] = useState({ in: 0, out: 0 });
  const [active, setActive] = useState<ActiveRun | null>(null);
  const [nonce, setNonce] = useState(0);
  const [plotParams, setPlotParams] = useState<PlotParams | null>(null);

  const taskIdRef = useRef<string | null>(null);
  const gotResultRef = useRef(false);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  const activeRef = useRef<ActiveRun | null>(active);
  activeRef.current = active;
  const artifactsRef = useRef<string[]>(artifacts);
  artifactsRef.current = artifacts;

  const lastPy = [...artifacts].reverse().find((p) => p.endsWith(".py")) || null;
  const canRefine = active?.skill?.id === "nature-figure" && !!lastPy && !running;

  const begin = useCallback(
    async (instruction: string, displayText: string, files: string[], append: boolean, ctx: ActiveRun) => {
      const t = optsRef.current.t;
      const danger = optsRef.current.dangerSandbox;

      if (!append) {
        setItems([{ k: "user", text: displayText, files }]);
        setArtifacts([]);
        setResult(null);
        setTokens({ in: 0, out: 0 });
        setPlotParams(null);
        setActive(ctx);
      } else {
        setItems((prev) => [...prev, { k: "user", text: displayText, files }]);
      }
      setNonce((n) => n + 1);
      setRunning(true);
      taskIdRef.current = null;
      gotResultRef.current = false;

      const push = (it: RunItem) => setItems((prev) => [...prev, it]);
      const channel = new Channel<DomainEvent>();
      channel.onmessage = (ev) => {
        switch (ev.kind) {
          case "started":
            taskIdRef.current = ev.taskId;
            push({ k: "command", text: "codex " + ev.argv.join(" "), status: "ok" });
            break;
          case "reasoning":
            push({ k: "reasoning", text: ev.text });
            break;
          case "commandRun": {
            const s = (ev.status ?? "").toLowerCase();
            const status: "run" | "ok" | "fail" = s === "completed" ? "ok" : /fail|error/.test(s) ? "fail" : "run";
            push({ k: "command", text: ev.command, status });
            break;
          }
          case "assistantMessage":
            push({ k: "assistant", text: ev.text });
            setResult(ev.text);
            gotResultRef.current = true;
            break;
          case "artifact":
            push({ k: "artifact", path: ev.path, changeKind: ev.changeKind });
            setArtifacts((p) => (p.includes(ev.path) ? p : [...p, ev.path]));
            break;
          case "turnCompleted":
            push({ k: "turn", usage: ev.usage });
            setTokens((p) => ({ in: p.in + ev.usage.input_tokens, out: p.out + ev.usage.output_tokens }));
            break;
          case "plan":
            push({ k: "plan" });
            break;
          case "progress":
            push({ k: "progress", text: ev.text });
            break;
          case "engineError": {
            const ctaKey: Record<string, string> = {
              notLoggedIn: "run.ctaNotLoggedIn",
              networkBlocked: "run.ctaNetworkBlocked",
              notInstalled: "run.ctaNotInstalled",
            };
            const cta = ctaKey[ev.class] ? t(ctaKey[ev.class]) : "";
            push({ k: "note", text: ev.message + cta, cls: "err" });
            break;
          }
          case "finished":
            if (ev.outcome === "cancelled") {
              push({ k: "note", text: t("run.cancelled") });
            } else if (ev.outcome === "success" && ev.artifactCount === 0 && !gotResultRef.current) {
              push({ k: "note", text: t("run.emptyWarn"), cls: "warn" });
            } else {
              const exit = ev.exitCode != null ? ` · ${t("run.exit")}=${ev.exitCode}` : "";
              push({ k: "note", text: `${t("run.finished")} · ${ev.outcome}${exit}`, cls: ev.outcome === "success" ? undefined : "err" });
            }
            setRunning(false);
            // figure 任务成功 → 尝试载入 codex 导出的绘图参数(供图表微调,无则保持 null,UI 用 demo 兜底)
            if (ev.outcome === "success" && ctx.skill?.id === "nature-figure") {
              Promise.all([
                readTextFile(`${ctx.workdir}/plot_spec.json`),
                readTextFile(`${ctx.workdir}/plot_data.json`),
              ])
                .then(([s, d]) => setPlotParams({ spec: JSON.parse(s) as PlotSpec, data: JSON.parse(d) as PlotData }))
                .catch(() => { /* 无参数文件,保持 null */ });
            }
            break;
        }
      };

      const spec: TaskSpec = {
        instruction,
        workdir: ctx.workdir,
        sandboxTier: danger ? "dangerFullAccess" : "workspaceWrite",
        needsNetwork: ctx.needsNetwork,
      };
      try {
        await invoke<string>("run_skill_task", { spec, onEvent: channel });
      } catch (e) {
        push({ k: "note", text: t("run.startFailed", { msg: String(e) }), cls: "err" });
        setRunning(false);
      }
    },
    []
  );

  const launch = useCallback((spec: LaunchSpec) => {
    begin(spec.instruction, spec.userText || spec.instruction, spec.files, false, {
      skill: spec.skill, workdir: spec.workdir, title: spec.title, userText: spec.userText, needsNetwork: spec.needsNetwork,
    });
  }, [begin]);

  const sendFollowup = useCallback((text: string) => {
    const a = activeRef.current;
    if (!a || !text.trim()) return;
    begin(text.trim(), text.trim(), [], true, a);
  }, [begin]);

  const cancel = useCallback(async () => {
    if (taskIdRef.current) {
      await invoke("cancel_task", { taskId: taskIdRef.current });
      setItems((prev) => [...prev, { k: "note", text: optsRef.current.t("run.cancelRequested"), cls: "warn" }]);
    }
  }, []);

  const refine = useCallback(async (text: string) => {
    const a = activeRef.current;
    if (!a || !text.trim()) return;
    const py = [...artifactsRef.current].reverse().find((p) => p.endsWith(".py")) || null;
    if (!py) return;
    const zh = optsRef.current.lang === "zh";
    let code = "";
    try { code = await readTextFile(py); } catch { /* 读不到就从零生成 */ }
    const v = artifactsRef.current.filter((p) => /chart(_v\d+)?\.png$/i.test(p)).length + 1;
    const instr = [
      zh ? `请使用技能「nature-figure」。这是当前的绘图脚本(${fileName(py)}):`
         : `Use the skill "nature-figure". Here is the current plotting script (${fileName(py)}):`,
      "```python", code, "```",
      zh ? `请按以下修改重新生成图,并把新版本另存为 chart_v${v}.png 和 chart_v${v}.svg(保留旧版本):`
         : `Apply the changes below and regenerate, saving the new version as chart_v${v}.png and chart_v${v}.svg (keep old versions):`,
      text.trim(),
    ].join("\n");
    begin(instr, text.trim(), [], true, a);
  }, [begin]);

  return { active, items, artifacts, result, running, tokens, nonce, canRefine, plotParams, launch, sendFollowup, cancel, refine };
}
