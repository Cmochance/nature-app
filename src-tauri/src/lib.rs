mod acsearch;
mod engine;
mod pyenv;
mod renderer;
mod skills;
mod trace;

use engine::{DomainEvent, EngineState, EngineStatus, LoginEvent, LoginHandle, TaskSpec};
use serde::Serialize;
use skills::SkillDescriptor;
use std::fs;
use std::io::Write;
use std::path::Path;
use std::sync::atomic::Ordering;
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::Manager;
use trace::{TraceMetadata, TraceSummary, TraceWriter};

/// 首启自举(skills 同步 / pyenv 自建)的结果,供 UI 显示
/// (打包后 GUI 无终端,eprintln 用户看不到)。
#[derive(Default, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
struct SetupStatus {
    skills: String,
    pyenv: String,
}

#[derive(Default)]
struct SetupState(Arc<Mutex<SetupStatus>>);

#[derive(Default)]
struct LoginState(Arc<Mutex<Option<Arc<LoginHandle>>>>);

/// 单项工具体检结果。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct ToolCheck {
    name: String,
    ok: bool,
    path: Option<String>,
    hint: Option<String>,
}

/// 环境体检总报告。
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct DoctorReport {
    engine: EngineStatus,
    pyenv: pyenv::PyEnvStatus,
    tools: Vec<ToolCheck>,
}

/// 在 PATH 与常见位置查二进制(不 spawn,避免卡顿)。
fn find_bin(names: &[&str], extra: &[&str]) -> Option<String> {
    if let Ok(path) = std::env::var("PATH") {
        for dir in path.split(':') {
            for n in names {
                let p = Path::new(dir).join(n);
                if p.exists() {
                    return Some(p.to_string_lossy().to_string());
                }
            }
        }
    }
    for e in extra {
        if Path::new(e).exists() {
            return Some(e.to_string());
        }
    }
    None
}

/// 环境体检:codex / uv venv / 系统二进制。
#[tauri::command]
fn check_doctor() -> DoctorReport {
    let lo = find_bin(
        &["soffice", "libreoffice"],
        &["/Applications/LibreOffice.app/Contents/MacOS/soffice"],
    );
    let pandoc = find_bin(
        &["pandoc"],
        &["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"],
    );
    let pdflatex = find_bin(
        &["pdflatex"],
        &[
            "/Library/TeX/texbin/pdflatex",
            "/usr/local/texlive/bin/pdflatex",
        ],
    );
    // M0.5: 检测 R/Rscript (nature-figure 的 R backend 需要)
    let rpath = find_bin(
        &["R", "Rscript"],
        &["/Library/Frameworks/R.framework/Resources/bin/R"],
    );
    let tools = vec![
        ToolCheck {
            name: "matplotlib".into(),
            ok: pyenv::has_matplotlib(),
            path: None,
            hint: Some("科研绘图核心库;运行「预装依赖」可自动安装".into()),
        },
        ToolCheck {
            name: "seaborn".into(),
            ok: pyenv::has_seaborn(),
            path: None,
            hint: Some("高级统计可视化;运行「预装依赖」可自动安装".into()),
        },
        ToolCheck {
            name: "LibreOffice".into(),
            ok: lo.is_some(),
            path: lo,
            hint: Some("paper2ppt/docx 预览需要(可选);brew install --cask libreoffice".into()),
        },
        ToolCheck {
            name: "pandoc".into(),
            ok: pandoc.is_some(),
            path: pandoc,
            hint: Some("部分文档转换需要(可选);brew install pandoc".into()),
        },
        ToolCheck {
            name: "pdflatex".into(),
            ok: pdflatex.is_some(),
            path: pdflatex,
            hint: Some("LaTeX 排版校验需要(可选);安装 MacTeX/TeX Live".into()),
        },
        ToolCheck {
            name: "R / Rscript".into(),
            ok: rpath.is_some(),
            path: rpath,
            hint: Some("figure skill 的 R backend 需要(可选);brew install r".into()),
        },
    ];
    DoctorReport {
        engine: engine::check_engine(),
        pyenv: pyenv::status(),
        tools,
    }
}

/// 列出所有 nature-* skill(解析 bundled manifest + SKILL.md)。
#[tauri::command]
fn list_skills() -> Vec<SkillDescriptor> {
    skills::load_skills(&skills::skills_root())
}

