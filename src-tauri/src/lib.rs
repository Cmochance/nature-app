mod engine;

use engine::{DomainEvent, EngineState, EngineStatus, TaskSpec};
use tauri::ipc::Channel;

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
        .invoke_handler(tauri::generate_handler![
            run_skill_task,
            cancel_task,
            check_engine
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
