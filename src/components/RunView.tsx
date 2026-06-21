import { useEffect, useRef, useState } from "react";
import { useI18n } from "../i18n";
import { skillName } from "../skillsMeta";
import { Icon } from "../icons";
import { fileName } from "../lib";
import type { RunController, RunItem } from "../useRun";
import ArtifactPanel from "./ArtifactPanel";

export type { LaunchSpec } from "../useRun";

export default function RunView({ run }: { run: RunController }) {
  const { t, lang } = useI18n();
  const [followup, setFollowup] = useState("");
  const streamRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    streamRef.current?.scrollTo({ top: streamRef.current.scrollHeight });
  }, [run.items]);

  const skill = run.active?.skill ?? null;
  const skillId = skill?.id ?? null;
  const displayName = skill ? skillName(skill.id, lang, skill.name) : t("run.agent");

  function send() {
    if (!followup.trim() || run.running) return;
    run.sendFollowup(followup);
    setFollowup("");
  }

  return (
    <>
      <section className="main">
        <div className="task-head">
          <div className="task-head-row">
            <span className="skill-chip">
              <span className="nav-dot" />
              {displayName}
              {skillId && <span className="skill-id">{skillId}</span>}
            </span>
            <span className={"status-pill " + (run.running ? "running" : "done")}>
              {run.running && <span className="live-dot" />}
              {run.running ? t("status.running") : t("status.done")}
            </span>
            <div className="task-meta">
              {run.active && (
                <span className="task-path" title={run.active.workdir}>
                  <Icon name="folder" /><span className="p">{run.active.workdir}</span>
                </span>
              )}
              {(run.tokens.in > 0 || run.tokens.out > 0) && (
                <span className="mono">{t("run.input")} <b>{run.tokens.in.toLocaleString()}</b> · {t("run.output")} <b>{run.tokens.out.toLocaleString()}</b></span>
              )}
            </div>
          </div>
          <div className={"scanline" + (run.running ? "" : " idle")} />
        </div>

        <div className="stream" ref={streamRef}>
          <div className="stream-inner">
            {run.items.map((it, i) => <Block key={i} it={it} t={t} />)}
            {run.running && (
              <div className="working">
                <span className="dots"><i /><i /><i /></span>
                {t("status.running")}…
                <button className="stop-btn" onClick={run.cancel}><Icon name="stop" />{t("run.stop")}</button>
              </div>
            )}
          </div>
        </div>

        <div className="composer-wrap">
          <div className="composer">
            <textarea
              rows={2}
              value={followup}
              onChange={(e) => setFollowup(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }}
              placeholder={t("run.composerPh")}
            />
            <div className="composer-bar">
              <span className="spacer" />
              <button className="send" onClick={send} disabled={!followup.trim() || run.running}>
                {t("run.send")}<Icon name="arrowRight" />
              </button>
            </div>
          </div>
        </div>
      </section>

      <aside className="artifacts">
        <ArtifactPanel
          result={run.result}
          artifacts={run.artifacts}
          skillId={skillId}
          original={run.active?.userText ?? ""}
          nonce={run.nonce}
          canRefine={run.canRefine}
          refineBasedOn={fileName([...run.artifacts].reverse().find((p) => p.endsWith(".py")) ?? "")}
          onRefine={run.refine}
        />
      </aside>
    </>
  );
}

type TFn = (k: string, v?: Record<string, string | number>) => string;

function Block({ it, t }: { it: RunItem; t: TFn }) {
  switch (it.k) {
    case "user":
      return (
        <div className="block msg-user">
          <div className="block-by"><span className="avatar user"><Icon name="user" /></span><span className="who">{t("run.you")}</span></div>
          <div className="bubble">
            {it.text}
            {it.files.length > 0 && (
              <div className="attach">{it.files.map((f) => <span className="file" key={f}><Icon name="file" />{fileName(f)}</span>)}</div>
            )}
          </div>
        </div>
      );
    case "reasoning":
      return (
        <div className="block">
          <details className="think">
            <summary>
              <span className="chevron"><Icon name="chevronRight" /></span>
              <span className="think-icon"><Icon name="brain" /></span>
              {t("run.thought")}
            </summary>
            <div className="think-body">{it.text}</div>
          </details>
        </div>
      );
    case "command": {
      const label = it.status === "ok" ? t("run.cmdDone") : it.status === "fail" ? t("run.cmdFailed") : t("run.cmdRunning");
      return (
        <div className="block"><div className="cmd"><div className="cmd-line">
          <span className="sigil">$</span>
          <span className="text">{it.text}</span>
          <span className={"cmd-stat " + it.status}>{it.status === "run" && <span className="live-dot" style={{ width: 6, height: 6 }} />}{label}</span>
        </div></div></div>
      );
    }
    case "artifact":
      return (
        <div className="block artifact-evt">
          <span className="fi"><Icon name="file" /></span>
          <span className="meta"><span className="fname">{fileName(it.path)}</span></span>
          <span className="kind">{t("status.created")}</span>
        </div>
      );
    case "assistant":
      return (
        <div className="block assistant">
          <div className="block-by"><span className="avatar agent"><Icon name="shield" /></span><span className="who">{t("run.agent")}</span></div>
          <div className="md" style={{ whiteSpace: "pre-wrap" }}>{it.text}</div>
        </div>
      );
    case "plan":
      return <div className="block"><div className="plan"><div className="plan-title"><Icon name="clipboard" />{t("run.planTitle")}</div></div></div>;
    case "progress":
      return <div className="block dim" style={{ fontSize: 12 }}>{it.text}</div>;
    case "turn":
      return (
        <div className="block turn-foot">
          <span>{t("run.turnComplete")}</span><span className="sep" />
          <span>{t("run.input")} <b>{it.usage.input_tokens.toLocaleString()}</b></span>
          <span>{t("run.cached")} <b>{it.usage.cached_input_tokens.toLocaleString()}</b></span>
          <span>{t("run.output")} <b>{it.usage.output_tokens.toLocaleString()}</b></span>
        </div>
      );
    case "note":
      return <div className={"block " + (it.cls === "err" ? "line-err" : it.cls === "warn" ? "line-warn" : "dim")}>{it.text}</div>;
  }
}
