// ── Mock 实现:@tauri-apps/api/core 的纯浏览器替身 ──
// 仅在非 Tauri 的浏览器 dev 环境下通过 Vite alias 生效。
// 业务代码完全无需修改,import 路径不变。

import type { DomainEvent } from "../types/engine";
import {
  MOCK_SKILLS,
  MOCK_ENGINE,
  MOCK_DOCTOR,
  MOCK_SETUP_STATUS,
  mockPlaceholder,
} from "./data";

/**
 * Mock Channel —— 对应 Tauri 的 Channel<T>。
 * 业务代码:new Channel() 后设置 onmessage 回调,再作为 invoke 参数传入。
 * Mock invoke 拿到实例后通过 __send() 模拟后端推送事件。
 */
export class Channel<T = unknown> {
  onmessage: (response: T) => void = () => {};
  __send(message: T): void {
    // 异步派发,模拟真实跨进程通信
    setTimeout(() => this.onmessage(message), 50);
  }
}

/** Mock convertFileSrc —— 把本地文件路径转成可访问的 URL(这里返回占位图)。 */
export function convertFileSrc(filePath: string, _protocol = "asset"): string {
  return mockPlaceholder(filePath);
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

/**
/** Mock SVG 生成:根据 plot_spec + plot_data 画一个简化预览,供浏览器验证 UI 交互。 */
function mockPlotSvg(plotSpec: Record<string, unknown>, plotData: Record<string, unknown>): string {
  const series = (plotData.series as Array<Record<string, unknown>>) ?? [];
  const title = String(plotSpec.title ?? "");
  const chartType = String(plotSpec.chart_type ?? "line");
  const style = (plotSpec.style as Record<string, unknown>) ?? {};
  const w = 480;
  const h = 340;
  const pad = 45;
  const fontFamily = String(style.font_family ?? "serif");
  const fontSize = Number(style.font_size ?? 12);

  let allY: number[] = [];
  for (const s of series) {
    if (s.visible === false) continue;
    allY = allY.concat((s.y as number[]) ?? []);
  }
  if (allY.length === 0) allY = [0, 1];
  const yMin = Math.min(...allY);
  const yMax = Math.max(...allY);
  const yRange = yMax - yMin || 1;
  const xMap = (i: number, n: number) => pad + (i / Math.max(n - 1, 1)) * (w - 2 * pad);
  const yMap = (v: number) => h - pad - ((v - yMin) / yRange) * (h - 2 * pad);

  let shapes = "";
  for (const s of series) {
    if (s.visible === false) continue;
    const xs = (s.x as number[]) ?? [];
    const ys = (s.y as number[]) ?? [];
    const n = Math.min(xs.length, ys.length);
    if (n === 0) continue;
    const color = String(s.color ?? "#1a1a1a");
    const lw = Number(s.line_width ?? 1.5);
    if (chartType === "bar") {
      const bw = ((w - 2 * pad) / n) * 0.7;
      for (let i = 0; i < n; i++) {
        const by = yMap(ys[i]);
        shapes += `<rect x="${xMap(i, n) - bw / 2}" y="${by}" width="${bw}" height="${h - pad - by}" fill="${color}" opacity="0.85"/>`;
      }
    } else {
      let d = "";
      for (let i = 0; i < n; i++) d += (i === 0 ? "M" : "L") + `${xMap(i, n)},${yMap(ys[i])} `;
      shapes += `<path d="${d}" stroke="${color}" stroke-width="${lw}" fill="none"/>`;
    }
  }

  const gridLines =
    style.grid !== false
      ? `<line x1="${pad}" y1="${h - pad}" x2="${w - pad}" y2="${h - pad}" stroke="#bbb" stroke-width="0.5"/><line x1="${pad}" y1="${pad}" x2="${pad}" y2="${h - pad}" stroke="#bbb" stroke-width="0.5"/>`
      : "";
  const xLabel = String(plotSpec.x_label ?? "");
  const yLabel = String(plotSpec.y_label ?? "");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="#fff"/>${title ? `<text x="${w / 2}" y="22" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize + 2}" font-weight="bold" fill="#1c1c1e">${title}</text>` : ""}${gridLines}${shapes}<text x="${w / 2}" y="${h - 8}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize - 1}" fill="#666">${xLabel}</text><text x="14" y="${h / 2}" text-anchor="middle" font-family="${fontFamily}" font-size="${fontSize - 1}" fill="#666" transform="rotate(-90 14 ${h / 2})">${yLabel}</text></svg>`;
}

/**
* Mock invoke —— 拦截所有 Tauri 命令,返回假数据或模拟事件流。
* 任何未覆盖的命令返回 undefined 并打印警告。
*/
export async function invoke<T = unknown>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  console.debug(`[mock] invoke("${cmd}")`, args ?? {});

  switch (cmd) {
    case "check_engine":
      await delay(300);
      return MOCK_ENGINE as unknown as T;

    case "preview_plot": {
      const req = (args?.request as Record<string, unknown>) ?? {};
      await delay(250);
      const svg = mockPlotSvg(
        (req.plotSpec as Record<string, unknown>) ?? {},
        (req.plotData as Record<string, unknown>) ?? {},
      );
      return {
        imageBase64: btoa(unescape(encodeURIComponent(svg))),
        imageFormat: String(req.format ?? "svg"),
        warnings: [],
      } as unknown as T;
    }
    case "list_skills":
      await delay(500);
      return MOCK_SKILLS as unknown as T;

    case "check_doctor":
      await delay(400);
      return MOCK_DOCTOR as unknown as T;

    case "get_setup_status":
      await delay(300);
      return MOCK_SETUP_STATUS as unknown as T;

    case "install_skills":
      await delay(1200);
      return 0 as unknown as T;

    case "check_academic_search":
      await delay(200);
      return false as unknown as T;

    case "register_academic_search":
      await delay(1500);
      return undefined as unknown as T;

    case "prepare_pyenv":
      await delay(1000);
      return undefined as unknown as T;

    case "cancel_task":
      return undefined as unknown as T;

    case "run_skill_task": {
      // 模拟完整的任务事件流:start → reasoning → message → artifact → finished
      const channel = args?.onEvent as Channel<DomainEvent> | undefined;
      const taskId = "mock-" + Date.now().toString(36);

      const send = (ev: DomainEvent) => {
        if (channel) channel.__send(ev);
      };

      // 异步推送事件序列(不阻塞 invoke 的 Promise resolve)
      (async () => {
        await delay(200);
        send({ kind: "started", taskId, argv: ["codex", "--mock"] });
        send({ kind: "threadStarted", threadId: "thread-mock-001" });
        send({ kind: "turnStarted" });

        await delay(600);
        send({
          kind: "reasoning",
          text: "正在分析任务要求,确定要加载的 skill 片段……\n这是 mock 模式下的模拟推理过程,用于预览界面。",
        });

        await delay(800);
        send({
          kind: "assistantMessage",
          text:
            "这是 mock 模式下的模拟回复。在真实环境中,这里会显示 codex 引擎的输出。\n\n你可以基于这个界面布局进行 UI 调整,改动会通过热更新实时生效。",
        });

        send({ kind: "progress", text: "生成产物中……" });

        await delay(500);
        send({ kind: "plan", steps: [{ step: "分析输入", status: "completed" }] });

        await delay(700);
        send({
          kind: "artifact",
          path: "/mock/workdir/chart_v1.png",
          changeKind: "created",
        });

        await delay(400);
        send({
          kind: "finished",
          outcome: "success",
          exitCode: 0,
          threadId: "thread-mock-001",
          usage: {
            input_tokens: 3200,
            cached_input_tokens: 1800,
            output_tokens: 950,
            reasoning_output_tokens: 420,
          },
          artifactCount: 1,
        });
      })();

      return taskId as unknown as T;
    }

    default:
      console.warn(`[mock] 未覆盖的 invoke 命令:"${cmd}",返回 undefined`);
      return undefined as unknown as T;
  }
}
