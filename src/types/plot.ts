// 参数化绘图的数据契约 —— 与 Rust 侧 renderer.rs 的 PreviewRequest 对应(camelCase)。
// plot_spec / plot_data 的 schema 移植自 Sci-Data-Analyzer 的 chart_renderer/schemas.py。

/** 一条可绘制的数据序列。 */
export interface PlotSeries {
  name: string;
  x: number[] | string[];
  y: number[];
  color?: string;
  line_width?: number;
  visible?: boolean;
}

/** 绘图数据。 */
export interface PlotData {
  schema_version?: number;
  series: PlotSeries[];
  grid?: Record<string, unknown>;
}

/** 图表全局样式。 */
export interface PlotStyle {
  figure_size?: [number, number];
  dpi?: number;
  font_family?: string;
  font_size?: number;
  line_width?: number;
  grid?: boolean;
  grid_alpha?: number;
  colors?: string[];
  legend?: {
    enabled?: boolean;
    location?: string;
  };
  spines?: {
    enabled?: boolean;
    width?: number | null;
    color?: string;
  };
  text?: {
    title?: { font_family?: string; font_size?: number | null; color?: string | null };
    axis_label?: { font_family?: string; font_size?: number | null; color?: string | null };
  };
}

/** 绘图参数 —— 所有可能被微调的视觉属性。 */
export interface PlotSpec {
  schema_version?: number;
  chart_type?: string;
  output_format?: string;
  title?: string;
  x_label?: string;
  y_label?: string;
  x_unit?: string;
  y_unit?: string;
  style?: PlotStyle;
  scales?: Record<string, unknown>;
  annotations?: unknown[];
}

/** 预览渲染结果。 */
export interface PreviewResponse {
  imageBase64: string;
  imageFormat: string;
  warnings: unknown[];
}
