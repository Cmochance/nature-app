//! 数据文件解析器 —— 读取 CSV/TXT,提取数值列。
//!
//! 不依赖 pandas,纯 Rust 实现。自动处理:
//! - 分隔符检测(逗号/制表符/空格/分号)
//! - 表头跳过(非数字行)
//! - 数值列提取(x + 1~N 个 y 列)
//! - min/max/单调性统计(供前端提示和 prompt 注入)

use serde::Serialize;
use std::path::Path;

/// 一列解析结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedColumn {
    pub name: String,
    pub values: Vec<f64>,
    pub min: f64,
    pub max: f64,
    /// true = 单调递增, false = 单调递减, null = 非单调
    pub monotonic: Option<bool>,
}

/// 文件解析结果。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedData {
    pub columns: Vec<ParsedColumn>,
    pub row_count: usize,
    /// 猜测的 X 列索引(第一列)
    pub x_column_index: usize,
    /// 猜测的 Y 列索引列表(第二列及之后)
    pub y_column_indices: Vec<usize>,
}

/// 检测分隔符:统计首行各种分隔符出现次数,取最多的。
fn detect_delimiter(line: &str) -> char {
    let candidates = [',', '\t', ';', ' ', '|'];
    let mut best = ',';
    let mut best_count = 0;
    for c in candidates {
        let count = line.matches(c).count();
        if count > best_count {
            best = c;
            best_count = count;
        }
    }
    best
}

/// 尝试把字符串解析为 f64,兼容科学计数法和各种小数点。
fn try_parse_f64(s: &str) -> Option<f64> {
    let s = s.trim().replace(',', "."); // 欧洲小数点兼容
    s.parse::<f64>().ok()
}

/// 判断一行是否全是数字(用于跳过表头)。
fn is_numeric_row(fields: &[&str]) -> bool {
    fields.iter().filter(|f| !f.trim().is_empty()).all(|f| try_parse_f64(f).is_some())
}

/// 计算一列的单调性。
fn check_monotonic(values: &[f64]) -> Option<bool> {
    if values.len() < 2 {
        return None;
    }
    let mut increasing = true;
    let mut decreasing = true;
    for i in 1..values.len() {
        if values[i] > values[i - 1] {
            decreasing = false;
        } else if values[i] < values[i - 1] {
            increasing = false;
        }
    }
    if increasing {
        Some(true)
    } else if decreasing {
        Some(false)
    } else {
        None
    }
}

/// 解析数据文件。
pub fn parse_file(path: &Path) -> Result<ParsedData, String> {
    let content = std::fs::read_to_string(path)
        .map_err(|e| format!("读取文件失败: {e}"))?;

    // 统一换行
    let content = content.replace("\r\n", "\n").replace('\r', "\n");
    let lines: Vec<&str> = content.lines().collect();
    if lines.is_empty() {
        return Err("文件为空".into());
    }

    // 检测分隔符
    let delim = detect_delimiter(lines[0]);

    // 找到数据起始行(跳过表头/注释)
    let mut header: Vec<String> = Vec::new();
    let mut data_start = 0;
    for (i, line) in lines.iter().enumerate() {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let fields: Vec<&str> = trimmed.split(delim).collect();
        if is_numeric_row(&fields) {
            data_start = i;
            break;
        }
        // 非数字行 → 当作表头
        if header.is_empty() {
            header = fields.iter().map(|f| f.trim().to_string()).collect();
        }
        data_start = i + 1;
    }

    // 按列收集数据
    let mut col_data: Vec<Vec<f64>> = Vec::new();
    for line in &lines[data_start..] {
        let trimmed = line.trim();
        if trimmed.is_empty() || trimmed.starts_with('#') {
            continue;
        }
        let fields: Vec<&str> = trimmed.split(delim).collect();
        for (i, f) in fields.iter().enumerate() {
            if let Some(v) = try_parse_f64(f) {
                while col_data.len() <= i {
                    col_data.push(Vec::new());
                }
                col_data[i].push(v);
            }
        }
    }

    if col_data.is_empty() {
        return Err("未找到数值数据".into());
    }

    let n_cols = col_data.len();
    let mut columns = Vec::with_capacity(n_cols);
    for (i, values) in col_data.into_iter().enumerate() {
        if values.is_empty() {
            continue;
        }
        let min = values.iter().cloned().fold(f64::INFINITY, f64::min);
        let max = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
        let monotonic = check_monotonic(&values);
        let name = header.get(i).cloned().unwrap_or_else(|| format!("col_{}", i + 1));
        columns.push(ParsedColumn {
            name,
            values,
            min,
            max,
            monotonic,
        });
    }

    let row_count = columns.first().map(|c| c.values.len()).unwrap_or(0);
    let y_column_indices: Vec<usize> = (1..columns.len()).collect();

    Ok(ParsedData {
        columns,
        row_count,
        x_column_index: 0,
        y_column_indices,
    })
}
