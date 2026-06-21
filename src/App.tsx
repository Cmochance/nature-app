import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { SkillDescriptor } from "./types/skill";
import type { PlotSpec, PlotData } from "./types/plot";
import { LangProvider, useI18n } from "./i18n";
import { ThemeProvider } from "./theme";
import { skillName } from "./skillsMeta";
import { useRun, type LaunchSpec } from "./useRun";
import Sidebar, { type ViewName, type RecentItem } from "./components/Sidebar";
import Home from "./components/Home";
import TaskConfig from "./components/TaskConfig";
import RunView from "./components/RunView";
import Settings from "./components/Settings";
import ChartEditor from "./components/ChartEditor";
import "./styles.css";

// 图表微调的演示数据:figure 任务未导出 plot_spec/plot_data 时的兜底。
const DEMO_XS = Array.from({ length: 21 }, (_, i) => +(i * 0.5).toFixed(1));
const DEMO_PLOT_SPEC: PlotSpec = {
  chart_type: "line",
  title: "Sample Data Visualization",
  x_label: "Time",
  y_label: "Amplitude",
  x_unit: "s",
  style: {
    figure_size: [8, 5], dpi: 150, font_family: "serif", font_size: 12,
    grid: true, grid_alpha: 0.3,
    legend: { enabled: true, location: "best" },
    spines: { enabled: true, width: 1.2, color: "#333" },
  },
};
const DEMO_PLOT_DATA: PlotData = {
  series: [
    { name: "sin", x: DEMO_XS, y: DEMO_XS.map((x) => +Math.sin(x).toFixed(4)), color: "#1a1a1a", line_width: 2.0, visible: true },
    { name: "cos", x: DEMO_XS, y: DEMO_XS.map((x) => +Math.cos(x).toFixed(4)), color: "#c73e3a", line_width: 1.5, visible: true },
  ],
};

function Shell() {
  const { t, lang } = useI18n();
  const [skills, setSkills] = useState<SkillDescriptor[]>([]);
  const [skillsError, setSkillsError] = useState<string | null>(null);

  const [view, setView] = useState<ViewName>("home");
  const [sel, setSel] = useState<SkillDescriptor | null>(null);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [editorParams, setEditorParams] = useState<{ spec: PlotSpec; data: PlotData } | null>(null);

  const [dangerSandbox, setDangerSandbox] = useState(false);
  const [defaultNetwork, setDefaultNetwork] = useState(true);

  const run = useRun({ dangerSandbox, lang, t });

  const idRef = useRef(0);
  const activeRunIdRef = useRef<string | null>(null);

  useEffect(() => {
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
    if (item.id === activeRunIdRef.current) { setView("run"); return; }
    startLaunch(item.spec);
  }

  function openEditor() {
    setEditorParams(run.plotParams ?? { spec: DEMO_PLOT_SPEC, data: DEMO_PLOT_DATA });
  }

  // 图表微调:全屏接管(ChartEditor 自带返回按钮)
  if (editorParams) {
    return (
      <div style={{ height: "100vh", display: "flex" }}>
        <ChartEditor initialSpec={editorParams.spec} initialData={editorParams.data} onBack={() => setEditorParams(null)} />
      </div>
    );
  }

  return (
    <div className="shell" data-view={view}>
      <Sidebar
        skills={skills}
        view={view}
        recent={recent}
        onView={setView}
        onOpenSkill={openSkill}
        onOpenRecent={openRecent}
      />

      {view === "run" && run.active && <RunView run={run} onOpenEditor={openEditor} />}

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
