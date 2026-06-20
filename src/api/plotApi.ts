// 图表渲染 API 封装 —— 调用 Tauri 的 preview_plot 命令,参数→本地 matplotlib→图片。

import { invoke } from "@tauri-apps/api/core";
import type { PlotSpec, PlotData, PreviewResponse } from "../types/plot";

/**
 * 调用本地渲染器:把 plot_spec + plot_data 交给 Python 模板渲染成 SVG/PNG。
 * 全程不经过 LLM,延迟百毫秒级。
 */
export async function previewPlot(
  chartType: string,
  plotSpec: PlotSpec,
  plotData: PlotData,
  format: string = "svg",
): Promise<PreviewResponse> {
  return invoke<PreviewResponse>("preview_plot", {
    request: { chartType, plotSpec, plotData, format },
  });
}

/** base64 → data URL,供 <img> 直接显示。 */
export function toDataUrl(format: string, base64: string): string {
  if (format === "svg") return `data:image/svg+xml;base64,${base64}`;
  if (format === "png") return `data:image/png;base64,${base64}`;
  return `data:application/octet-stream;base64,${base64}`;
}

/** 颜色选择预设(科研期刊常用)。 */
export const COLOR_PRESETS = [
  "#1a1a1a", "#c73e3a", "#3d5a5b", "#6b6b6b",
  "#2563eb", "#059669", "#d97706", "#7c3aed",
];
