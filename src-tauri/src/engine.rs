//! Codex 桥接 + 编排层(M0 最小实现)。
//!
//! 设计依据见 docs/01-codex-spikes-results.md(codex 0.142.0-alpha.6 实测):
//! - `codex exec --json` 输出 JSONL;事件 thread.started/turn.*/item.*/error。
//! - exec **无 `--ask-for-approval`**,沙箱完全由 `--sandbox` 决定。
//! - stdin 必须给 EOF,否则 codex 挂起等输入(SPIKE-H)→ 故用 std::process 控制 stdin。
//! - item.type `file_change`(单数),payload `changes:[{path,kind}]`(SPIKE-B)。
//! - 用户全局 config 可能是 danger-full-access,故每次显式传 `--sandbox`。
//!
//! 注:spawn 在 Rust 侧(完全受信),不经 tauri shell 插件的 capability;
//! 也因 shell 插件 CommandChild 无法关闭 stdin 而改用 std::process。

use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::{Arc, Mutex};

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use uuid::Uuid;

/// 全局任务表(task_id → 子进程句柄),用于取消与回收。
#[derive(Default)]
pub struct EngineState {
    pub tasks: Arc<DashMap<String, Arc<Mutex<Child>>>>,
}

/// 前端传入的任务规格。
#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TaskSpec {
    /// 渲染好的指令(走 codex exec 的位置参数)。
    pub instruction: String,
    /// 工作目录 = 产物根(-C)。
    pub workdir: String,
    #[serde(default)]
    pub sandbox_tier: SandboxTier,
    #[serde(default)]
    pub model: Option<String>,
    /// 是否需要联网(workspace-write 下追加 network_access=true)。
    #[serde(default)]
    pub needs_network: bool,
    /// 注入 stdin 的上下文(SKILL.md 全文 / 文件清单 / 历史)。写完即关 stdin。
    #[serde(default)]
    pub stdin_context: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum SandboxTier {
    #[default]
    WorkspaceWrite,
    DangerFullAccess,
}

impl SandboxTier {
    fn as_flag(&self) -> &'static str {
        match self {
            SandboxTier::WorkspaceWrite => "workspace-write",
            SandboxTier::DangerFullAccess => "danger-full-access",
        }
    }
}

/// token 用量(字段名对齐 codex JSONL `usage`)。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct Usage {
    #[serde(default)]
    pub input_tokens: u64,
    #[serde(default)]
    pub cached_input_tokens: u64,
    #[serde(default)]
    pub output_tokens: u64,
    #[serde(default)]
    pub reasoning_output_tokens: u64,
}

/// 推给前端的领域事件(经 Channel)。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DomainEvent {
    Started { task_id: String, argv: Vec<String> },
    ThreadStarted { thread_id: String },
    TurnStarted,
    Reasoning { text: String },
    AssistantMessage { text: String },
    CommandRun { command: String, status: Option<String> },
    /// 产物发现:codex 改了文件。
    Artifact { path: String, change_kind: String },
    Plan { steps: serde_json::Value },
    TurnCompleted { usage: Usage },
    /// 容错透传:未知事件或解析失败,原样给前端控制台。
    Raw { codex_type: String, json: serde_json::Value },
    EngineError { class: String, message: String },
    Finished {
        outcome: String,
        exit_code: Option<i32>,
        thread_id: Option<String>,
        usage: Usage,
    },
}

/// 引擎自检结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub bin: String,
    pub version: Option<String>,
    pub logged_in: bool,
}

/// 解析 codex 可执行路径:env 覆盖 > Codex.app 内置(本机已验证 0.142)> PATH。
fn resolve_codex_bin() -> String {
    if let Ok(p) = std::env::var("NATURE_APP_CODEX_BIN") {
        if !p.is_empty() {
            return p;
        }
    }
    let app_bin = "/Applications/Codex.app/Contents/Resources/codex";
    if Path::new(app_bin).exists() {
        return app_bin.to_string();
    }
    "codex".to_string()
}

