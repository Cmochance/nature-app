//! 热分析类数据类型 —— TGA / DSC。

use super::DataTypeDescriptor;

pub fn types() -> Vec<DataTypeDescriptor> {
    vec![
        DataTypeDescriptor {
            id: "thermal.tga".into(),
            label: "TGA 热重分析".into(),
            category: "thermal".into(),
            prompt_fragment: concat!(
                "这是热重分析(TGA)数据。横轴为温度(temperature),单位 °C 或 K。左纵轴为质量百分比(weight %)或质量(mg)。",
                "如果同时有 DTG(微商热重)曲线,右侧纵轴显示质量损失速率(%/°C 或 mg/min)。",
                "请在主要失重台阶处标注温度范围和对应的失重百分比,并推测可能的热事件(如脱水、分解、氧化)。",
                "多组样品叠加时用不同颜色,实线为 TGA、虚线为 DTG。",
            ).into(),
            typical_x_label: Some("Temperature".into()),
            typical_x_unit: Some("°C".into()),
            typical_y_label: Some("Weight".into()),
            typical_y_unit: Some("%".into()),
            x_column_keywords: ["temperature", "temp", "degc", "celsius", "°c", "温度"].to_vec(),
        },
        DataTypeDescriptor {
            id: "thermal.dsc".into(),
            label: "DSC 差示扫描量热".into(),
            category: "thermal".into(),
            prompt_fragment: concat!(
                "这是差示扫描量热(DSC)数据。横轴为温度(temperature),单位 °C。纵轴为热流(heat flow),单位 mW 或 W/g,向上通常为放热(exo)。",
                "请在吸热/放热峰处标注对应的温度(峰值温度 Tonset/Tpeak)和焓变(ΔH,通过积分峰面积获得)。",
                "标注玻璃化转变温度(Tg,表现为基线台阶)、熔融峰(Tm)、结晶峰(Tc)。多组样品叠加时用不同颜色。",
            ).into(),
            typical_x_label: Some("Temperature".into()),
            typical_x_unit: Some("°C".into()),
            typical_y_label: Some("Heat Flow".into()),
            typical_y_unit: Some("mW".into()),
            x_column_keywords: ["temperature", "temp", "degc", "celsius", "heatflow", "heat_flow", "温度"].to_vec(),
        },
    ]
}
