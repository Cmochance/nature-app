//! 数据类型注册模块 —— 多级结构化,按科研数据大类拆分。
//!
//! 每个大类(spectroscopy / thermal / electrochem / general)一个子模块文件,
//! 子模块内定义该类下所有数据类型的描述、元数据和列名关键词。
//! 新增大类时只需加一个子模块文件 + 在 `all_types()` 注册,避免单文件膨胀。
//!
//! 借鉴自 Sci-Data-Analyzer 的 data_processor 模块,但:
//! - 删除自动识别评分引擎(本项目用户手动选择数据类型)
//! - 删除 LLM 兜底识别(codex 自身就是 LLM)
//! - 保留数据类型描述、典型轴标签、列名关键词等静态元数据

use serde::Serialize;

pub mod electrochem;
pub mod general;
pub mod reader;
pub mod spectroscopy;
pub mod thermal;

/// 一个数据类型的完整描述。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataTypeDescriptor {
    /// 类型 ID,如 "spectroscopy.ftir"
    pub id: String,
    /// 中文显示名
    pub label: String,
    /// 大类 ID,如 "spectroscopy"
    pub category: String,
    /// 注入 codex prompt 的领域知识描述
    pub prompt_fragment: String,
    /// 典型 X 轴标签
    pub typical_x_label: Option<String>,
    /// 典型 X 轴单位
    pub typical_x_unit: Option<String>,
    /// 典型 Y 轴标签
    pub typical_y_label: Option<String>,
    /// 典型 Y 轴单位
    pub typical_y_unit: Option<String>,
    /// 用于辅助判断的列名关键词(供文件解析时提示,不用于强制识别)
    pub x_column_keywords: Vec<&'static str>,
}

/// 所有数据大类的前端展示信息。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DataCategory {
    pub id: String,
    pub label: String,
}

/// 注册所有数据大类(供前端展示分组)。
pub fn all_categories() -> Vec<DataCategory> {
    vec![
        DataCategory {
            id: "general".into(),
            label: "通用 / 未分类".into(),
        },
        DataCategory {
            id: "spectroscopy".into(),
            label: "光谱 Spectroscopy".into(),
        },
        DataCategory {
            id: "thermal".into(),
            label: "热分析 Thermal".into(),
        },
        DataCategory {
            id: "electrochem".into(),
            label: "电化学 Electrochemistry".into(),
        },
    ]
}

/// 注册所有数据类型(合并所有大类)。
pub fn all_types() -> Vec<DataTypeDescriptor> {
    let mut all = Vec::new();
    all.extend(general::types());
    all.extend(spectroscopy::types());
    all.extend(thermal::types());
    all.extend(electrochem::types());
    all
}

/// 按 ID 查找数据类型描述。
pub fn find(id: &str) -> Option<DataTypeDescriptor> {
    all_types().into_iter().find(|t| t.id == id)
}

/// 获取数据类型的 prompt 注入片段;找不到时返回空串。
pub fn get_prompt_fragment(id: &str) -> String {
    find(id)
        .map(|t| t.prompt_fragment)
        .unwrap_or_default()
}

// ── Tauri 命令 ──

use std::path::PathBuf;

/// 前端获取所有数据类型(分组)和大类列表。
#[tauri::command]
pub async fn get_data_types() -> Result<(Vec<DataCategory>, Vec<DataTypeDescriptor>), String> {
    Ok((all_categories(), all_types()))
}

/// 解析用户选择的数据文件,返回数值列 + 统计信息。
#[tauri::command]
pub async fn resolve_data(path: String) -> Result<reader::ParsedData, String> {
    let p = PathBuf::from(&path);
    if !p.exists() {
        return Err(format!("文件不存在: {path}"));
    }
    reader::parse_file(&p)
}
