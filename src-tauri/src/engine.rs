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

use std::collections::{HashMap, HashSet, VecDeque};
use std::io::{BufRead, BufReader, Write};
use std::path::Path;
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant, SystemTime};

use dashmap::DashMap;
use serde::{Deserialize, Serialize};
use tauri::ipc::Channel;
use uuid::Uuid;

/// 轻量语义版本号(仅存 major.minor.patch,用于兼容性判断)。
#[derive(Debug, Clone, Default, Serialize)]
pub struct SemVer {
    pub major: u64,
    pub minor: u64,
    pub patch: u64,
}

impl std::fmt::Display for SemVer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "{}.{}.{}", self.major, self.minor, self.patch)
    }
}

/// 解析 codex 的版本字符串为 SemVer(如 "codex 0.142.0-alpha.6" → 0.142.0)。
/// 失败时返回全零表示未知。
pub fn parse_codex_version(raw: &str) -> SemVer {
    // 找形如 X.Y.Z 的模式(第一个包含两个点号的词段)
    for token in raw.split_whitespace() {
        let parts: Vec<&str> = token.split('.').collect();
        if parts.len() >= 3 {
            if let (Ok(maj), Ok(min), Ok(pat)) = (
                parts[0].parse::<u64>(),
                parts[1].parse::<u64>(),
                parts[2].parse::<u64>(),
            ) {
                return SemVer {
                    major: maj,
                    minor: min,
                    patch: pat,
                };
            }
        }
        // 也兼容 X.Y 格式
        if parts.len() == 2 {
            if let (Ok(maj), Ok(min)) = (parts[0].parse::<u64>(), parts[1].parse::<u64>()) {
                return SemVer {
                    major: maj,
                    minor: min,
                    patch: 0,
                };
            }
        }
    }
    SemVer::default()
}

/// 判断是否需要使用兼容旧版解析策略。
/// Codex < 0.145 可能在 item.started/completed 之间不携带完整 payload，
/// 需要更多依赖 turn.completed 来聚合信息。
pub fn needs_legacy_parsing(ver: &SemVer) -> bool {
    ver.major == 0 && ver.minor < 145
}

/// 单个任务的句柄:子进程 + 取消标志。
pub struct TaskHandle {
    pub child: Mutex<Child>,
    pub cancelled: AtomicBool,
}

/// 全局任务表(task_id → 句柄),用于取消与回收。
#[derive(Default)]
pub struct EngineState {
    pub tasks: Arc<DashMap<String, Arc<TaskHandle>>>,
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
    /// 使用兼容旧版解析策略(对应 Codex < 0.145 输出格式)。
    #[serde(default)]
    #[allow(dead_code)]
    pub use_legacy_parser: bool,
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
// 注:enum 级 rename_all 只改变体名(kind 值),不改变体内字段名。
// 含多词字段的变体需单独标注 rename_all,否则字段会以 snake_case 漏给前端。
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum DomainEvent {
    #[serde(rename_all = "camelCase")]
    Started {
        task_id: String,
        argv: Vec<String>,
    },
    #[serde(rename_all = "camelCase")]
    ThreadStarted {
        thread_id: String,
    },
    TurnStarted,
    Reasoning {
        text: String,
    },
    AssistantMessage {
        text: String,
    },
    CommandRun {
        command: String,
        status: Option<String>,
    },
    /// 产物发现:codex 改了文件。
    #[serde(rename_all = "camelCase")]
    Artifact {
        path: String,
        change_kind: String,
    },
    Plan {
        steps: serde_json::Value,
    },
    /// 轻量进度(如 todo_list 更新),不刷屏。
    Progress {
        text: String,
    },
    TurnCompleted {
        usage: Usage,
    },
    /// 容错透传:未知事件或解析失败,原样给前端控制台。
    #[serde(rename_all = "camelCase")]
    Raw {
        codex_type: String,
        json: serde_json::Value,
    },
    EngineError {
        class: String,
        message: String,
    },
    #[serde(rename_all = "camelCase")]
    Finished {
        outcome: String, // success | failure | cancelled
        exit_code: Option<i32>,
        thread_id: Option<String>,
        usage: Usage,
        artifact_count: usize,
        /// 错误可自动重试(如网络超时),前端据此显示「重试」按钮。
        can_retry: bool,
    },
}

/// 引擎自检结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct EngineStatus {
    pub bin: String,
    /// 原始版本字符串(如 "codex 0.142.0-alpha.6")。
    pub version: Option<String>,
    /// 解析后的语义版本号。
    pub semver: Option<SemVer>,
    /// 是否需要使用兼容旧版解析策略。
    pub needs_legacy_parsing: bool,
    pub logged_in: bool,
}

