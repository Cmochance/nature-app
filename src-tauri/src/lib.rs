mod engine;
mod pyenv;
mod skills;

use engine::{DomainEvent, EngineState, EngineStatus, TaskSpec};
use skills::SkillDescriptor;
use tauri::ipc::Channel;

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
        .setup(|_app| {
            // 启动后台同步 bundled skills 到 ~/.codex/skills/(幂等,首启拷贝不阻塞窗口)。
            std::thread::spawn(|| {
                match skills::install_skills(&skills::skills_root()) {
                    Ok(n) => eprintln!("[nature-app] skills synced: {n} dir(s)"),
                    Err(e) => eprintln!("[nature-app] skills install failed: {e}"),
                }
            });
            // 后台自举 uv 隔离 Python 环境(首次下载 wheels 较慢;未就绪时 engine 回落系统 python)。
            std::thread::spawn(|| match pyenv::ensure_pyenv() {
                Ok(()) => eprintln!("[nature-app] pyenv ready"),
                Err(e) => eprintln!("[nature-app] pyenv setup skipped: {e}"),
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
            prepare_pyenv
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
