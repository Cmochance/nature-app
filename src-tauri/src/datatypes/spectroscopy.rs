//! 光谱类数据类型 —— FTIR / Raman / UV-Vis / XRD / XPS / PL。

use super::DataTypeDescriptor;

pub fn types() -> Vec<DataTypeDescriptor> {
    vec![
        DataTypeDescriptor {
            id: "spectroscopy.ftir".into(),
            label: "FTIR 红外光谱".into(),
            category: "spectroscopy".into(),
            prompt_fragment: concat!(
                "这是傅里叶变换红外光谱(FTIR)数据。横轴为波数(wavenumber),范围通常为 4000-400 cm⁻¹,**X 轴方向从高到低(从左到右递减)是学术界惯例**,请务必按此惯例绘制。纵轴为吸光度(absorbance,向上为峰)或透过率(transmittance,谷为吸收带)。",
                "请在关键吸收带处标注官能团(如 O-H ~3400, C-H ~2900, C=O ~1700, C=C ~1600, C-O ~1100 cm⁻¹)。",
                "如果有多条谱线(如不同样品),用不同颜色叠加并加图例。Y 轴若为透过率范围通常 0-100% T,若为吸光度则通常 0-2 左右。",
            ).into(),
            typical_x_label: Some("Wavenumber".into()),
            typical_x_unit: Some("cm⁻¹".into()),
            typical_y_label: Some("Absorbance".into()),
            typical_y_unit: None,
            x_column_keywords: ["wavenumber", "wave_number", "cm-1", "cm⁻¹", "波数"].to_vec(),
        },
        DataTypeDescriptor {
            id: "spectroscopy.raman".into(),
            label: "Raman 拉曼光谱".into(),
            category: "spectroscopy".into(),
            prompt_fragment: concat!(
                "这是拉曼光谱(Raman)数据。横轴为拉曼位移(Raman shift),单位 cm⁻¹,范围通常为 100-3200 cm⁻¹。纵轴为强度(intensity)。",
                "请在特征峰处标注振动模式或化学键(如 D-band ~1350, G-band ~1580 cm⁻¹ for碳材料)。",
                "多组数据用不同颜色叠加,图例标注样品信息。",
            ).into(),
            typical_x_label: Some("Raman Shift".into()),
            typical_x_unit: Some("cm⁻¹".into()),
            typical_y_label: Some("Intensity".into()),
            typical_y_unit: Some("a.u.".into()),
            x_column_keywords: ["raman", "shift", "cm-1", "cm⁻¹", "拉曼"].to_vec(),
        },
        DataTypeDescriptor {
            id: "spectroscopy.uvvis".into(),
            label: "UV-Vis 紫外可见光谱".into(),
            category: "spectroscopy".into(),
            prompt_fragment: concat!(
                "这是紫外-可见吸收光谱(UV-Vis)数据。横轴为波长(wavelength),单位 nm,范围通常为 200-800 nm。纵轴为吸光度(absorbance)或透过率。",
                "请在吸收峰处标注对应的波长值。如果需要计算带隙(用 Tauc plot),请注意方法选择。",
                "多组数据叠加时用不同颜色,图例标注样品。",
            ).into(),
            typical_x_label: Some("Wavelength".into()),
            typical_x_unit: Some("nm".into()),
            typical_y_label: Some("Absorbance".into()),
            typical_y_unit: None,
            x_column_keywords: ["wavelength", "nm", "波长", "uv", "vis"].to_vec(),
        },
        DataTypeDescriptor {
            id: "spectroscopy.xrd".into(),
            label: "XRD X 射线衍射".into(),
            category: "spectroscopy".into(),
            prompt_fragment: concat!(
                "这是 X 射线衍射(XRD)数据。横轴为衍射角 2θ(two-theta),单位度(°),范围通常为 5-90°。纵轴为强度(intensity)。",
                "请在主要衍射峰处标注晶面指数(如 (111), (200) 等)或对应的 2θ 角度值。",
                "如果有标准卡片(JCPDS/PDF)进行对比,用竖线或底部刻度标注标准峰位置。多组样品叠加时用不同颜色。",
            ).into(),
            typical_x_label: Some("2θ".into()),
            typical_x_unit: Some("°".into()),
            typical_y_label: Some("Intensity".into()),
            typical_y_unit: Some("a.u.".into()),
            x_column_keywords: ["2theta", "two_theta", "2θ", "angle", "deg", "角度"].to_vec(),
        },
        DataTypeDescriptor {
            id: "spectroscopy.xps".into(),
            label: "XPS 光电子能谱".into(),
            category: "spectroscopy".into(),
            prompt_fragment: concat!(
                "这是 X 射线光电子能谱(XPS)数据。横轴为结合能(binding energy),单位 eV。**X 轴方向从高到低(从左到右递减)是惯例**,请务必按此绘制。",
                "纵轴为强度(counts 或 cps)。请在特征峰处标注元素和轨道(如 C 1s, O 1s, N 1s)。",
                "如果做了分峰拟合,用不同颜色的拟合曲线和残差展示。C 1s 校准参考值通常为 284.8 eV。",
            ).into(),
            typical_x_label: Some("Binding Energy".into()),
            typical_x_unit: Some("eV".into()),
            typical_y_label: Some("Intensity".into()),
            typical_y_unit: Some("cps".into()),
            x_column_keywords: ["binding_energy", "energy", "ev", "eV", "结合能", "xps"].to_vec(),
        },
        DataTypeDescriptor {
            id: "spectroscopy.pl".into(),
            label: "PL 光致发光光谱".into(),
            category: "spectroscopy".into(),
            prompt_fragment: concat!(
                "这是光致发光光谱(PL)数据。横轴为波长(wavelength, nm)或能量(eV),纵轴为发光强度(PL intensity)。",
                "请在发射峰处标注峰值波长或能量。如果是温度/功率依赖的 PL,考虑瀑布图或等高线图。",
                "多组数据叠加时用不同颜色,图例标注条件。",
            ).into(),
            typical_x_label: Some("Wavelength".into()),
            typical_x_unit: Some("nm".into()),
            typical_y_label: Some("PL Intensity".into()),
            typical_y_unit: Some("a.u.".into()),
            x_column_keywords: ["wavelength", "nm", "pl", "emission", "发光", "波长"].to_vec(),
        },
    ]
}