/// 解析 codex 可执行路径:env 覆盖 > 打包 sidecar(与主程序同目录)> Codex.app(本机开发兜底)> PATH。
pub fn resolve_codex_bin() -> String {
    if let Ok(p) = std::env::var("NATURE_APP_CODEX_BIN") {
        if !p.is_empty() {
            return p;
        }
    }
    // 打包的 sidecar:Tauri externalBin 去掉 target 后缀后置于主程序同目录的 codex
    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            let side = dir.join(if cfg!(windows) { "codex.exe" } else { "codex" });
            if side.exists() {
                return side.to_string_lossy().to_string();
            }
        }
    }
    let app_bin = "/Applications/Codex.app/Contents/Resources/codex";
    if Path::new(app_bin).exists() {
        return app_bin.to_string();
    }
    "codex".to_string()
}

/// 项目专属 CODEX_HOME —— 与本地 `~/.codex` 隔离,避免登录/skills/MCP/配置交叉。
/// 默认 `~/.nature-app/codex-home`,可被 `NATURE_APP_CODEX_HOME` 覆盖。
/// 所有对 codex 的调用(exec / 探测 / mcp / login)都应经此。
pub fn codex_home() -> std::path::PathBuf {
    if let Ok(p) = std::env::var("NATURE_APP_CODEX_HOME") {
        if !p.is_empty() {
            return std::path::PathBuf::from(p);
        }
    }
    std::path::PathBuf::from(std::env::var("HOME").unwrap_or_default())
        .join(".nature-app")
        .join("codex-home")
}

/// 构造一个已设隔离 `CODEX_HOME` 的 codex `Command`(并确保该目录存在)。
/// 统一入口,确保所有 codex 子进程都用项目自己的配置环境。
pub fn codex_command() -> Command {
    let home = codex_home();
    let _ = std::fs::create_dir_all(&home);
    let mut c = Command::new(resolve_codex_bin());
    c.env("CODEX_HOME", &home);
    c
}

/// 从单行文本中提取 URL(简单的 https/http 开头匹配)。
fn extract_url(s: &str) -> Option<String> {
    s.split_whitespace()
        .find(|w| w.starts_with("https://") || w.starts_with("http://"))
        .map(|w| w.to_string())
}

/// 登录流事件。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase", tag = "type", content = "data")]
pub enum LoginEvent {
    /// 提取到的 OAuth 授权 URL。
    Url(String),
    /// 其他 stdout/stderr 输出(供日志展示)。
    Message(String),
    /// 登录完成。
    Done { ok: bool, error: Option<String> },
}

/// 登录进程句柄。
pub struct LoginHandle {
    pub child: Mutex<Child>,
    pub cancelled: AtomicBool,
}

