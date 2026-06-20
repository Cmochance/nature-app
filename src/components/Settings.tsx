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
  const [preparing, setPreparing] = useState(false);
  const [prepErr, setPrepErr] = useState<string | null>(null);

  function refresh() {
    invoke<DoctorReport>("check_doctor").then(setDoctor).catch(() => setDoctor(null));
  }
  useEffect(() => refresh(), []);

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
