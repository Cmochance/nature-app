//! 通用 / 未分类数据类型。

use super::DataTypeDescriptor;

pub fn types() -> Vec<DataTypeDescriptor> {
    vec![
        DataTypeDescriptor {
            id: "general".into(),
            label: "通用数据".into(),
            category: "general".into(),
            prompt_fragment: "这是一组通用 XY 数据。请根据数据特征选择合适的图型(折线/散点/柱状),自动推断坐标轴标签和单位。如果用户提供了多列 Y 值,考虑在同一图中用不同颜色绘制多条曲线并添加图例。".into(),
            typical_x_label: None,
            typical_x_unit: None,
            typical_y_label: None,
            typical_y_unit: None,
            x_column_keywords: ["x", "time", "t", "index"].to_vec(),
        },
        DataTypeDescriptor {
            id: "general.timeseries".into(),
            label: "时间序列".into(),
            category: "general".into(),
            prompt_fragment: "这是时间序列数据,横轴为时间。请绘制折线或面积图,注意时间轴格式(日期/时间戳),适当使用日期格式化。如果有多条序列,用不同颜色区分并加图例。时间轴标签应避免重叠,考虑旋转或稀疏化。".into(),
            typical_x_label: Some("Time".into()),
            typical_x_unit: Some("s".into()),
            typical_y_label: None,
            typical_y_unit: None,
            x_column_keywords: ["time", "date", "timestamp", "t", "秒", "时间"].to_vec(),
        },
    ]
}
