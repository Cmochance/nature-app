import type { SkillDescriptor } from "../types/skill";
import type { EngineStatus } from "../types/engine";
import type { LaunchSpec } from "../useRun";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";
import { skillName, skillGroup } from "../skillsMeta";
import { Icon } from "../icons";

export type ViewName = "home" | "newtask" | "run" | "settings";

export interface RecentItem {
  id: string;
  title: string;
  skillId: string | null;
  skillName: string;
  running: boolean;
  at: string;
  spec: LaunchSpec;
}

interface Props {
  skills: SkillDescriptor[];
  engine: EngineStatus | null;
  view: ViewName;
  recent: RecentItem[];
  onView: (v: ViewName) => void;
  onNewTask: () => void;
  onOpenSkill: (s: SkillDescriptor) => void;
  onOpenRecent: (r: RecentItem) => void;
}

const GROUP_RANK: Record<string, number> = { searchRead: 0, writePolish: 1, figData: 2, reviewResp: 3, convert: 4 };

export default function Sidebar({ skills, engine, view, recent, onView, onNewTask, onOpenSkill, onOpenRecent }: Props) {
  const { t, lang } = useI18n();
  const { theme, setPref } = useTheme();

  const ordered = [...skills].sort((a, b) => (GROUP_RANK[skillGroup(a.id)] ?? 9) - (GROUP_RANK[skillGroup(b.id)] ?? 9));

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Icon name="leaf" /></div>
        <div className="brand-name">Nature <span className="dim">App</span></div>
      </div>

      <button className="new-task" onClick={onNewTask}>
        <Icon name="plus" />
        {t("common.newTask")}
      </button>
      <button className="search" type="button">
        <Icon name="search" />
        <span className="s-label">{t("common.search")}</span>
        <span className="kbd">⌘K</span>
      </button>

      <nav className="nav">
        <div className="nav-group">
          <button className={"nav-item" + (view === "home" ? " active" : "")} onClick={() => onView("home")}>
            <span className="nav-ico"><Icon name="home" /></span>
            <span className="nav-text">{t("nav.home")}</span>
          </button>
          <button className={"nav-item" + (view === "settings" ? " active" : "")} onClick={() => onView("settings")}>
            <span className="nav-ico"><Icon name="gear" /></span>
            <span className="nav-text">{t("nav.settings")}</span>
          </button>
        </div>

        {recent.length > 0 && (
          <div className="nav-group">
            <div className="nav-label">{t("nav.recent")} <span className="count">{recent.length}</span></div>
            {recent.map((r) => (
              <button key={r.id} className={"nav-item run-state"} onClick={() => onOpenRecent(r)}>
                {r.running ? <span className="live-dot" /> : <span className="nav-dot" />}
                <span className="nav-text">
                  <span>{r.title}</span>
                  <span className="nav-sub">{r.skillName} · {r.running ? t("status.running") : r.at}</span>
                </span>
              </button>
            ))}
          </div>
        )}

        <div className="nav-group">
          <div className="nav-label">{t("nav.skills")} <span className="count">{skills.length}</span></div>
          {ordered.map((s) => (
            <button key={s.id} className="nav-item" onClick={() => onOpenSkill(s)}>
              <span className={"nav-dot " + s.status} />
              <span className="nav-text">
                <span className="nav-zh">{skillName(s.id, lang, s.name)}</span>
                <span className="nav-id">{s.id.replace(/^nature-/, "")}</span>
              </span>
            </button>
          ))}
        </div>
      </nav>

      <div className="engine-bar">
        <div className="engine-row">
          <span className={"dot" + (engine?.loggedIn ? " ok" : "")} />
          {engine ? (engine.loggedIn ? t("engine.signedIn") : t("status.notSignedIn")) : t("engine.detecting")}
          {engine?.version && <span className="engine-ver">{engine.version}</span>}
        </div>
        <div className="engine-actions">
          <button className="icon-btn wide" onClick={() => onView("settings")} title={t("nav.settings")}>
            <Icon name="gear" /> {t("common.settings")}
          </button>
          <button className="icon-btn" onClick={() => setPref(theme === "dark" ? "light" : "dark")} title={t("settings.appearance")}>
            <Icon name={theme === "dark" ? "moon" : "sun"} />
          </button>
        </div>
      </div>
    </aside>
  );
}