/// 手动把 bundled skills 同步到 codex skills 目录(用于"检查上游更新")。
#[tauri::command]
fn install_skills() -> Result<usize, String> {
    skills::install_skills(&skills::skills_root())
}

/// uv 隔离 Python 环境状态。
#[tauri::command]
fn check_pyenv() -> pyenv::PyEnvStatus {
    pyenv::status()
}

/// 手动准备(创建+装包)uv 隔离 Python 环境。
#[tauri::command]
fn prepare_pyenv() -> Result<(), String> {
    pyenv::ensure_pyenv()
}

/// academic-search MCP 是否已注册进 codex。
#[tauri::command]
fn check_academic_search() -> bool {
    acsearch::is_registered()
}

/// 注册 academic-search MCP。
#[tauri::command]
fn register_academic_search(email: String) -> Result<(), String> {
    acsearch::register(&email)
}

/// 首启自举结果(skills/pyenv),供 Settings 显示失败原因。
#[tauri::command]
fn get_setup_status(state: tauri::State<SetupState>) -> SetupStatus {
    state.0.lock().map(|s| s.clone()).unwrap_or_default()
}

/// 启动一个 skill 任务,流式事件经 `on_event` Channel 推回前端,返回 task_id。
#[tauri::command]
fn run_skill_task(
    state: tauri::State<'_, EngineState>,
    spec: TaskSpec,
    on_event: Channel<DomainEvent>,
) -> Result<String, String> {
    engine::run_task(state.inner(), spec, on_event)
}

/// 取消任务。
#[tauri::command]
fn cancel_task(state: tauri::State<'_, EngineState>, task_id: String) -> Result<(), String> {
    engine::cancel_task(state.inner(), &task_id);
    Ok(())
}

/// 引擎自检:codex 版本 + 登录态。
#[tauri::command]
fn check_engine() -> EngineStatus {
    engine::check_engine()
}

/// 在隔离 CODEX_HOME 下登录(浏览器 OAuth);与本地 ~/.codex 互不影响。
#[tauri::command]
async fn codex_login(
    state: tauri::State<'_, LoginState>,
    on_event: Channel<LoginEvent>,
) -> Result<(), String> {
    let handle = tauri::async_runtime::spawn_blocking(move || engine::start_login(on_event))
        .await
        .map_err(|e| format!("login task join: {e}"))??;

    {
        let mut guard = state.0.lock().map_err(|e| format!("state lock: {e}"))?;
        *guard = Some(handle.clone());
    }

    // 等待进程退出
    let status = {
        let mut child = handle
            .child
            .lock()
            .map_err(|e| format!("child lock: {e}"))?;
        child
            .wait()
            .map_err(|e| format!("等待 codex login 结束失败: {e}"))?
    };

    {
        let mut guard = state.0.lock().map_err(|e| format!("state lock: {e}"))?;
        *guard = None;
    }

    if !status.success() {
        return Err("codex login 未成功".into());
    }

    Ok(())
}

#[tauri::command]
fn codex_login_cancel(state: tauri::State<'_, LoginState>) {
    if let Ok(guard) = state.0.lock() {
        if let Some(handle) = guard.as_ref() {
            handle.cancelled.store(true, Ordering::SeqCst);
            if let Ok(mut c) = handle.child.lock() {
                let _ = c.kill();
            }
        }
    }
}

// ==================== 审计追踪管理命令 ====================

/// 创建一个新的审计追踪(调用方传入 task_id/skill)。
#[tauri::command]
fn create_trace(instruction: String, workdir: String, sandbox_tier: String) -> TraceMetadata {
    let mut writer = TraceWriter::new(&instruction, &workdir, &sandbox_tier);
    writer.finalize();
    writer.metadata.clone()
}

/// 追加一条事件到当前追踪(接收原始 JSON 字符串,不做类型转换)。
#[tauri::command]
fn append_trace_event(trace_id: String, event_json: String) -> Result<(), String> {
    let events_path = get_traces_dir().join(&trace_id).join("events.jsonl");
    let mut f = fs::OpenOptions::new()
        .append(true)
        .create(true)
        .open(&events_path)
        .map_err(|e| format!("打开 events.jsonl: {e}"))?;
    writeln!(f, "{}", event_json.trim()).map_err(|e| e.to_string())?;
    Ok(())
}

