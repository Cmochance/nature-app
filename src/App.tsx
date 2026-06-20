import { useEffect, useRef, useState } from "react";
import { invoke, Channel, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { readTextFile } from "@tauri-apps/plugin-fs";
import type { DomainEvent, EngineStatus, TaskSpec } from "./types/engine";
import type { SkillDescriptor } from "./types/skill";
import DynamicForm, { type DynamicFormResult } from "./components/DynamicForm";
import ArtifactPreview from "./components/ArtifactPreview";
import Settings from "./components/Settings";
import "./App.css";

interface LogLine {
  t: string;
  text: string;
  cls?: string;
}

const STATUS_LABEL: Record<string, string> = {
  stable: "Stable",
  beta: "Beta",
  draft: "Draft",
};

// chart-atlas 10 类图型(bundled assets/chart-atlas/*.png)
const CHART_ATLAS: { file: string; label: string }[] = [
  { file: "atlas-01-bar-charts.png", label: "bar 柱状" },
  { file: "atlas-02-line-trends.png", label: "line 趋势" },
  { file: "atlas-03-heatmaps.png", label: "heatmap 热图" },
  { file: "atlas-04-scatter-bubble.png", label: "scatter 散点" },
  { file: "atlas-05-radar-polar.png", label: "radar 雷达" },
  { file: "atlas-06-distributions.png", label: "distribution 分布" },
  { file: "atlas-07-forest-interval.png", label: "forest 森林" },
  { file: "atlas-08-area-stacked.png", label: "area 堆叠" },
  { file: "atlas-09-image-plates.png", label: "image 图板" },
  { file: "atlas-10-network-matrix.png", label: "network 网络" },
];

function ChartAtlas({
  skillDir,
  selected,
  onSelect,
}: {
  skillDir: string;
  selected: string | null;
  onSelect: (label: string | null) => void;
}) {
  return (
    <details className="atlas">
      <summary>chart-atlas 选图型(可选,引导绘图){selected && ` · 已选:${selected}`}</summary>
      <div className="atlas-grid">
        {CHART_ATLAS.map((a) => (
          <button
            key={a.file}
            type="button"
            className={"atlas-item" + (selected === a.label ? " on" : "")}
            onClick={() => onSelect(selected === a.label ? null : a.label)}
            title={a.label}
          >
            <img src={convertFileSrc(`${skillDir}/assets/chart-atlas/${a.file}`)} alt={a.label} />
            <span>{a.label}</span>
          </button>
        ))}
      </div>
    </details>
  );
}

export default function App() {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [skills, setSkills] = useState<SkillDescriptor[]>([]);
  const [selected, setSelected] = useState<SkillDescriptor | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [dangerSandbox, setDangerSandbox] = useState(false);

  useEffect(() => {
    invoke<EngineStatus>("check_engine").then(setEngine).catch(() => setEngine(null));
    invoke<SkillDescriptor[]>("list_skills").then(setSkills).catch(() => setSkills([]));
  }, []);

  function goHome() {
    setSelected(null);
    setShowSettings(false);
  }

  return (
    <main className="app">
      <header className="topbar">
        <h1 onClick={goHome} style={{ cursor: "pointer" }}>
          Nature App <span className="tag">M2</span>
        </h1>
        <div className="engine">
          {dangerSandbox && <span className="warn-pill">全放开沙箱</span>}
          {engine ? (
            <>
              <span className={engine.loggedIn ? "ok" : "err"}>
                {engine.loggedIn ? "● 已登录" : "○ 未登录"}
              </span>
              <span className="dim">{engine.version ?? "codex 未知"}</span>
            </>
          ) : (
            <span className="dim">检测引擎中…</span>
          )}
          <button className="gear" title="环境体检 / 设置" onClick={() => setShowSettings(true)}>
            ⚙
          </button>
        </div>
      </header>

      {showSettings ? (
        <div className="settings-wrap">
          <button className="link" onClick={() => setShowSettings(false)}>← 返回</button>
          <Settings dangerSandbox={dangerSandbox} onDangerChange={setDangerSandbox} />
        </div>
      ) : selected ? (
        <RunView skill={selected} dangerSandbox={dangerSandbox} onBack={() => setSelected(null)} />
      ) : (
        <Catalog skills={skills} onPick={setSelected} />
      )}
    </main>
  );
}

function Catalog({
  skills,
  onPick,
}: {
  skills: SkillDescriptor[];
  onPick: (s: SkillDescriptor) => void;
}) {
  return (
    <section className="catalog">
      <p className="catalog-hint">选择一个科研 skill（共 {skills.length} 个）</p>
      <div className="cards">
        {skills.map((s) => (
          <button key={s.id} className="card" onClick={() => onPick(s)}>
            <div className="card-head">
              <span className="card-name">{s.id}</span>
              <span className={"badge " + s.status}>{STATUS_LABEL[s.status] ?? s.status}</span>
            </div>
            <p className="card-desc">{s.description}</p>
            <div className="card-foot">
              <span className="cap">{s.formCapability}</span>
              {s.axes.length > 0 && <span className="cap">{s.axes.length} 轴</span>}
            </div>
          </button>
        ))}
      </div>
    </section>
  );
}

function RunView({
  skill,
  dangerSandbox,
  onBack,
}: {
  skill: SkillDescriptor;
  dangerSandbox: boolean;
  onBack: () => void;
}) {
  const [workdir, setWorkdir] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [form, setForm] = useState<DynamicFormResult>({ instruction: "", valid: false, userInput: "" });
  const [needsNetwork, setNeedsNetwork] = useState(true);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const [result, setResult] = useState<string | null>(null);
  const [tokens, setTokens] = useState({ in: 0, out: 0 });
  const [chartHint, setChartHint] = useState<string | null>(null);
  const [refineInput, setRefineInput] = useState("");
  const [originalInput, setOriginalInput] = useState("");
  const taskIdRef = useRef<string | null>(null);

  const isFigure = skill.id === "nature-figure";
  // 最近一次生成的绘图脚本(用于"再改一版"回灌)
  const lastPy = [...artifacts].reverse().find((p) => p.endsWith(".py")) || null;

  function push(text: string, cls?: string) {
    setLog((prev) => [...prev, { t: new Date().toLocaleTimeString(), text, cls }]);
  }

  async function pickWorkdir() {
    const dir = await open({ directory: true, multiple: false, title: "选择工作目录(产物根)" });
    if (typeof dir === "string") setWorkdir(dir);
  }

  async function pickFiles() {
    const f = await open({ multiple: true, title: "选择输入文件" });
    if (Array.isArray(f)) setFiles(f as string[]);
    else if (typeof f === "string") setFiles([f]);
  }

  async function launch(instruction: string) {
    if (!workdir) return;
    setLog([]);
    setArtifacts([]);
    setResult(null);
    setTokens({ in: 0, out: 0 });
    setRunning(true);
    taskIdRef.current = null;

    const channel = new Channel<DomainEvent>();
    channel.onmessage = (ev) => {
      switch (ev.kind) {
        case "started":
          taskIdRef.current = ev.taskId;
          push("$ codex " + ev.argv.join(" "), "cmd");
          break;
        case "threadStarted":
          push("thread: " + ev.threadId, "dim");
          break;
        case "turnStarted":
          push("— turn 开始 —", "dim");
          break;
        case "reasoning":
          push("[思考] " + ev.text, "dim");
          break;
        case "commandRun":
          push("[运行] " + ev.command + (ev.status ? ` (${ev.status})` : ""), "cmd");
          break;
        case "assistantMessage":
          push(ev.text, "msg");
          setResult(ev.text); // 保留最后一条作为最终结果
          break;
        case "artifact":
          push(`[产物 ${ev.changeKind}] ${ev.path}`, "ok");
          setArtifacts((p) => (p.includes(ev.path) ? p : [...p, ev.path]));
          break;
        case "turnCompleted":
          push(
            `tokens: in ${ev.usage.input_tokens} (cached ${ev.usage.cached_input_tokens}) / out ${ev.usage.output_tokens}`,
            "dim"
          );
          setTokens((p) => ({
            in: p.in + ev.usage.input_tokens,
            out: p.out + ev.usage.output_tokens,
          }));
          break;
        case "plan":
          push("[计划] 已更新", "dim");
          break;
        case "progress":
          push(`[进度] ${ev.text}`, "dim");
          break;
        case "engineError": {
          const cta: Record<string, string> = {
            notLoggedIn: " → 请在终端运行 codex login",
            networkBlocked: " → 勾选'允许联网'后重试",
            notInstalled: " → 未检测到 codex,请先安装",
            timeout: "",
          };
          push(`[错误:${ev.class}] ${ev.message}${cta[ev.class] ?? ""}`, "err");
          break;
        }
        case "raw":
          push(`[raw:${ev.codexType}]`, "dim");
          break;
        case "finished":
          push(`— 结束:${ev.outcome}(exit=${ev.exitCode ?? "?"})—`, ev.outcome === "success" ? "ok" : "err");
          setRunning(false);
          break;
      }
    };

    const spec: TaskSpec = {
      instruction,
      workdir,
      sandboxTier: dangerSandbox ? "dangerFullAccess" : "workspaceWrite",
      needsNetwork,
    };

    try {
      await invoke<string>("run_skill_task", { spec, onEvent: channel });
    } catch (e) {
      push("启动失败:" + String(e), "err");
      setRunning(false);
    }
  }

  function run() {
    if (!form.valid) return;
    setOriginalInput(form.userInput);
    const hint = isFigure && chartHint ? `\n参考图型(chart-atlas):${chartHint}` : "";
    launch(form.instruction + hint);
  }

  // figure"再改一版":读上一版脚本 + 新要求,重跑生成新版本
  async function refine() {
    if (!lastPy || !refineInput.trim()) return;
    let code = "";
    try {
      code = await readTextFile(lastPy);
    } catch {
      /* 读不到脚本就只带要求 */
    }
    const v = artifacts.filter((p) => /chart(_v\d+)?\.png$/i.test(p)).length + 1;
    const instr = [
      `请使用技能「nature-figure」。这是当前的绘图脚本(${lastPy.split("/").pop()}):`,
      "```python",
      code,
      "```",
      `请按以下修改重新生成图,并把新版本保存为 chart_v${v}.png 和 chart_v${v}.svg 到当前工作目录(保留旧版本不要覆盖):`,
      refineInput.trim(),
    ].join("\n");
    setRefineInput("");
    launch(instr);
  }

  async function cancel() {
    if (taskIdRef.current) {
      await invoke("cancel_task", { taskId: taskIdRef.current });
      push("已请求取消", "err");
    }
  }

  return (
    <section className="runview">
      <div className="run-head">
        <button className="link" onClick={onBack}>← 返回目录</button>
        <span className="run-title">{skill.id}</span>
        <span className={"badge " + skill.status}>{STATUS_LABEL[skill.status] ?? skill.status}</span>
        <div className="spacer" />
        {(tokens.in > 0 || tokens.out > 0) && (
          <span className="dim small">累计 tokens: in {tokens.in.toLocaleString()} / out {tokens.out.toLocaleString()}</span>
        )}
      </div>

      <section className="form">
        <div className="row">
          <button onClick={pickWorkdir}>工作目录</button>
          <code className="path">{workdir || "(未选择)"}</code>
        </div>
        <div className="row">
          <button onClick={pickFiles}>输入文件</button>
          <code className="path">{files.length ? `${files.length} 个文件` : "(可选)"}</code>
        </div>

        <DynamicForm skill={skill} files={files} onChange={setForm} />

        {isFigure && <ChartAtlas skillDir={skill.dir} selected={chartHint} onSelect={setChartHint} />}

        <div className="row">
          <label>
            <input type="checkbox" checked={needsNetwork} onChange={(e) => setNeedsNetwork(e.target.checked)} />
            允许联网
          </label>
          <div className="spacer" />
          {running ? (
            <button className="danger" onClick={cancel}>取消</button>
          ) : (
            <button className="primary" onClick={run} disabled={!workdir || !form.valid}>运行</button>
          )}
        </div>

        {isFigure && lastPy && !running && (
          <div className="refine">
            <div className="axis-label">再改一版(基于上一版脚本 {lastPy.split("/").pop()})</div>
            <div className="row">
              <input
                className="refine-input"
                value={refineInput}
                onChange={(e) => setRefineInput(e.target.value)}
                placeholder="例如:把柱子改成横向、配色用蓝绿、加误差棒…"
              />
              <button onClick={refine} disabled={!refineInput.trim()}>生成新版本</button>
            </div>
          </div>
        )}
      </section>

      <section className="panes">
        <div className="console">
          {log.length === 0 && <div className="dim">控制台输出会显示在这里…</div>}
          {log.map((l, i) => (
            <div key={i} className={"line " + (l.cls ?? "")}>
              <span className="ts">{l.t}</span>
              <span className="txt">{l.text}</span>
            </div>
          ))}
        </div>
        <div className="artifacts">
          <ArtifactPreview
            result={result}
            artifacts={artifacts}
            skillId={skill.id}
            original={originalInput}
          />
        </div>
      </section>
    </section>
  );
}