/// 由 TaskSpec 构造 `codex exec` argv(实测修正版)。
fn build_argv(spec: &TaskSpec, last_message_path: &str) -> Vec<String> {
    let mut a: Vec<String> = vec![
        "exec".into(),
        spec.instruction.clone(), // 位置参数 = 指令
        "--json".into(),
        "-C".into(),
        spec.workdir.clone(),
        "--skip-git-repo-check".into(),
        "--sandbox".into(),
        spec.sandbox_tier.as_flag().into(),
        "-o".into(),
        last_message_path.into(),
    ];
    if spec.needs_network && matches!(spec.sandbox_tier, SandboxTier::WorkspaceWrite) {
        a.push("-c".into());
        a.push("sandbox_workspace_write.network_access=true".into());
    }
    if let Some(m) = &spec.model {
        if !m.is_empty() {
            a.push("-m".into());
            a.push(m.clone());
        }
    }
    a
}

/// 启动一个 codex exec 任务,流式把事件推到 channel,立即返回 task_id(非阻塞)。
pub fn run_task(
    state: &EngineState,
    spec: TaskSpec,
    channel: Channel<DomainEvent>,
) -> Result<String, String> {
    let task_id = Uuid::new_v4().to_string();

    // task 私有目录,用于 -o last_message.txt
    let task_dir = std::env::temp_dir().join("nature-app").join(&task_id);
    std::fs::create_dir_all(&task_dir).map_err(|e| format!("create task dir: {e}"))?;
    let last_message_path = task_dir.join("last_message.txt").to_string_lossy().to_string();

    let bin = resolve_codex_bin();
    let argv = build_argv(&spec, &last_message_path);

    let mut cmd = Command::new(&bin);
    cmd.args(&argv);
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    // SPIKE-H:stdin 必须给 EOF。无 context → null(立即 EOF);有 context → piped,写完即 drop。
    if spec.stdin_context.is_some() {
        cmd.stdin(Stdio::piped());
    } else {
        cmd.stdin(Stdio::null());
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("spawn codex failed ({bin}): {e}"))?;

    // 写 stdin 上下文后立即关闭(drop writer)→ EOF
    if let Some(ctx) = &spec.stdin_context {
        if let Some(mut stdin) = child.stdin.take() {
            let _ = stdin.write_all(ctx.as_bytes());
            // stdin 在此作用域结束被 drop → 关闭写端
        }
    }

    let stdout = child.stdout.take().ok_or("no stdout pipe")?;
    let stderr = child.stderr.take().ok_or("no stderr pipe")?;

    channel
        .send(DomainEvent::Started {
            task_id: task_id.clone(),
            argv: argv.clone(),
        })
        .ok();

    let child_arc = Arc::new(Mutex::new(child));
    state.tasks.insert(task_id.clone(), child_arc.clone());

    // stderr:仅收集诊断(codex 往 stderr 写日志,不当错误)。
    std::thread::spawn(move || {
        let reader = BufReader::new(stderr);
        for _line in reader.lines().map_while(Result::ok) {
            // M0:暂不转发;后续可做诊断环形缓冲
        }
    });

    // stdout:逐行解析 JSONL → DomainEvent。
    let ch = channel.clone();
    let tasks = state.tasks.clone();
    let task_id2 = task_id.clone();
    let child_for_wait = child_arc.clone();
    std::thread::spawn(move || {
        let mut last_thread_id: Option<String> = None;
        let mut total_usage = Usage::default();

        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            if line.trim().is_empty() {
                continue;
            }
            for ev in map_line(&line, &mut last_thread_id, &mut total_usage) {
                ch.send(ev).ok();
            }
        }

        // 等待退出码
        let exit_code = {
            let mut c = child_for_wait.lock().unwrap();
            c.wait().ok().and_then(|s| s.code())
        };
        let outcome = if exit_code == Some(0) { "success" } else { "failure" };
        ch.send(DomainEvent::Finished {
            outcome: outcome.into(),
            exit_code,
            thread_id: last_thread_id.clone(),
            usage: total_usage.clone(),
        })
        .ok();
        tasks.remove(&task_id2);
    });

    Ok(task_id)
}

