import { useEffect, useRef, useState } from "react";
import { invoke, Channel, convertFileSrc } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { DomainEvent, EngineStatus, TaskSpec } from "./types/engine";
import "./App.css";

const DEFAULT_INSTRUCTION =
  "用 matplotlib 画一张柱状图(示例数据:A=3, B=5, C=2, D=4),应用简洁的发表级样式,保存为 chart.png 到当前工作目录。完成后只回一句确认,不要多余解释。";

interface LogLine {
  t: string;
  text: string;
  cls?: string;
}

function isImage(path: string) {
  return /\.(png|svg|jpg|jpeg|gif|webp)$/i.test(path);
}

function App() {
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [workdir, setWorkdir] = useState<string>("");
  const [instruction, setInstruction] = useState<string>(DEFAULT_INSTRUCTION);
  const [needsNetwork, setNeedsNetwork] = useState<boolean>(true);
  const [running, setRunning] = useState<boolean>(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [artifacts, setArtifacts] = useState<string[]>([]);
  const taskIdRef = useRef<string | null>(null);

  useEffect(() => {
    invoke<EngineStatus>("check_engine").then(setEngine).catch(() => setEngine(null));
  }, []);

  function push(text: string, cls?: string) {
    setLog((prev) => [...prev, { t: new Date().toLocaleTimeString(), text, cls }]);
  }

  async function pickWorkdir() {
    const dir = await open({ directory: true, multiple: false, title: "选择工作目录(产物根)" });
    if (typeof dir === "string") setWorkdir(dir);
  }

  async function run() {
    if (!workdir) {
      push("请先选择工作目录", "err");
      return;
    }
    setLog([]);
    setArtifacts([]);
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
          break;
        case "artifact":
          push(`[产物 ${ev.changeKind}] ${ev.path}`, "ok");
          if (isImage(ev.path)) setArtifacts((p) => (p.includes(ev.path) ? p : [...p, ev.path]));
          break;
        case "turnCompleted":
          push(
            `tokens: in ${ev.usage.input_tokens} (cached ${ev.usage.cached_input_tokens}) / out ${ev.usage.output_tokens}`,
            "dim"
          );
          break;
        case "engineError":
          push(`[错误:${ev.class}] ${ev.message}`, "err");
          break;
        case "raw":
          push(`[raw:${ev.codexType}]`, "dim");
          break;
        case "finished":
          push(
            `— 结束:${ev.outcome}(exit=${ev.exitCode ?? "?"})—`,
            ev.outcome === "success" ? "ok" : "err"
          );
          setRunning(false);
          break;
      }
    };

    const spec: TaskSpec = {
      instruction,
      workdir,
      sandboxTier: "workspaceWrite",
      needsNetwork,
    };

    try {
      await invoke<string>("run_skill_task", { spec, onEvent: channel });
    } catch (e) {
      push("启动失败:" + String(e), "err");
      setRunning(false);
    }
  }

  async function cancel() {
    if (taskIdRef.current) {
      await invoke("cancel_task", { taskId: taskIdRef.current });
      push("已请求取消", "err");
    }
  }

  return (
    <main className="app">
      <header className="topbar">
        <h1>Nature App <span className="tag">M0</span></h1>
        <div className="engine">
          {engine ? (
            <>
              <span className={engine.loggedIn ? "ok" : "err"}>
                {engine.loggedIn ? "● 已登录" : "○ 未登录"}
              </span>
              <span className="dim">{engine.version ?? "codex 未知版本"}</span>
            </>
          ) : (
            <span className="dim">检测引擎中…</span>
          )}
        </div>
      </header>

      <section className="form">
        <div className="row">
          <button onClick={pickWorkdir}>选择工作目录</button>
          <code className="path">{workdir || "(未选择)"}</code>
        </div>
        <textarea
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          rows={4}
          placeholder="给 codex 的绘图指令…"
        />
        <div className="row">
          <label>
            <input
              type="checkbox"
              checked={needsNetwork}
              onChange={(e) => setNeedsNetwork(e.target.checked)}
            />
            允许联网(缺包时可 pip 安装)
          </label>
          <div className="spacer" />
          {running ? (
            <button className="danger" onClick={cancel}>取消</button>
          ) : (
            <button className="primary" onClick={run} disabled={!workdir}>运行</button>
          )}
        </div>
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
          {artifacts.length === 0 && <div className="dim">产物图片会显示在这里…</div>}
          {artifacts.map((p) => (
            <figure key={p}>
              <img src={convertFileSrc(p)} alt={p} />
              <figcaption>{p.split("/").pop()}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
