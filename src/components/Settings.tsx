import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useI18n, type LangPref } from "../i18n";
import { useTheme, type ThemePref } from "../theme";
import { Icon } from "../icons";
import type { DoctorController } from "../useDoctor";

interface Props {
  doctor: DoctorController;
  dangerSandbox: boolean;
  onDangerChange: (v: boolean) => void;
  defaultNetwork: boolean;
  onNetworkChange: (v: boolean) => void;
}

export default function Settings({ doctor, dangerSandbox, onDangerChange, defaultNetwork, onNetworkChange }: Props) {
  const { t, lang, pref: langPref, setPref: setLangPref } = useI18n();
  const { pref: themePref, setPref: setThemePref } = useTheme();

  const [preparing, setPreparing] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [acBusy, setAcBusy] = useState(false);
  const [acErr, setAcErr] = useState<string | null>(null);
  const [mcpOpen, setMcpOpen] = useState(false);

  // 首次进设置异步探测一次(check_doctor + get_setup_status);之后读 App 层缓存,秒开不重探
  useEffect(() => { doctor.ensureLoaded(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rep = doctor.doctor;
  const setup = doctor.setup;
  const acRegistered = doctor.acRegistered;
  const setupFailed = !!setup && (setup.skills.includes("失败") || setup.pyenv.includes("失败") || /fail|error/i.test(setup.skills) || /fail|error/i.test(setup.pyenv));
  const recheckLabel = lang === "zh" ? "重新检测" : "Re-check";

  async function prepare() {
    setPreparing(true);
    try { await invoke("prepare_pyenv"); } catch { /* shown via doctor */ }
    setPreparing(false);
    doctor.refresh();
  }

  async function syncSkills() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const n = await invoke<number>("install_skills");
      setSyncMsg(n === 0 ? t("settings.upToDate") : t("settings.syncedN", { n }));
    } catch (e) {
      setSyncMsg(t("settings.opFailed", { msg: String(e) }));
    }
    setSyncing(false);
  }

  function toggleMcp() {
    const next = !mcpOpen;
    setMcpOpen(next);
    if (next) doctor.checkAcademic(); // 仅在展开时才派生 codex mcp list
  }

  async function registerAcademic() {
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      setAcErr(t("settings.emailInvalid"));
      return;
    }
    setAcBusy(true);
    setAcErr(null);
    try {
      await invoke("register_academic_search", { email: em });
      doctor.setAcRegistered(true);
    } catch (e) {
      setAcErr(String(e));
    }
    setAcBusy(false);
  }

  function toggleDanger(next: boolean) {
    if (next && !window.confirm(t("settings.dangerConfirm"))) return;
    onDangerChange(next);
  }

  const dot = (ok: boolean) => <span className={"dot " + (ok ? "ok" : "err")} />;

  return (
    <div className="scroll-area">
      <div className="page narrow">
        <span className="eyebrow" style={{ display: "block", marginBottom: 8 }}>{t("settings.eyebrow")}</span>
        <h1 className="h-title" style={{ fontSize: 24, margin: "0 0 22px" }}>{t("settings.title")}</h1>

        {setupFailed && (
          <div className="load-error" style={{ borderColor: "var(--warn)", background: "var(--warn-soft)", color: "var(--warn)", marginBottom: 16 }}>
            {t("settings.setupWarn")}
          </div>
        )}

        {/* Codex 引擎 */}
        <div className="panel">
          <div className="panel-head">
            <span className="p-ico"><Icon name="bolt" /></span>
            <div><h3>{t("settings.codexEngine")}</h3><div className="p-sub">{t("settings.codexSub")}</div></div>
            <span className="spacer" />
            <button className="pick-btn" onClick={() => doctor.refresh()} disabled={doctor.loading} title={recheckLabel}>
              <Icon name="refresh" />{doctor.loading ? t("settings.checking") : recheckLabel}
            </button>
            {rep && <span className={"status-pill " + (rep.engine.loggedIn ? "done" : "err")}>{rep.engine.loggedIn ? t("status.ready") : t("status.notSignedIn")}</span>}
          </div>
          <div className="panel-body">
            {!rep ? <div className="dr"><span className="dim">{t("settings.checking")}</span></div> : <>
              <div className="dr">{dot(rep.engine.loggedIn)}<span className="k">{t("settings.signin")}</span><span className="v">{rep.engine.loggedIn ? t("status.signedIn") : t("settings.notSignedInHint")}</span></div>
              <div className="dr">{dot(!!rep.engine.version)}<span className="k">{t("settings.version")}</span><span className="v">{rep.engine.version ?? t("settings.notFound")}</span></div>
              <div className="dr">{dot(true)}<span className="k">{t("settings.path")}</span><span className="v muted">{rep.engine.bin}</span></div>
            </>}
          </div>
        </div>

        {/* Python(uv) */}
        {rep && (
          <div className="panel">
            <div className="panel-head"><span className="p-ico"><Icon name="code" /></span><div><h3>{t("settings.pythonEnv")}</h3><div className="p-sub">{t("settings.pythonSub")}</div></div></div>
            <div className="panel-body">
              <div className="dr">{dot(rep.pyenv.ready)}<span className="k">venv</span><span className="v muted">{rep.pyenv.venv}</span></div>
              <div className="dr">{dot(!!rep.pyenv.python)}<span className="k">{t("settings.python")}</span><span className="v">{rep.pyenv.python ?? t("settings.notFound")}</span></div>
              <div className="dr">{dot(!!rep.pyenv.uv)}<span className="k">uv</span><span className="v muted">{rep.pyenv.uv ?? t("settings.notFound")}</span></div>
            </div>
            <div className="panel-foot">
              <button className="pick-btn" onClick={prepare} disabled={preparing || !rep.pyenv.uv}>
                <Icon name="refresh" />{preparing ? t("settings.installing") : t("settings.installDeps")}
              </button>
              <span className="p-sub">{t("settings.installHint")}</span>
            </div>
          </div>
        )}

        {/* 外部工具 */}
        {rep && rep.tools.length > 0 && (
          <div className="panel">
            <div className="panel-head"><span className="p-ico"><Icon name="wrench" /></span><div><h3>{t("settings.externalTools")}</h3><div className="p-sub">{t("settings.toolsSub")}</div></div></div>
            <div className="panel-body">
              {rep.tools.map((tool) => (
                <div className="dr" key={tool.name}>{dot(tool.ok)}<span className="k">{tool.name}</span><span className="v muted">{tool.path ?? tool.hint ?? t("settings.notFound")}</span></div>
              ))}
            </div>
          </div>
        )}

        {/* 技能同步 */}
        <div className="panel">
          <div className="panel-head"><span className="p-ico"><Icon name="refresh" /></span><div><h3>{t("settings.skillSync")}</h3><div className="p-sub">{t("settings.skillSyncSub")}</div></div></div>
          <div className="panel-foot">
            <button className="pick-btn" onClick={syncSkills} disabled={syncing}><Icon name="refresh" />{syncing ? t("settings.syncing") : t("settings.checkSync")}</button>
            {syncMsg && <span className="p-sub">{syncMsg}</span>}
          </div>
        </div>

        {/* 文献检索 MCP(折叠,展开时才查 codex mcp list)*/}
        <div className="panel">
          <div className="panel-head" style={{ cursor: "pointer" }} onClick={toggleMcp}>
            <span className="p-ico"><Icon name="search" /></span>
            <div><h3>{t("settings.litMcp")}</h3><div className="p-sub">academic-search · arXiv / Crossref / PubMed</div></div>
            <span className="spacer" />
            {mcpOpen && (doctor.acChecking
              ? <span className="p-sub">{t("settings.checking")}</span>
              : acRegistered !== null && <span className={"status-pill " + (acRegistered ? "done" : "err")}>{acRegistered ? t("settings.registered") : t("settings.notRegistered")}</span>)}
            <Icon name={mcpOpen ? "chevronDown" : "chevronRight"} />
          </div>
          {mcpOpen && (
            <div className="panel-foot">
              <input className="refine-input" type="email" style={{ flex: "1 1 220px", border: "1px solid var(--border)", borderRadius: "var(--radius-xs)", background: "var(--bg)", color: "var(--text)", padding: "8px 10px", fontSize: 12.5 }} placeholder={t("settings.emailPh")} value={email} onChange={(e) => setEmail(e.target.value)} />
              <button className="pick-btn" onClick={registerAcademic} disabled={acBusy || !email.trim()}>{acBusy ? t("settings.registering") : acRegistered ? t("settings.reRegister") : t("settings.registerMcp")}</button>
              {acErr && <span className="p-sub warn-text">{acErr}</span>}
            </div>
          )}
        </div>

        {/* 偏好 */}
        <div className="panel">
          <div className="panel-head"><span className="p-ico"><Icon name="sliders" /></span><div><h3>{t("settings.prefs")}</h3><div className="p-sub">{t("settings.prefsSub")}</div></div></div>
          <div className="panel-body">
            <div className="pref-row">
              <div className="pk"><div className="t">{t("settings.language")}</div><div className="d">{t("settings.languageDesc")}</div></div>
              <div className="seg">
                {(["zh", "en", "system"] as LangPref[]).map((p) => (
                  <button key={p} className={langPref === p ? "on" : ""} onClick={() => setLangPref(p)}>
                    {p === "zh" ? "中文" : p === "en" ? "English" : t("settings.system")}
                  </button>
                ))}
              </div>
            </div>
            <div className="pref-row">
              <div className="pk"><div className="t">{t("settings.appearance")}</div><div className="d">{t("settings.appearanceDesc")}</div></div>
              <div className="seg">
                {(["dark", "light", "system"] as ThemePref[]).map((p) => (
                  <button key={p} className={themePref === p ? "on" : ""} onClick={() => setThemePref(p)}>
                    <Icon name={p === "dark" ? "moon" : p === "light" ? "sun" : "gear"} />
                    {p === "dark" ? t("settings.dark") : p === "light" ? t("settings.light") : t("settings.system")}
                  </button>
                ))}
              </div>
            </div>
            <div className="pref-row">
              <div className="pk"><div className="t">{t("settings.allowNetDefault")}</div><div className="d">{t("settings.allowNetDesc")}</div></div>
              <button className={"toggle" + (defaultNetwork ? " on" : "")} onClick={() => onNetworkChange(!defaultNetwork)}><span className="sw" /></button>
            </div>
          </div>
        </div>

        {/* 高级 */}
        <div className="panel danger-panel">
          <div className="panel-head"><span className="p-ico"><Icon name="warn" /></span><div><h3>{t("settings.advanced")}</h3><div className="p-sub">{t("settings.advancedSub")}</div></div></div>
          <div className="panel-body">
            <div className="pref-row" style={{ borderBottom: 0 }}>
              <div className="pk"><div className="t"><span className="warn-text">{t("settings.fullSandbox")}</span> (dangerFullAccess)</div><div className="d">{t("settings.fullSandboxDesc")}</div></div>
              <button className={"toggle" + (dangerSandbox ? " on" : "")} onClick={() => toggleDanger(!dangerSandbox)}><span className="sw" /></button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
