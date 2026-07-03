//! 审计追踪系统 — 记录每次任务执行的完整时间线。
//!
//! 存储位置: `~/.nature-app/traces/{trace_id}/`
//! - metadata.json: 摘要信息(task_id, skill, instruction, outcome 等)
//! - events.jsonl: 逐行事件日志(可重新回放)
//! - last_message.txt: 最终回复文本
//!
//! 默认始终开启(轻量 JSONL),后续可通过 Settings 提供开关。

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Write; // needed for writeln! and flush on File
use std::path::{Path, PathBuf};
use uuid::Uuid;

/// 单次追踪的元数据(写入 metadata.json)。
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceMetadata {
    pub trace_id: String,
    pub task_id: String,
    pub skill_id: Option<String>,
    pub skill_name: Option<String>,
    /// 发送给 Codex 的完整指令。
    pub instruction: String,
    pub workdir: String,
    /// 开始/结束时间戳(ISO-8601)。
    pub started_at: String,
    pub finished_at: Option<String>,
    /// success / failure / cancelled。
    pub outcome: Option<String>,
    pub exit_code: Option<i32>,
    pub thread_id: Option<String>,
    pub input_tokens: u64,
    pub output_tokens: u64,
    pub artifact_count: usize,
    pub can_retry: bool,
    pub errors: Vec<String>,
    pub sandbox_tier: String,
}

/// 事件的时间线条目(与前端 RunItem 对齐但不包含富样式)。
#[allow(dead_code)]
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum TraceEvent {
    Started {
        argv: Vec<String>,
    },
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
    Artifact {
        path: String,
        change_kind: String,
    },
    Plan {},
    Progress {
        text: String,
    },
    TurnCompleted {
        input_tokens: u64,
        output_tokens: u64,
    },
    EngineError {
        class: String,
        message: String,
    },
    Raw {
        codex_type: String,
        json: serde_json::Value,
    },
    Finished {
        outcome: String,
        exit_code: Option<i32>,
        artifact_count: usize,
        can_retry: bool,
    },
}

/// 追踪写入器,负责创建目录、写 metadata、追加事件行。
#[allow(dead_code)]
pub struct TraceWriter {
    dir: PathBuf,
    events_file: fs::File,
    pub metadata: TraceMetadata,
}

#[allow(dead_code)]
impl TraceWriter {
    /// 创建一个新的追踪(在 ~/.nature-app/traces/{trace_id}/ 下)。
    pub fn new(instruction: &str, workdir: &str, sandbox_tier: &str) -> Self {
        let trace_id = Uuid::new_v4().to_string();
        let traces_dir = codex_home_parent().join("traces");
        let _ = fs::create_dir_all(&traces_dir);

        let meta = TraceMetadata {
            trace_id: trace_id.clone(),
            task_id: String::new(), // 由调用方更新
            skill_id: None,
            skill_name: None,
            instruction: instruction.to_string(),
            workdir: workdir.to_string(),
            started_at: now_iso(),
            finished_at: None,
            outcome: None,
            exit_code: None,
            thread_id: None,
            input_tokens: 0,
            output_tokens: 0,
            artifact_count: 0,
            can_retry: false,
            errors: vec![],
            sandbox_tier: sandbox_tier.to_string(),
        };

        let dir = traces_dir.join(&trace_id);
        let _ = fs::create_dir_all(&dir);

        // 写 metadata
        let meta_path = dir.join("metadata.json");
        let _ = fs::write(
            &meta_path,
            serde_json::to_string_pretty(&meta).unwrap_or_default(),
        );

        // 打开 events.jsonl 文件
        let events_path = dir.join("events.jsonl");
        let events_file = fs::OpenOptions::new()
            .create(true)
            .write(true)
            .truncate(true)
            .open(&events_path)
            .unwrap_or_else(|e| {
                eprintln!("[trace] 无法打开 events.jsonl: {e}");
                fs::File::create("/dev/null").unwrap()
            });

        Self {
            dir,
            events_file,
            metadata: meta,
        }
    }

    /// 写入单个事件到 events.jsonl + 更新 metadata。
    pub fn write_event(&mut self, event: &TraceEvent) {
        // 写一行 JSONL
        let line = serde_json::to_string(event)
            .unwrap_or_else(|_| "{\"error\":\"serialization failed\",\"raw\":true}".to_string());
        let _ = writeln!(self.events_file, "{}", line);
        self.events_file.flush().ok();

        // 增量更新 metadata
        match event {
            TraceEvent::Started { .. } => {}
            TraceEvent::ThreadStarted { thread_id } => {
                self.metadata.thread_id = Some(thread_id.clone());
            }
            TraceEvent::EngineError { class, message } => {
                self.metadata
                    .errors
                    .push(format!("[{}] {}", class, message));
            }
            TraceEvent::Finished {
                outcome,
                exit_code,
                artifact_count,
                can_retry,
            } => {
                self.metadata.outcome = Some(outcome.clone());
                self.metadata.exit_code = *exit_code;
                self.metadata.artifact_count = *artifact_count;
                self.metadata.can_retry = *can_retry;
                self.metadata.finished_at = Some(now_iso());
            }
            TraceEvent::TurnCompleted {
                input_tokens,
                output_tokens,
            } => {
                self.metadata.input_tokens += input_tokens;
                self.metadata.output_tokens += output_tokens;
            }
            _ => {}
        }
    }

