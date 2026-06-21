import { useState } from "react";
import type { SkillDescriptor } from "../types/skill";
import { useI18n } from "../i18n";
import { skillName, skillDesc, skillIcon, skillGroup, GROUP_ORDER } from "../skillsMeta";
import { Icon } from "../icons";
import { pickDir, pickFiles } from "../lib";
import type { LaunchSpec } from "../useRun";
import type { RecentItem } from "./Sidebar";

interface Props {
  skills: SkillDescriptor[];
  recent: RecentItem[];
  defaultNetwork: boolean;
  onOpenSkill: (s: SkillDescriptor) => void;
  onLaunch: (spec: LaunchSpec) => void;
  onOpenRecent: (r: RecentItem) => void;
}

export default function Home({ skills, recent, defaultNetwork, onOpenSkill, onLaunch, onOpenRecent }: Props) {
  const { t, lang } = useI18n();
  const [text, setText] = useState("");
  const [workdir, setWorkdir] = useState("");
  const [files, setFiles] = useState<string[]>([]);
  const [net, setNet] = useState(defaultNetwork);

  async function chooseDir() { const d = await pickDir(); if (d) setWorkdir(d); }
  async function chooseFiles() { setFiles(await pickFiles()); }

  function start() {
    if (!text.trim() || !workdir) return;
    const zh = lang === "zh";
    const filesNote = files.length
      ? (zh ? `\n\n可访问以下输入文件:\n` : `\n\nInput files available:\n`) + files.map((f) => "- " + f).join("\n")
      : "";
    onLaunch({
      skill: null,
      instruction: text.trim() + filesNote,
      userText: text.trim(),
      workdir,
      files,
      needsNetwork: net,
      title: text.trim().split("\n")[0].slice(0, 40),
    });
  }

  const byGroup = GROUP_ORDER.map((g) => ({ g, items: skills.filter((s) => skillGroup(s.id) === g) })).filter((x) => x.items.length > 0);

  return (
    <div className="scroll-area">
      <div className="page">
        <div className="hero">
          <span className="eyebrow">{t("home.eyebrow")}</span>
          <h1>{t("home.titleA")} <span className="grad">{t("home.titleB")}</span></h1>
          <p>{t("home.sub")}</p>
        </div>

        <div className="home-composer">
          <div className="composer">
            <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder={t("home.composerPh")} />
            <div className="composer-bar">
              <button className="btn-ghost" onClick={chooseDir} title={workdir || undefined}>
                <Icon name="folder" />{workdir ? workdir.split("/").pop() : t("home.workdir")}
              </button>
              <button className="btn-ghost" onClick={chooseFiles}>
                <Icon name="paperclip" />{files.length ? t("task.filesCount", { n: files.length }) : t("home.attach")}
              </button>
              <button className={"toggle" + (net ? " on" : "")} onClick={() => setNet(!net)}>
                <span className="sw" />{t("home.allowNetwork")}
              </button>
              <span className="spacer" />
              <button className="send" onClick={start} disabled={!text.trim() || !workdir}>
                {t("home.startTask")}<Icon name="arrowRight" />
              </button>
            </div>
          </div>
        </div>

        <div className="sect">
          <div className="sect-head">
            <h2>{t("home.skillsTitle")}</h2>
            <span className="more">{t("home.skillsSub", { n: skills.length })}</span>
          </div>
          {byGroup.map(({ g, items }) => (
            <div key={g}>
              <div className="group-label">{t("group." + g)}</div>
              <div className="skill-grid">
                {items.map((s) => (
                  <button key={s.id} className="skill-card" onClick={() => onOpenSkill(s)}>
                    <div className="sc-head">
                      <span className="sc-ico"><Icon name={skillIcon(s.id)} /></span>
                      <span className="sc-name">
                        <span className="sc-zh">{skillName(s.id, lang, s.name)}</span>
                        <span className="sc-id">{s.id.replace(/^nature-/, "")}</span>
                      </span>
                      <span className={"sc-badge badge " + s.status}>{t("badge." + s.status)}</span>
                    </div>
                    <p className="sc-desc">{skillDesc(s.id, lang, s.description)}</p>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>

        {recent.length > 0 && (
          <div className="sect">
            <div className="sect-head"><h2>{t("home.recentTitle")}</h2></div>
            <div className="recent-list">
              {recent.map((r) => (
                <button key={r.id} className="recent-row" onClick={() => onOpenRecent(r)}>
                  <span className="r-ico"><Icon name={r.skillId ? skillIcon(r.skillId) : "skill"} /></span>
                  <span className="r-main">
                    <div className="r-title">{r.title}</div>
                    <div className="r-sub">{r.skillName}</div>
                  </span>
                  {r.running
                    ? <span className="status-pill running"><span className="live-dot" />{t("status.running")}</span>
                    : <span className="r-time">{r.at}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