/// 一行 JSONL → 0..N 个 DomainEvent。容错:解析失败/未知类型降级为 Raw。
fn map_line(
    line: &str,
    last_thread_id: &mut Option<String>,
    total_usage: &mut Usage,
) -> Vec<DomainEvent> {
    let v: serde_json::Value = match serde_json::from_str(line) {
        Ok(v) => v,
        Err(_) => {
            return vec![DomainEvent::Raw {
                codex_type: "unparsed".into(),
                json: serde_json::Value::String(line.to_string()),
            }];
        }
    };
    let t = v.get("type").and_then(|x| x.as_str()).unwrap_or("");
    match t {
        "thread.started" => {
            let id = v
                .get("thread_id")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            *last_thread_id = Some(id.clone());
            vec![DomainEvent::ThreadStarted { thread_id: id }]
        }
        "turn.started" => vec![DomainEvent::TurnStarted],
        "turn.completed" => {
            let usage = v
                .get("usage")
                .and_then(|u| serde_json::from_value::<Usage>(u.clone()).ok())
                .unwrap_or_default();
            *total_usage = usage.clone();
            vec![DomainEvent::TurnCompleted { usage }]
        }
        "turn.failed" => {
            let msg = v
                .get("message")
                .and_then(|x| x.as_str())
                .unwrap_or("turn failed")
                .to_string();
            vec![DomainEvent::EngineError {
                class: "turnFailed".into(),
                message: msg,
            }]
        }
        "error" => {
            let msg = v
                .get("message")
                .and_then(|x| x.as_str())
                .unwrap_or("error")
                .to_string();
            vec![DomainEvent::EngineError {
                class: "engineError".into(),
                message: msg,
            }]
        }
        "item.started" | "item.completed" => map_item(&v, t == "item.completed"),
        other => vec![DomainEvent::Raw {
            codex_type: other.to_string(),
            json: v,
        }],
    }
}

/// item.* → DomainEvent。
fn map_item(v: &serde_json::Value, completed: bool) -> Vec<DomainEvent> {
    let item = match v.get("item") {
        Some(i) => i,
        None => return vec![],
    };
    let it = item.get("type").and_then(|x| x.as_str()).unwrap_or("");
    match it {
        "reasoning" => {
            if !completed {
                return vec![];
            }
            let text = item
                .get("text")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            vec![DomainEvent::Reasoning { text }]
        }
        "agent_message" => {
            if !completed {
                return vec![];
            }
            let text = item
                .get("text")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            vec![DomainEvent::AssistantMessage { text }]
        }
        "command_execution" => {
            let command = item
                .get("command")
                .and_then(|x| x.as_str())
                .unwrap_or("")
                .to_string();
            let status = item
                .get("status")
                .and_then(|x| x.as_str())
                .map(|s| s.to_string());
            vec![DomainEvent::CommandRun { command, status }]
        }
        // SPIKE-B:单数 file_change,payload changes:[{path,kind}]。
        "file_change" => {
            if !completed {
                return vec![];
            }
            let mut out = vec![];
            if let Some(changes) = item.get("changes").and_then(|c| c.as_array()) {
                for c in changes {
                    let path = c
                        .get("path")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    let change_kind = c
                        .get("kind")
                        .and_then(|x| x.as_str())
                        .unwrap_or("")
                        .to_string();
                    if !path.is_empty() {
                        out.push(DomainEvent::Artifact { path, change_kind });
                    }
                }
            }
            out
        }
        "plan" => {
            if !completed {
                return vec![];
            }
            let steps = item
                .get("steps")
                .cloned()
                .unwrap_or(serde_json::Value::Null);
            vec![DomainEvent::Plan { steps }]
        }
        other => vec![DomainEvent::Raw {
            codex_type: format!("item:{other}"),
            json: item.clone(),
        }],
    }
}

/// 取消任务:kill 子进程并从表中移除。
pub fn cancel_task(state: &EngineState, task_id: &str) {
    if let Some((_, child)) = state.tasks.remove(task_id) {
        if let Ok(mut c) = child.lock() {
            let _ = c.kill();
        }
    }
}

