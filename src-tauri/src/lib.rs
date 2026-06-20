mod acsearch;
mod engine;
mod pyenv;
mod renderer;
mod skills;

use engine::{DomainEvent, EngineState, EngineStatus, TaskSpec};
use serde::Serialize;
use skills::SkillDescriptor;
use std::path::Path;
use std::sync::{Arc, Mutex};
use tauri::ipc::Channel;
use tauri::Manager;

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
    let pandoc = find_bin(&["pandoc"], &["/opt/homebrew/bin/pandoc", "/usr/local/bin/pandoc"]);
    let pdflatex = find_bin(
        &["pdflatex"],
        &["/Library/TeX/texbin/pdflatex", "/usr/local/texlive/bin/pdflatex"],
    );
    let tools = vec![
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

/// 注册 academic-search MCP(免费源,需 PubMed 邮箱)。
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(EngineState::default())
        .manage(SetupState::default())
        .setup(|app| {
            let st = app.state::<SetupState>().0.clone();
            let st_py = st.clone();
            // 后台同步 bundled skills 到 ~/.codex/skills/(幂等,首启拷贝不阻塞窗口)。
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
            list_skills,
            install_skills,
            check_pyenv,
            prepare_pyenv,
            check_doctor,
            check_academic_search,
            register_academic_search,
            get_setup_status,
            renderer::preview_plot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