/// 更新追踪的 metadata(设置 task_id, skill, outcome 等)。
#[tauri::command]
fn update_trace_metadata(trace_id: String, updates: TraceMetadata) -> Result<(), String> {
    let meta_path = get_traces_dir().join(&trace_id).join("metadata.json");
    let mut existing: TraceMetadata = fs::read_to_string(&meta_path)
        .ok()
        .and_then(|content| serde_json::from_str::<TraceMetadata>(&content).ok())
        .unwrap_or_default();

    if !updates.task_id.is_empty() {
        existing.task_id = updates.task_id;
    }
    if let Some(ref sid) = updates.skill_id {
        existing.skill_id = Some(sid.clone());
    }
    if let Some(ref sname) = updates.skill_name {
        existing.skill_name = Some(sname.clone());
    }
    if let Some(ref outcome) = updates.outcome {
        existing.outcome = Some(outcome.clone());
    }
    existing.exit_code = updates.exit_code.or(existing.exit_code);
    existing.finished_at = updates.finished_at.or(existing.finished_at);
    existing.input_tokens += updates.input_tokens;
    existing.output_tokens += updates.output_tokens;
    existing.errors.extend(updates.errors);
    existing.artifact_count = updates.artifact_count.max(existing.artifact_count);
    existing.can_retry |= updates.can_retry;

    let json = serde_json::to_string_pretty(&existing).map_err(|e| e.to_string())?;
    fs::write(&meta_path, json).map_err(|e| e.to_string())?;
    Ok(())
}

/// 列出所有追踪摘要(按时间倒序,最多返回 50 条)。
#[tauri::command]
fn list_all_traces(limit: Option<usize>) -> Vec<TraceSummary> {
    let mut traces = trace::list_traces();
    if let Some(n) = limit {
        traces.truncate(n);
    }
    traces
}

/// 获取某个追踪的事件列表(JSONL → Vec)。
#[tauri::command]
fn get_trace_events(trace_id: String) -> Result<Vec<String>, String> {
    let events_path = get_traces_dir().join(&trace_id).join("events.jsonl");
    let content = fs::read_to_string(&events_path).map_err(|e| e.to_string())?;
    let events: Vec<String> = content
        .lines()
        .filter(|l| !l.trim().is_empty())
        .map(|s| s.to_string())
        .collect();
    Ok(events)
}

fn get_traces_dir() -> std::path::PathBuf {
    std::path::PathBuf::from(std::env::var("HOME").unwrap_or_default())
        .join(".nature-app")
        .join("traces")
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(EngineState::default())
        .manage(SetupState::default())
        .manage(LoginState::default())
        .setup(|app| {
            let st = app.state::<SetupState>().0.clone();
            let st_py = st.clone();
            // 后台同步 bundled skills 到隔离 CODEX_HOME 的 skills/(幂等,首启拷贝不阻塞窗口)。
            std::thread::spawn(move || {
                let msg = match skills::install_skills(&skills::skills_root()) {
                    Ok(0) => "已是最新".to_string(),
                    Ok(n) => format!("已同步 {n} 个目录"),
                    Err(e) => format!("失败: {e}"),
                };
                eprintln!("[nature-app] skills: {msg}");
                if let Ok(mut s) = st.lock() {
                    s.skills = msg;
                }
            });
            // 后台自举 uv 隔离 Python(首次下载 wheels 较慢;未就绪时 engine 回落系统 python)。
            std::thread::spawn(move || {
                let msg = match pyenv::ensure_pyenv() {
                    Ok(()) => "就绪".to_string(),
                    Err(e) => format!("失败: {e}"),
                };
                eprintln!("[nature-app] pyenv: {msg}");
                if let Ok(mut s) = st_py.lock() {
                    s.pyenv = msg;
                }
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            run_skill_task,
            cancel_task,
            check_engine,
            codex_login,
            codex_login_cancel,
            list_skills,
            install_skills,
            check_pyenv,
            prepare_pyenv,
            check_doctor,
            check_academic_search,
            register_academic_search,
            get_setup_status,
            renderer::preview_plot,
            // 审计追踪管理
            create_trace,
            append_trace_event,
            update_trace_metadata,
            list_all_traces,
            get_trace_events,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
