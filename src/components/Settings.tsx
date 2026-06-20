import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DoctorReport } from "../types/engine";

export default function Settings({
  dangerSandbox,
  onDangerChange,
}: {
  dangerSandbox: boolean;
  onDangerChange: (v: boolean) => void;
}) {
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [setup, setSetup] = useState<{ skills: string; pyenv: string } | null>(null);
  const [preparing, setPreparing] = useState(false);
  const [prepErr, setPrepErr] = useState<string | null>(null);

  // academic-search MCP
  const [email, setEmail] = useState("");
  const [acRegistered, setAcRegistered] = useState<boolean | null>(null);
  const [acBusy, setAcBusy] = useState(false);
  const [acErr, setAcErr] = useState<string | null>(null);

  function refresh() {
    invoke<DoctorReport>("check_doctor").then(setDoctor).catch(() => setDoctor(null));
    invoke<boolean>("check_academic_search").then(setAcRegistered).catch(() => setAcRegistered(null));
    invoke<{ skills: string; pyenv: string }>("get_setup_status").then(setSetup).catch(() => setSetup(null));
  }
  useEffect(() => refresh(), []);

  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);
  async function syncSkills() {
    setSyncing(true);
    setSyncMsg(null);
    try {
      const n = await invoke<number>("install_skills");
      setSyncMsg(n === 0 ? "已是最新(pinned 版未变)" : `已同步 ${n} 个目录到 ~/.codex/skills/`);
    } catch (e) {
      setSyncMsg("失败:" + String(e));
    }
    setSyncing(false);
  }

  async function registerAcademic() {
    const em = email.trim();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
      setAcErr("请输入有效邮箱(用于 PubMed 礼貌标识)");
      return;
    }
    setAcBusy(true);
    setAcErr(null);
    try {
      await invoke("register_academic_search", { email: email.trim() });
      setAcRegistered(true);
    } catch (e) {
      setAcErr(String(e));
    }
    setAcBusy(false);
  }

  async function prepare() {
    setPreparing(true);
    setPrepErr(null);
    try {
      await invoke("prepare_pyenv");
    } catch (e) {
      setPrepErr(String(e));
    }
    setPreparing(false);
    refresh();
  }

  function toggleDanger(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.checked;
    if (next) {
      const ok = window.confirm(
        "高级:全放开沙箱(danger-full-access)\n\ncodex 将不受文件/网络沙箱限制地执行命令。仅在你完全信任任务时启用。确定开启?"
      );
      if (!ok) return;
    }
    onDangerChange(next);
  }

  const row = (label: string, ok: boolean, detail?: string | null, hint?: string | null) => (
    <div className="doctor-row">
      <span className={ok ? "dot ok" : "dot err"} />
      <span className="d-label">{label}</span>
      <span className="d-detail">{detail || (ok ? "可用" : "未检测到")}</span>
      {!ok && hint && <span className="d-hint">{hint}</span>}
    </div>
  );

  return (
    <section className="settings">
      <h2>环境体检 / 设置</h2>

      {setup && (setup.skills.includes("失败") || setup.pyenv.includes("失败")) && (
        <div className="setup-warn">
          首启自举有失败:Skills「{setup.skills || "…"}」/ Python「{setup.pyenv || "…"}」。
          可在下方"Skills 同步"/"准备 Python 环境"重试。
        </div>
      )}

      {!doctor ? (
        <div className="dim">体检中…</div>
      ) : (
        <>
          <div className="doctor-block">
            <h3>引擎</h3>
            {row("Codex", doctor.engine.loggedIn, doctor.engine.version)}
            {row("登录状态", doctor.engine.loggedIn, doctor.engine.loggedIn ? "已登录" : "未登录", "运行 codex login")}
          </div>

          <div className="doctor-block">
            <h3>Python 隔离环境(uv)</h3>
            {row("uv", !!doctor.pyenv.uv, doctor.pyenv.uv, "安装 uv: curl -LsSf https://astral.sh/uv/install.sh | sh")}
            {row("隔离 venv", doctor.pyenv.ready, doctor.pyenv.ready ? doctor.pyenv.python ?? "就绪" : "未就绪")}
            {!doctor.pyenv.ready && (
              <div className="prep">
                <button className="primary" onClick={prepare} disabled={preparing || !doctor.pyenv.uv}>
                  {preparing ? "正在准备(下载 wheels)…" : "准备 Python 环境"}
                </button>
                {prepErr && <div className="err">失败:{prepErr}</div>}
              </div>
            )}
          </div>

          <div className="doctor-block">
            <h3>系统二进制(可选)</h3>
            {doctor.tools.map((t) => (
              <div key={t.name}>{row(t.name, t.ok, t.path, t.hint)}</div>
            ))}
          </div>
        </>
      )}

      <div className="doctor-block">
        <h3>Skills 同步</h3>
        <p className="dim small">把打包的 nature-skills(pinned 版)同步到 ~/.codex/skills/,供 codex 加载。</p>
        <div className="row">
          <button onClick={syncSkills} disabled={syncing}>
            {syncing ? "同步中…" : "检查 / 同步 skills"}
          </button>
          {syncMsg && <span className="dim small">{syncMsg}</span>}
        </div>
      </div>

      <div className="doctor-block">
        <h3>文献检索(academic-search MCP)</h3>
        {row(
          "MCP 注册",
          acRegistered === true,
          acRegistered === null ? "检测中…" : acRegistered ? "已注册" : "未注册"
        )}
        <p className="dim small">首版仅免费源(arXiv / Crossref / PubMed),只需一个邮箱(PubMed 礼貌用)。</p>
        <div className="row">
          <input
            className="refine-input"
            type="email"
            placeholder="you@example.com(PubMed 邮箱)"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
          <button className="primary" onClick={registerAcademic} disabled={acBusy || !email.trim()}>
            {acBusy ? "注册中…" : acRegistered ? "重新注册" : "注册 MCP"}
          </button>
        </div>
        {acErr && <div className="err small">失败:{acErr}</div>}
      </div>

      <div className="doctor-block">
        <h3>执行安全</h3>
        <label className="danger-toggle">
          <input type="checkbox" checked={dangerSandbox} onChange={toggleDanger} />
          <span>
            高级:全放开沙箱(danger-full-access)
            {dangerSandbox && <span className="warn"> ⚠ 已开启 —— codex 命令不受沙箱限制</span>}
          </span>
        </label>
        <p className="dim small">默认 workspace-write(只能在工作目录内写、默认断网),适合绝大多数任务。</p>
      </div>
    </section>
  );
}