/// 在隔离 CODEX_HOME 下启动 `codex login`(浏览器 OAuth)。
/// 流式读取 stdout/stderr 并通过 channel 回传 URL/日志。
/// 与本地 ~/.codex 登录互不影响。
pub fn start_login(channel: Channel<LoginEvent>) -> Result<Arc<LoginHandle>, String> {
    let mut cmd = codex_command();
    cmd.arg("login");
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());

    let child = cmd
        .spawn()
        .map_err(|e| format!("启动 codex login 失败: {e}"))?;

    let handle = Arc::new(LoginHandle {
        child: Mutex::new(child),
        cancelled: AtomicBool::new(false),
    });

    // stdout 读取线程
    let h = handle.clone();
    let ch = channel.clone();
    std::thread::spawn(move || {
        if let Some(stdout) = h.child.lock().ok().and_then(|mut c| c.stdout.take()) {
            let reader = BufReader::new(stdout);
            for line in reader.lines().map_while(Result::ok) {
                if h.cancelled.load(Ordering::SeqCst) {
                    break;
                }
                if let Some(url) = extract_url(&line) {
                    let _ = ch.send(LoginEvent::Url(url));
                } else {
                    let _ = ch.send(LoginEvent::Message(line));
                }
            }
        }
    });

    // stderr 读取线程
    let h = handle.clone();
    let ch = channel.clone();
    std::thread::spawn(move || {
        if let Some(stderr) = h.child.lock().ok().and_then(|mut c| c.stderr.take()) {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                if h.cancelled.load(Ordering::SeqCst) {
                    break;
                }
                if let Some(url) = extract_url(&line) {
                    let _ = ch.send(LoginEvent::Url(url));
                } else {
                    let _ = ch.send(LoginEvent::Message(line));
                }
            }
        }
    });

    // 超时看门狗(5 分钟)
    const TIMEOUT_SECS: u64 = 300;
    let h = handle.clone();
    let ch = channel.clone();
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_secs(TIMEOUT_SECS));
        if h.cancelled.load(Ordering::SeqCst) {
            return;
        }
        if let Ok(mut c) = h.child.lock() {
            if matches!(c.try_wait(), Ok(None)) {
                let _ = c.kill();
                let _ = ch.send(LoginEvent::Done {
                    ok: false,
                    error: Some(format!("codex login 超时(超过 {TIMEOUT_SECS} 秒)")),
                });
            }
        }
    });

    Ok(handle)
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
        // 让 codex 运行的子进程(python 等)继承我们注入的 env
        // (MPL/fontconfig 缓存重定向、PATH),避免沙箱内 matplotlib abort。
        "-c".into(),
        "shell_environment_policy.inherit=all".into(),
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
    let last_message_path = task_dir
        .join("last_message.txt")
        .to_string_lossy()
        .to_string();

    let argv = build_argv(&spec, &last_message_path);

    // 缓存重定向:workspace-write 沙箱拦了 ~/.cache 写入,会让 matplotlib/fontconfig
    // abort(实测)。把缓存指到工作目录下的隐藏目录(沙箱内必可写,且被快照扫描跳过)。
    let cache_root = Path::new(&spec.workdir).join(".nature-cache");
    std::fs::create_dir_all(cache_root.join("mpl")).ok();

    // spawn 前快照工作目录,用于兜底发现 shell 命令(如 matplotlib)写出的产物。
    let before = snapshot_dir(Path::new(&spec.workdir));

    let mut cmd = codex_command();
    cmd.args(&argv);
    cmd.env("MPLBACKEND", "Agg");
    cmd.env("MPLCONFIGDIR", cache_root.join("mpl"));
    cmd.env("XDG_CACHE_HOME", &cache_root);
    // uv 隔离环境就绪时前置其 bin 到 PATH → codex 跑的 python3 解析到稳定 pinned 版,
    // 而非系统 3.14(配合 -c shell_environment_policy.inherit=all 透传)。
    if let Some(vbin) = crate::pyenv::venv_bin_if_ready() {
        let path = std::env::var("PATH").unwrap_or_default();
        cmd.env("PATH", format!("{vbin}:{path}"));
    }
    cmd.stdout(Stdio::piped());
    cmd.stderr(Stdio::piped());
    // SPIKE-H:stdin 必须给 EOF。无 context → null(立即 EOF);有 context → piped,写完即 drop。
    if spec.stdin_context.is_some() {
        cmd.stdin(Stdio::piped());
    } else {
        cmd.stdin(Stdio::null());
    }

    let mut child = cmd.spawn().map_err(|e| {
        format!("无法启动 codex sidecar(请重新构建应用,或运行 scripts/fetch-codex.sh 重拉): {e}")
    })?;

    // stdin:写上下文用独立线程,避免大上下文(SKILL.md 常 >64KB)+ 满管道时
    // 同步写在读 stdout 之前导致的经典 pipe 死锁。写失败上报而非静默吞掉。
    if let Some(ctx) = spec.stdin_context.clone() {
        if let Some(mut stdin) = child.stdin.take() {
            let stdin_ch = channel.clone();
            std::thread::spawn(move || {
                if let Err(e) = stdin.write_all(ctx.as_bytes()) {
                    stdin_ch
                        .send(DomainEvent::EngineError {
                            class: "engineError".into(),
                            message: format!("写入任务上下文失败: {e}"),
                        })
                        .ok();
                }
                // stdin 在此 drop → EOF
            });
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

    let handle = Arc::new(TaskHandle {
        child: Mutex::new(child),
        cancelled: AtomicBool::new(false),
    });
    state.tasks.insert(task_id.clone(), handle.clone());

    // stderr:收集尾部 N 行到环形缓冲(诊断 + 失败时作为原因分类),不再整段丢弃。
    let stderr_buf = Arc::new(Mutex::new(VecDeque::<String>::with_capacity(64)));
    {
        let buf = stderr_buf.clone();
        std::thread::spawn(move || {
            let reader = BufReader::new(stderr);
            for line in reader.lines().map_while(Result::ok) {
                if let Ok(mut b) = buf.lock() {
                    if b.len() >= 64 {
                        b.pop_front();
                    }
                    b.push_back(line);
                }
            }
        });
    }

    let workdir = spec.workdir.clone();
    let task_dir_cleanup = task_dir.clone();

    // 活动跟踪(用于看门狗空闲计时)
    let last_activity = Arc::new(Mutex::new(Instant::now()));

    // 无活动看门狗:进程仍存活且长时间无新事件才 kill。采用两阶段策略:
    // 第一阶段(空闲 4min)发 Progress 警告让用户知道还在等;第二阶段(空闲 8min)才真正终止。
    // 用 try_wait 判活,避免误杀正在收尾或正常长跑的任务。
    {
        let wd_handle = handle.clone();
        let wd_activity = last_activity.clone();
        let wd_tasks = state.tasks.clone();
        let wd_id = task_id.clone();
        let wd_ch = channel.clone();
        std::thread::spawn(move || {
            const WARN_LIMIT_SECS: u64 = 240; // 4 分钟 → 警告
            const KILL_LIMIT_SECS: u64 = 480; // 8 分钟 → 终止
            loop {
                std::thread::sleep(Duration::from_secs(15));
                if !wd_tasks.contains_key(&wd_id) {
                    break; // 任务已结束并移除
                }
                let still_running = wd_handle
                    .child
                    .lock()
                    .map(|mut c| matches!(c.try_wait(), Ok(None)))
                    .unwrap_or(false);
                if !still_running {
                    break; // 进程已退出,交给 stdout 线程收尾
                }
                let idle = wd_activity
                    .lock()
                    .map(|t| t.elapsed().as_secs())
                    .unwrap_or(0);
                if idle > WARN_LIMIT_SECS && idle <= KILL_LIMIT_SECS {
                    // 只发一次警告
                    if idle < WARN_LIMIT_SECS + 15 {
                        let _ = wd_ch.send(DomainEvent::Progress {
                            text: format!("⏳ 运行中,请稍候...已等待 {} 秒", idle),
                        });
                    }
                }
                if idle > KILL_LIMIT_SECS {
                    wd_handle.cancelled.store(true, Ordering::SeqCst);
                    wd_ch
                        .send(DomainEvent::EngineError {
                            class: "timeout".into(),
                            message: format!("超过 {KILL_LIMIT_SECS}s 无新事件,已终止任务。可在设置页检查环境后重试。"),
                        })
                        .ok();
                    if let Ok(mut c) = wd_handle.child.lock() {
                        let _ = c.kill();
                    }
                    break;
                }
            }
        });
    }

    // stdout:逐行解析 JSONL → DomainEvent;此线程是唯一负责 wait + 收尾 + remove 的 owner。
    let ch = channel.clone();
    let tasks = state.tasks.clone();
    let task_id2 = task_id.clone();
    let wait_handle = handle.clone();
    let activity = last_activity.clone();
    std::thread::spawn(move || {
        let mut last_thread_id: Option<String> = None;
        let mut total_usage = Usage::default();
        let mut emitted_artifacts: HashSet<String> = HashSet::new();

        let reader = BufReader::new(stdout);
        for line in reader.lines() {
            let line = match line {
                Ok(l) => l,
                Err(_) => break,
            };
            if line.trim().is_empty() {
                continue;
            }
            if let Ok(mut a) = activity.lock() {
                *a = Instant::now();
            }
            for ev in map_line(&line, &mut last_thread_id, &mut total_usage) {
                if let DomainEvent::Artifact { path, .. } = &ev {
                    emitted_artifacts.insert(path.clone());
                }
                ch.send(ev).ok();
            }
        }

        // 等待退出码(锁/wait 全容错,不 unwrap,避免线程 panic 卡死 UI)。
        let exit_code = wait_handle
            .child
            .lock()
            .ok()
            .and_then(|mut c| c.wait().ok())
            .and_then(|s| s.code());

        // 快照 diff 兜底:捕获 shell 命令(matplotlib 等)写出、不发 file_change 的产物。
        let after = snapshot_dir(Path::new(&workdir));
        let mut diff_paths: Vec<String> = after
            .iter()
            .filter(|(p, m)| before.get(*p).map(|b| b != *m).unwrap_or(true))
            .map(|(p, _)| p.clone())
            .filter(|p| !emitted_artifacts.contains(p))
            .collect();
        diff_paths.sort();
        for p in diff_paths {
            emitted_artifacts.insert(p.clone());
            ch.send(DomainEvent::Artifact {
                path: p,
                change_kind: "add".into(),
            })
            .ok();
        }

        let cancelled = wait_handle.cancelled.load(Ordering::SeqCst);
        // 失败且非取消 → 把 stderr 尾部作为原因分类发出(否则用户只见 failure 零信息)。
        if !cancelled && exit_code != Some(0) {
            let tail = stderr_buf
                .lock()
                .map(|b| b.iter().cloned().collect::<Vec<_>>().join("\n"))
                .unwrap_or_default();
            if !tail.trim().is_empty() {
                ch.send(DomainEvent::EngineError {
                    class: classify_stderr(&tail),
                    message: tail,
                })
                .ok();
            }
        }

        let outcome = if cancelled {
            "cancelled"
        } else if exit_code == Some(0) {
            "success"
        } else {
            "failure"
        };

        // 判断错误是否可重试
        let can_retry = if outcome == "failure" && !cancelled {
            // 在 finished 之前,stderr 已经被 classify 过了,但这里没有 class。
            // 所以我们用另一个标志位:如果 stderr 包含 network/timeout 关键词则标记为可重试
            let tail = stderr_buf
                .lock()
                .map(|b| b.iter().cloned().collect::<Vec<_>>().join("\n"))
                .unwrap_or_default();
            is_retryable_error(&classify_stderr(&tail))
        } else {
            false
        };

        ch.send(DomainEvent::Finished {
            outcome: outcome.into(),
            exit_code,
            thread_id: last_thread_id.clone(),
            usage: total_usage.clone(),
            artifact_count: emitted_artifacts.len(),
            can_retry,
        })
        .ok();

        tasks.remove(&task_id2);
        let _ = std::fs::remove_dir_all(&task_dir_cleanup); // 清理 temp 目录,避免堆积
    });

    Ok(task_id)
}

/// 根据 stderr 尾部内容粗分类,激活前端对应 CTA。
fn classify_stderr(s: &str) -> String {
    let l = s.to_lowercase();
    if l.contains("not logged in")
        || l.contains("please run codex login")
        || l.contains("unauthorized")
        || l.contains("401")
    {
        "notLoggedIn".into()
    } else if l.contains("failed to connect")
        || l.contains("could not resolve")
        || l.contains("network")
        || l.contains("dns error")
        || l.contains("sandbox")
        || l.contains("503")  // service unavailable → rate limit / backend down
        || l.contains("timeout")
        || l.contains("deadline exceeded")
        || l.contains("rate limit")
        || l.contains("too many requests")
    {
        "networkBlocked".into()
    } else if l.contains("parse error")
        || l.contains("invalid json")
        || l.contains("schema mismatch")
    {
        "jsonParseError".into()
    } else {
        "engineError".into()
    }
}

/// 判断错误是否可重试(网络超时、API 限流等)。
pub fn is_retryable_error(class: &str) -> bool {
    matches!(class, "networkBlocked" | "timeout")
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
        "item.started" | "item.completed" | "item.updated" => map_item(&v, t == "item.completed"),
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
        // 计划/待办更新:codex 频繁发,不刷屏,只给一行轻量进度。
        "todo_list" => vec![DomainEvent::Progress {
            text: "计划更新".into(),
        }],
        other => vec![DomainEvent::Raw {
            codex_type: format!("item:{other}"),
            json: item.clone(),
        }],
    }
}

