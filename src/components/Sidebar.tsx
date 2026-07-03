import type { SkillDescriptor } from "../types/skill";
import type { LaunchSpec } from "../useRun";
import { useI18n } from "../i18n";
import { useTheme } from "../theme";
import { skillName, skillGroup } from "../skillsMeta";
import { Icon } from "../icons";

export type ViewName = "home" | "newtask" | "run" | "settings" | "traces";

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
  view: ViewName;
  recent: RecentItem[];
  onView: (v: ViewName) => void;
  onOpenSkill: (s: SkillDescriptor) => void;
  onOpenRecent: (r: RecentItem) => void;
}

const GROUP_RANK: Record<string, number> = { searchRead: 0, writePolish: 1, figData: 2, reviewResp: 3, convert: 4 };

export default function Sidebar({ skills, view, recent, onView, onOpenSkill, onOpenRecent }: Props) {
  const { t, lang, pref: langPref, setPref: setLangPref } = useI18n();
  const { theme, pref: themePref, setPref: setThemePref } = useTheme();

  const ordered = [...skills].sort((a, b) => (GROUP_RANK[skillGroup(a.id)] ?? 9) - (GROUP_RANK[skillGroup(b.id)] ?? 9));

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark"><Icon name="leaf" /></div>
        <div className="brand-name">Nature <span className="dim">App</span></div>
      </div>

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
              <span className="nav-text"><span className="nav-zh">{skillName(s.id, lang, s.name)}</span></span>
            </button>
          ))}
        </div>
      </nav>

      <div className="side-foot">
        <button className={"side-action" + (view === "traces" ? " active" : "")} onClick={() => onView("traces")}>
          <Icon name="clock" /><span>{lang === "zh" ? "执行日志" : "Trace Logs"}</span>
        </button>
        <button className={"side-action" + (view === "settings" ? " active" : "")} onClick={() => onView("settings")}>
          <Icon name="gear" /><span>{t("common.settings")}</span>
        </button>
        <button className="side-action" onClick={() => setThemePref(
          themePref === "dark" ? "light" : themePref === "light" ? "system" : "dark"
        )} title={t("settings.appearance")}>
          <Icon name={theme === "dark" ? "moon" : "sun"} /><span>{themePref === "system" ? t("settings.system") : themePref === "dark" ? t("settings.dark") : t("settings.light")}</span>
        </button>
        <button className="side-action" onClick={() => setLangPref(
          langPref === "zh" ? "en" : langPref === "en" ? "system" : "zh"
        )} title={t("settings.language")}>
          <Icon name="globe" /><span>{langPref === "system" ? t("settings.system") : langPref === "zh" ? "中文" : "English"}</span>
        </button>
      </div>
    </aside>
  );
}
