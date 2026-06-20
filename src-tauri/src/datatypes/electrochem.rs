//! 电化学类数据类型 —— CV 循环伏安 / EIS 阻抗。

use super::DataTypeDescriptor;

pub fn types() -> Vec<DataTypeDescriptor> {
    vec![
        DataTypeDescriptor {
            id: "electrochem.cv".into(),
            label: "CV 循环伏安".into(),
            category: "electrochem".into(),
            prompt_fragment: concat!(
                "这是循环伏安法(CV)数据。横轴为电位(potential),单位 V (vs. 参比电极),纵轴为电流(current),单位 A 或 mA/cm²。",
                "CV 曲线呈闭环特征(正向扫描和反向扫描),请确保两个方向的曲线在同一张图上用不同样式(实线/虚线或颜色)区分。",
                "如有多个扫描速率的数据,用瀑布图或叠加图展示速率依赖性。标注氧化峰/还原峰电位和电流。",
            ).into(),
            typical_x_label: Some("Potential".into()),
            typical_x_unit: Some("V".into()),
            typical_y_label: Some("Current".into()),
            typical_y_unit: Some("mA/cm²".into()),
            x_column_keywords: ["potential", "voltage", "v", "电位", "电压"].to_vec(),
        },
        DataTypeDescriptor {
            id: "electrochem.eis".into(),
            label: "EIS 电化学阻抗".into(),
            category: "electrochem".into(),
            prompt_fragment: concat!(
                "这是电化学阻抗谱(EIS)数据,通常需要绘制 Nyquist 图(实部 Z' 为 X 轴,负虚部 -Z'' 为 Y 轴)。",
                "如果数据包含频率列,也可以绘制 Bode 图(频率对模阻抗,频率对相角)。",
                "Nyquist 图的 X 轴和 Y 轴应等比例(aspect ratio = 1),半圆弧可拟合等效电路。多组数据用不同颜色。",
            ).into(),
            typical_x_label: Some("Z'".into()),
            typical_x_unit: Some("Ω".into()),
            typical_y_label: Some("-Z''".into()),
            typical_y_unit: Some("Ω".into()),
            x_column_keywords: ["z_real", "z'", "re", "impedance", "frequency", "freq", "阻抗"].to_vec(),
        },
    ]
}
