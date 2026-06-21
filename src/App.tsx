import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { EngineStatus } from "./types/engine";
import type { SkillDescriptor } from "./types/skill";
import { LangProvider, useI18n } from "./i18n";
import { ThemeProvider } from "./theme";
import { skillName } from "./skillsMeta";
import { useRun, type LaunchSpec } from "./useRun";
import Sidebar, { type ViewName, type RecentItem } from "./components/Sidebar";
import Home from "./components/Home";
import TaskConfig from "./components/TaskConfig";
import RunView from "./components/RunView";
import Settings from "./components/Settings";
import "./styles.css";

function Shell() {
  const { t, lang } = useI18n();
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [skills, setSkills] = useState<SkillDescriptor[]>([]);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  const [view, setView] = useState<ViewName>("home");
  const [sel, setSel] = useState<SkillDescriptor | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);

  const [dangerSandbox, setDangerSandbox] = useState(false);
  const [defaultNetwork, setDefaultNetwork] = useState(true);

  const run = useRun({ dangerSandbox, lang, t });

  const idRef = useRef(0);
  const activeRunIdRef = useRef<string | null>(null);

  useEffect(() => {
    invoke<EngineStatus>("check_engine").then(setEngine).catch(() => setEngine(null));
    invoke<SkillDescriptor[]>("list_skills")
      .then((s) => { setSkills(s); setSkillsError(null); })
      .catch((e) => setSkillsError(String(e)));
  }, []);

  // 运行指示灯:按当前运行对应的 recent id 更新,且仅在值变化时写(避免无意义重渲染/循环)
  useEffect(() => {
    const id = activeRunIdRef.current;
    if (!id) return;
    setRecent((r) => {
      const idx = r.findIndex((x) => x.id === id);
      if (idx < 0 || r[idx].running === run.running) return r;
      const next = [...r];
      next[idx] = { ...next[idx], running: run.running };
      return next;
    });
  }, [run.running]);

  function openSkill(s: SkillDescriptor) { setSel(s); setView("newtask"); }

  function startLaunch(spec: LaunchSpec) {
    const id = String(++idRef.current);
    const item: RecentItem = {
      id,
      title: spec.title || (spec.skill ? skillName(spec.skill.id, lang, spec.skill.name) : t("run.agent")),
      skillId: spec.skill?.id ?? null,
      skillName: spec.skill ? skillName(spec.skill.id, lang, spec.skill.name) : t("run.agent"),
      running: true,
      at: new Date().toLocaleTimeString(),
      spec,
    };
    activeRunIdRef.current = id;
    setRecent((r) => [item, ...r.filter((x) => x.title !== item.title)].slice(0, 6));
    run.launch(spec);
    setView("run");
  }

  function openRecent(item: RecentItem) {
    // 当前运行/最近一次:直接回到该视图,不重跑(避免重复执行)
    if (item.id === activeRunIdRef.current) { setView("run"); return; }
    // 其它历史项:用同一配置重跑该任务(每个条目都可用)
    startLaunch(item.spec);
  }

  return (
    <div className="shell" data-view={view}>
      <Sidebar
        skills={skills}
        engine={engine}
        view={view}
        recent={recent}
        onView={setView}
        onNewTask={() => setView("home")}
        onOpenSkill={openSkill}
        onOpenRecent={openRecent}
      />

      {view === "run" && run.active && <RunView run={run} />}

      {view === "newtask" && sel && (
        <TaskConfig skill={sel} defaultNetwork={defaultNetwork} onBack={() => setView("home")} onLaunch={startLaunch} />
      )}

      {view === "home" && (
        <section className="main">
          {skillsError ? (
            <div className="page"><div className="load-error">{skillsError}</div></div>
          ) : (
            <Home skills={skills} recent={recent} defaultNetwork={defaultNetwork} onOpenSkill={openSkill} onLaunch={startLaunch} onOpenRecent={openRecent} />
          )}
        </section>
      )}

      {view === "settings" && (
        <section className="main">
          <Settings dangerSandbox={dangerSandbox} onDangerChange={setDangerSandbox} defaultNetwork={defaultNetwork} onNetworkChange={setDefaultNetwork} />
        </section>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <LangProvider>
        <Shell />
      </LangProvider>
    </ThemeProvider>
  );
}