/// 工作目录浅快照:path → (mtime_secs, size)。有界递归,跳过隐藏 / 重目录。
fn snapshot_dir(root: &Path) -> HashMap<String, (u64, u64)> {
    let mut map = HashMap::new();
    walk_dir(root, 0, &mut map);
    map
}

fn walk_dir(dir: &Path, depth: usize, out: &mut HashMap<String, (u64, u64)>) {
    if depth > 4 {
        return;
    }
    let rd = match std::fs::read_dir(dir) {
        Ok(r) => r,
        Err(_) => return,
    };
    for entry in rd.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        // 跳过隐藏目录/文件(含 .nature-cache)与常见重目录
        if name.starts_with('.')
            || matches!(
                name.as_str(),
                "node_modules" | "target" | "venv" | ".venv" | "__pycache__"
            )
        {
            continue;
        }
        let ft = match entry.file_type() {
            Ok(f) => f,
            Err(_) => continue,
        };
        let p = entry.path();
        if ft.is_dir() {
            walk_dir(&p, depth + 1, out);
        } else if ft.is_file() {
            if let Ok(meta) = entry.metadata() {
                let size = meta.len();
                let mtime = meta
                    .modified()
                    .ok()
                    .and_then(|t| t.duration_since(SystemTime::UNIX_EPOCH).ok())
                    .map(|d| d.as_secs())
                    .unwrap_or(0);
                out.insert(p.to_string_lossy().to_string(), (mtime, size));
            }
        }
    }
}