/// 引擎自检:codex 版本 + 登录态。
pub fn check_engine() -> EngineStatus {
    let bin = resolve_codex_bin();
    let version = Command::new(&bin)
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    // auth.json:$CODEX_HOME/auth.json 或 ~/.codex/auth.json
    let codex_home = std::env::var("CODEX_HOME").ok().unwrap_or_else(|| {
        std::env::var("HOME")
            .map(|h| format!("{h}/.codex"))
            .unwrap_or_default()
    });
    let logged_in = Path::new(&format!("{codex_home}/auth.json")).exists();

    EngineStatus {
        bin,
        version,
        logged_in,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn spec() -> TaskSpec {
        TaskSpec {
            instruction: "画一张图".into(),
            workdir: "/tmp/wd".into(),
            sandbox_tier: SandboxTier::WorkspaceWrite,
            model: None,
            needs_network: false,
            stdin_context: None,
        }
    }

    #[test]
    fn argv_has_corrected_flags() {
        let a = build_argv(&spec(), "/tmp/last.txt");
        // 实测修正:无 --ask-for-approval;必含 --json / --sandbox workspace-write / --skip-git-repo-check / -o / -C
        assert!(!a.iter().any(|x| x == "--ask-for-approval"));
        assert!(a.contains(&"--json".to_string()));
        assert_eq!(a[0], "exec");
        assert_eq!(a[1], "画一张图"); // 指令是位置参数
        let i = a.iter().position(|x| x == "--sandbox").unwrap();
        assert_eq!(a[i + 1], "workspace-write");
        assert!(a.contains(&"--skip-git-repo-check".to_string()));
        let o = a.iter().position(|x| x == "-o").unwrap();
        assert_eq!(a[o + 1], "/tmp/last.txt");
    }

    #[test]
    fn argv_network_toggle() {
        let mut s = spec();
        s.needs_network = true;
        let a = build_argv(&s, "/tmp/last.txt");
        let i = a.iter().position(|x| x == "-c").unwrap();
        assert_eq!(a[i + 1], "sandbox_workspace_write.network_access=true");
    }

    #[test]
    fn parse_thread_started() {
        let mut tid = None;
        let mut u = Usage::default();
        let evs = map_line(
            r#"{"type":"thread.started","thread_id":"abc-123"}"#,
            &mut tid,
            &mut u,
        );
        assert_eq!(tid.as_deref(), Some("abc-123"));
        assert!(matches!(&evs[0], DomainEvent::ThreadStarted { thread_id } if thread_id == "abc-123"));
    }

    #[test]
    fn parse_turn_completed_usage() {
        let mut tid = None;
        let mut u = Usage::default();
        let evs = map_line(
            r#"{"type":"turn.completed","usage":{"input_tokens":44467,"cached_input_tokens":27712,"output_tokens":74,"reasoning_output_tokens":31}}"#,
            &mut tid,
            &mut u,
        );
        assert_eq!(u.input_tokens, 44467);
        assert!(matches!(&evs[0], DomainEvent::TurnCompleted { usage } if usage.output_tokens == 74));
    }

    #[test]
    fn parse_file_change_singular() {
        // SPIKE-B 真实样本:单数 file_change,changes:[{path,kind}]
        let mut tid = None;
        let mut u = Usage::default();
        let evs = map_line(
            r#"{"type":"item.completed","item":{"id":"item_1","type":"file_change","changes":[{"path":"/tmp/wd/chart.png","kind":"add"}],"status":"completed"}}"#,
            &mut tid,
            &mut u,
        );
        assert_eq!(evs.len(), 1);
        match &evs[0] {
            DomainEvent::Artifact { path, change_kind } => {
                assert_eq!(path, "/tmp/wd/chart.png");
                assert_eq!(change_kind, "add");
            }
            _ => panic!("expected Artifact, got {:?}", evs[0]),
        }
    }

    #[test]
    fn parse_agent_message() {
        let mut tid = None;
        let mut u = Usage::default();
        let evs = map_line(
            r#"{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"已创建 chart.png"}}"#,
            &mut tid,
            &mut u,
        );
        assert!(matches!(&evs[0], DomainEvent::AssistantMessage { text } if text.contains("chart.png")));
    }

    #[test]
    fn unknown_type_becomes_raw() {
        let mut tid = None;
        let mut u = Usage::default();
        let evs = map_line(r#"{"type":"some.future.event","foo":1}"#, &mut tid, &mut u);
        assert!(matches!(&evs[0], DomainEvent::Raw { codex_type, .. } if codex_type == "some.future.event"));
    }

    #[test]
    fn malformed_line_becomes_raw() {
        let mut tid = None;
        let mut u = Usage::default();
        let evs = map_line("not json at all", &mut tid, &mut u);
        assert!(matches!(&evs[0], DomainEvent::Raw { codex_type, .. } if codex_type == "unparsed"));
    }
}
