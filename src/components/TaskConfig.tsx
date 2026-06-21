import { useState } from "react";
import type { SkillDescriptor } from "../types/skill";
import { useI18n } from "../i18n";
import { skillName } from "../skillsMeta";
import { Icon } from "../icons";
import { pickDir, pickFiles } from "../lib";
import DynamicForm, { type DynamicFormResult } from "./DynamicForm";
import type { LaunchSpec } from "../useRun";

interface Props {
  skill: SkillDescriptor;
  defaultNetwork: boolean;
  onBack: () => void;
  onLaunch: (spec: LaunchSpec) => void;
}

const CHART_TYPES: { key: string; zh: string; en: string }[] = [
  { key: "bar", zh: "柱状", en: "Bar" },
  { key: "line", zh: "趋势", en: "Line" },
  { key: "heatmap", zh: "热图", en: "Heatmap" },
  { key: "scatter", zh: "散点", en: "Scatter" },
  { key: "radar", zh: "雷达", en: "Radar" },
];

export default function TaskConfig({ skill, defaultNetwork, onBack, onLaunch }: Props) {
  const { t, lang } = useI18n();
  const [workdir, setWorkdir] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [form, setForm] = useState<DynamicFormResult>({ instruction: "", valid: false, userInput: "" });
  const [net, setNet] = useState(defaultNetwork);
  const [chart, setChart] = useState<string | null>(null);

  const isFigure = skill.id === "nature-figure";

  async function chooseDir() { const d = await pickDir(); if (d) setWorkdir(d); }
  async function chooseFiles() { setFiles(await pickFiles()); }

  function run() {
    if (!workdir || !form.valid) return;
    const sel = CHART_TYPES.find((c) => c.key === chart);
    const hint = isFigure && sel
      ? (lang === "zh" ? `\n参考图型:${sel.zh}` : `\nReference chart type: ${sel.en}`)
      : "";
    onLaunch({
      skill,
      instruction: form.instruction + hint,
      userText: form.userInput,
      workdir,
      files,
      needsNetwork: net,
      title: `${skillName(skill.id, lang, skill.name)} · ${form.userInput.split("\n")[0].slice(0, 28) || skill.id}`,
    });
  }

  return (
    <section className="main">
      <div className="subbar">
        <button className="back-btn" onClick={onBack}><Icon name="arrowLeft" />{t("common.back")}</button>
        <span className="skill-chip"><span className="nav-dot" />{skillName(skill.id, lang, skill.name)}<span className="skill-id">{skill.id}</span></span>
        <span className={"badge " + skill.status}>{t("badge." + skill.status)}</span>
      </div>

      <div className="scroll-area">
        <div className="page narrow">
          <span className="eyebrow" style={{ display: "block", marginBottom: 14 }}>{t("task.configEyebrow")}</span>

          <div className="cfg-card">
            <div className="cfg-row">
              <span className="cfg-key">{t("task.workdir")}</span>
              <div className="cfg-val">
                <button className="pick-btn" onClick={chooseDir}><Icon name="folder" />{t("task.chooseDir")}</button>
                <span className={"path-text" + (workdir ? "" : " empty")}>{workdir || t("task.noWorkdir")}</span>
              </div>
            </div>
            <div className="cfg-row">
              <span className="cfg-key">{t("task.inputFiles")}</span>
              <div className="cfg-val">
                <button className="pick-btn" onClick={chooseFiles}><Icon name="file" />{t("task.chooseFile")}</button>
                <span className={"path-text" + (files.length ? "" : " empty")}>
                  {files.length ? t("task.filesCount", { n: files.length }) : t("task.noFiles")}
                </span>
              </div>
            </div>
          </div>

          <div className="cfg-card">
            <DynamicForm skill={skill} files={files} onChange={setForm} />
            {isFigure && (
              <div className="cfg-row block" style={{ borderTop: "1px solid var(--border)" }}>
                <div className="axis-label">{t("task.chartRef")} <span className="multi">{t("task.atlasHint")}</span></div>
                <div className="chips">
                  {CHART_TYPES.map((c) => (
                    <button key={c.key} type="button" className={"chip" + (chart === c.key ? " on" : "")} onClick={() => setChart(chart === c.key ? null : c.key)}>
                      {lang === "zh" ? c.zh : c.en}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="cfg-foot">
            <button className={"toggle" + (net ? " on" : "")} onClick={() => setNet(!net)}><span className="sw" />{t("task.allowNetwork")}</button>
            <span className="spacer" />
            <button className="back-btn" onClick={onBack}>{t("common.cancel")}</button>
            <button className="send" onClick={run} disabled={!workdir || !form.valid}>
              {t("task.runTask")}<Icon name="arrowRight" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