/// 取消任务:标记取消 + kill;由 stdout 线程发 cancelled 结局并从表移除(状态一致)。
pub fn cancel_task(state: &EngineState, task_id: &str) {
    if let Some(h) = state.tasks.get(task_id) {
        h.cancelled.store(true, Ordering::SeqCst);
        if let Ok(mut c) = h.child.lock() {
            let _ = c.kill();
        }
    }
}

/// 引擎自检:codex 版本 + 登录态。
pub fn check_engine() -> EngineStatus {
    let bin = resolve_codex_bin();
    let raw_version = codex_command()
        .arg("--version")
        .output()
        .ok()
        .filter(|o| o.status.success())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string());

    let semver = raw_version.as_deref().map(parse_codex_version);
    let needs_legacy = matches!(semver.as_ref(), Some(v) if needs_legacy_parsing(v));

    // 登录态:隔离 CODEX_HOME 下的 auth.json(与本地 ~/.codex 互不影响)
    let logged_in = codex_home().join("auth.json").exists();

    EngineStatus {
        bin,
        version: raw_version,
        semver,
        needs_legacy_parsing: needs_legacy,
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
            use_legacy_parser: false,
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
        assert!(a
            .windows(2)
            .any(|w| w[0] == "-c" && w[1] == "sandbox_workspace_write.network_access=true"));
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
        assert!(
            matches!(&evs[0], DomainEvent::ThreadStarted { thread_id } if thread_id == "abc-123")
        );
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
        assert!(
            matches!(&evs[0], DomainEvent::TurnCompleted { usage } if usage.output_tokens == 74)
        );
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
        assert!(
            matches!(&evs[0], DomainEvent::AssistantMessage { text } if text.contains("chart.png"))
        );
    }

    #[test]
    fn unknown_type_becomes_raw() {
        let mut tid = None;
        let mut u = Usage::default();
        let evs = map_line(r#"{"type":"some.future.event","foo":1}"#, &mut tid, &mut u);
        assert!(
            matches!(&evs[0], DomainEvent::Raw { codex_type, .. } if codex_type == "some.future.event")
        );
    }

    #[test]
    fn malformed_line_becomes_raw() {
        let mut tid = None;
        let mut u = Usage::default();
        let evs = map_line("not json at all", &mut tid, &mut u);
        assert!(matches!(&evs[0], DomainEvent::Raw { codex_type, .. } if codex_type == "unparsed"));
    }
}