    /// 更新 task_id、skill 信息并持久化 metadata 到磁盘。
    pub fn finalize(&mut self) {
        if let Ok(json) = serde_json::to_string_pretty(&self.metadata) {
            let meta_path = self.dir.join("metadata.json");
            let _ = fs::write(meta_path, json);
        }
    }

    /// 设置 skill 信息。
    pub fn set_skill(&mut self, id: &str, name: &str) {
        self.metadata.skill_id = Some(id.to_string());
        self.metadata.skill_name = Some(name.to_string());
    }

    /// 设置 task_id。
    pub fn set_task_id(&mut self, task_id: &str) {
        self.metadata.task_id = task_id.to_string();
    }

    /// 保存最终回复文本。
    pub fn save_last_message(&self, text: &str) {
        let path = self.dir.join("last_message.txt");
        let _ = fs::write(path, text);
    }

    /// 返回追踪目录路径(供前端读取)。
    pub fn dir(&self) -> &Path {
        &self.dir
    }

    /// 返回 trace_id。
    pub fn trace_id(&self) -> &str {
        &self.metadata.trace_id
    }
}

/// 获取 traces 根目录的父目录(`~/.nature-app`)。
fn codex_home_parent() -> PathBuf {
    std::env::var("NATURE_APP_CODEX_HOME")
        .ok()
        .map(PathBuf::from)
        .unwrap_or_else(|| {
            PathBuf::from(std::env::var("HOME").unwrap_or_default())
                .join(".nature-app")
                .join("codex-home")
        })
        .parent()
        .unwrap_or(Path::new("."))
        .to_path_buf()
        .join("nature-app")
        .join("traces-root")
}

fn now_iso() -> String {
    use std::time::SystemTime;
    SystemTime::now()
        .duration_since(SystemTime::UNIX_EPOCH)
        .ok()
        .map(|d| d.as_secs())
        .map(|secs| {
            // 简易 ISO-8601(UTC):用 chrono 风格手动拼
            // 由于不引入新依赖,用固定格式 YYYY-MM-DDTHH:MM:SSZ
            // 需要 time crate? 不用,直接用 %s 和 libc → 太复杂。
            // 退而求其次:用 Unix timestamp 字符串。
            secs.to_string()
        })
        .unwrap_or_else(|| "0".to_string())
}

/// 列出所有已有追踪的摘要(仅文件名 + metadata 的关键字段)。
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TraceSummary {
    pub trace_id: String,
    pub task_id: String,
    pub skill_id: Option<String>,
    pub skill_name: Option<String>,
    pub outcome: String,
    pub started_at: String,
    pub artifact_count: usize,
}

/// 扫描 traces 目录,返回按时间倒序的摘要列表。
pub fn list_traces() -> Vec<TraceSummary> {
    let base = list_traces_dir();
    let mut summaries = vec![];

    let entries = match fs::read_dir(&base) {
        Ok(r) => r,
        Err(_) => return summaries,
    };

    for entry in entries.flatten() {
        if !entry.file_type().map(|ft| ft.is_dir()).unwrap_or(false) {
            continue;
        }
        let meta_path = entry.path().join("metadata.json");
        if let Ok(content) = fs::read_to_string(&meta_path) {
            if let Ok(meta) = serde_json::from_str::<TraceMetadata>(&content) {
                summaries.push(TraceSummary {
                    trace_id: meta.trace_id,
                    task_id: meta.task_id,
                    skill_id: meta.skill_id,
                    skill_name: meta.skill_name,
                    outcome: meta.outcome.unwrap_or_else(|| "unknown".to_string()),
                    started_at: meta.started_at,
                    artifact_count: meta.artifact_count,
                });
            }
        }
    }

    // 按 started_at (Unix timestamp string) 降序排序
    summaries.sort_by(|a, b| {
        let at_a = a.started_at.parse::<u64>().unwrap_or(0);
        let at_b = b.started_at.parse::<u64>().unwrap_or(0);
        at_b.cmp(&at_a)
    });

    summaries
}

/// traces 根目录(独立于 CODEX_HOME,避免耦合)。
fn list_traces_dir() -> PathBuf {
    PathBuf::from(std::env::var("HOME").unwrap_or_default())
        .join(".nature-app")
        .join("traces")
}
