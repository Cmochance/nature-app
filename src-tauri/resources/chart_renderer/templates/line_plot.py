# -*- coding: utf-8 -*-
from __future__ import annotations

import json
from pathlib import Path
import sys
import math
from datetime import datetime

import matplotlib

# Force headless backend. The parent process also sets MPLBACKEND=Agg.
matplotlib.use("Agg")
import matplotlib.pyplot as plt  # noqa: E402
import matplotlib.dates as mdates  # noqa: E402
import matplotlib.ticker as mticker  # noqa: E402
import numpy as np  # noqa: E402


def _label_with_unit(label: str, unit: str) -> str:
    label = (label or "").strip()
    unit = (unit or "").strip()
    if not unit:
        return label
    # Avoid double parentheses when user already provides "(unit)".
    if unit.startswith("(") and unit.endswith(")"):
        return f"{label} {unit}".strip()
    if not label:
        return unit
    return f"{label} ({unit})"


def _as_finite_float(value: object) -> float | None:
    if value is None:
        return None
    try:
        v = float(value)
    except Exception:
        return None
    if not math.isfinite(v):
        return None
    return float(v)


def _expand_xlim_for_inline_labels(
    *,
    x_left: float,
    x_right: float,
    label_positions: list[float],
    pad: float,
) -> tuple[float, float] | None:
    if not label_positions:
        return None
    if not (math.isfinite(x_left) and math.isfinite(x_right)):
        return None
    if not math.isfinite(pad) or pad < 0:
        return None
    pos_min = min(label_positions)
    pos_max = max(label_positions)
    if not (math.isfinite(pos_min) and math.isfinite(pos_max)):
        return None

    x_lo = min(float(x_left), float(x_right))
    x_hi = max(float(x_left), float(x_right))
    new_lo = min(float(x_lo), float(pos_min - pad))
    new_hi = max(float(x_hi), float(pos_max + pad))
    if not (math.isfinite(new_lo) and math.isfinite(new_hi) and new_hi > new_lo):
        return None

    if float(x_left) > float(x_right):
        return float(new_hi), float(new_lo)
    return float(new_lo), float(new_hi)


def main() -> int:
    base = Path(__file__).resolve().parent
    spec = json.loads((base / "plot_spec.json").read_text(encoding="utf-8"))
    data = json.loads((base / "plot_data.json").read_text(encoding="utf-8"))

    style = spec.get("style") or {}
    fig_size = style.get("figure_size") or [10, 6]
    dpi = int(style.get("dpi") or 150)
    font_family = style.get("font_family") or "serif"
    font_size = int(style.get("font_size") or 12)
    grid = bool(style.get("grid") if style.get("grid") is not None else True)
    grid_alpha = float(style.get("grid_alpha") or 0.3)

    text_cfg = style.get("text") or {}
    title_text = text_cfg.get("title") if isinstance(text_cfg, dict) else {}
    axis_text = text_cfg.get("axis_label") if isinstance(text_cfg, dict) else {}

    legend_cfg = style.get("legend") or {}
    legend_enabled = bool(legend_cfg.get("enabled") if legend_cfg.get("enabled") is not None else True)
    legend_location = str(legend_cfg.get("location") or "best").strip() or "best"
    allowed_locs = {
        "best",
        "upper right",
        "upper left",
        "lower right",
        "lower left",
        "center right",
        "center left",
        "upper center",
        "lower center",
        "center",
    }
    if legend_location not in allowed_locs:
        legend_location = "best"

    ticks_cfg = style.get("ticks") or {}
    ticks_x = ticks_cfg.get("x") if isinstance(ticks_cfg, dict) else {}
    ticks_y = ticks_cfg.get("y") if isinstance(ticks_cfg, dict) else {}

    axis_range_cfg = style.get("axis_range") if isinstance(style, dict) else None
    series_offset_cfg = style.get("series_offset") if isinstance(style, dict) else None

    spines_cfg = style.get("spines") or {}
    spines_enabled = bool(spines_cfg.get("enabled") if isinstance(spines_cfg, dict) and spines_cfg.get("enabled") is not None else True)
    spines_width = None
    spines_color = None
    if isinstance(spines_cfg, dict):
        if spines_cfg.get("width") is not None:
            try:
                spines_width = float(spines_cfg.get("width"))
            except Exception:
                spines_width = None
        if spines_cfg.get("color") is not None:
            spines_color = str(spines_cfg.get("color") or "").strip() or None

    inline_cfg = style.get("inline_labels") or {}
    inline_enabled = bool(inline_cfg.get("enabled") if inline_cfg.get("enabled") is not None else False)
    dx_ratio = float(inline_cfg.get("dx_ratio") or 0.01)
    if not math.isfinite(dx_ratio) or dx_ratio <= 0:
        dx_ratio = 0.01
    dx_ratio = float(max(0.001, min(0.2, dx_ratio)))

    plt.rcParams["font.family"] = font_family
    plt.rcParams["font.size"] = font_size
    # Default to bold + Arial-like look for publication-ready outputs.
    plt.rcParams["font.weight"] = "bold"
    plt.rcParams["axes.labelweight"] = "bold"
    plt.rcParams["axes.titleweight"] = "bold"
    # Keep text as text in SVG so font-family/weight remain editable downstream.
    plt.rcParams["svg.fonttype"] = "none"

    fmt = (spec.get("output_format") or "svg").lower()
    out_path = base / f"out.{fmt}"

    fig, ax = plt.subplots(figsize=(float(fig_size[0]), float(fig_size[1])), dpi=dpi)

    scales = spec.get("scales") or {}
    x_scale = (scales.get("x") or "linear").lower()
    y_scale = (scales.get("y") or "linear").lower()

    # Apply spines style early so downstream layout includes it.
    for spine in ax.spines.values():
        spine.set_visible(bool(spines_enabled))
        if spines_enabled:
            if spines_width is not None:
                spine.set_linewidth(float(spines_width))
            if spines_color:
                spine.set_color(str(spines_color))

    series_list = (data.get("series") or [])
    if not series_list:
        raise RuntimeError("plot_data.series is empty")

    # Optional: apply per-series y offsets (waterfall-like stacking) at render-time.
    offset_enabled = False
    offset_step = 0.0
    offset_mode = "none"
    offset_ratio = 0.15
    if isinstance(series_offset_cfg, dict):
        offset_enabled = bool(series_offset_cfg.get("enabled") if series_offset_cfg.get("enabled") is not None else False)
        offset_mode = str(series_offset_cfg.get("mode") or ("auto" if offset_enabled else "none")).strip().lower()
        if offset_mode not in {"none", "auto", "fixed", "relative"}:
            offset_mode = "none"
        try:
            offset_ratio = float(series_offset_cfg.get("ratio") or 0.15)
        except Exception:
            offset_ratio = 0.15
        if not math.isfinite(offset_ratio) or offset_ratio <= 0:
            offset_ratio = 0.15
        offset_ratio = float(max(0.001, min(50.0, offset_ratio)))

        if not offset_enabled or offset_mode == "none":
            offset_enabled = False
        elif offset_mode == "fixed":
            try:
                offset_step = float(series_offset_cfg.get("step"))
            except Exception:
                offset_step = 0.0
            if not math.isfinite(offset_step) or offset_step <= 0:
                offset_enabled = False
        else:
            pooled = []
            spans = []
            for s in series_list:
                if s.get("visible") is False:
                    continue
                y_vals = s.get("y") or []
                try:
                    arr = np.asarray(y_vals, dtype=float)
                except Exception:
                    continue
                arr = arr[np.isfinite(arr)]
                if arr.size:
                    pooled.append(arr)
                    try:
                        q05, q995 = np.quantile(arr, [0.05, 0.995])
                        span = float(q995 - q05)
                    except Exception:
                        span = 0.0
                    if not math.isfinite(span) or span <= 0.0:
                        try:
                            span = float(np.max(arr) - np.min(arr))
                        except Exception:
                            span = 0.0
                    if math.isfinite(span) and span > 0.0:
                        spans.append(span)

            y_span_from_cfg = None
            if isinstance(axis_range_cfg, dict):
                ry = axis_range_cfg.get("y")
                if isinstance(ry, dict):
                    try:
                        y_min = float(ry.get("min")) if ry.get("min") is not None else None
                    except Exception:
                        y_min = None
                    try:
                        y_max = float(ry.get("max")) if ry.get("max") is not None else None
                    except Exception:
                        y_max = None
                    if y_min is not None and y_max is not None and math.isfinite(y_min) and math.isfinite(y_max) and y_max > y_min:
                        y_span_from_cfg = float(y_max - y_min)

            if pooled:
                max_pool = 100_000
                per_series = max(1, int(max_pool // max(1, len(pooled))))
                sampled = []
                for arr in pooled:
                    if arr.size > per_series:
                        idx = np.linspace(0, arr.size - 1, num=per_series, dtype=int)
                        sampled.append(arr[idx])
                    else:
                        sampled.append(arr)
                all_y = sampled[0] if len(sampled) == 1 else np.concatenate(sampled)
                if all_y.size > max_pool:
                    idx = np.linspace(0, all_y.size - 1, num=max_pool, dtype=int)
                    all_y = all_y[idx]
                q05, q995 = np.quantile(all_y, [0.05, 0.995])
                robust = float(q995 - q05)
                if not math.isfinite(robust) or robust <= 0.0:
                    span = float(np.max(all_y) - np.min(all_y))
                    robust = span if math.isfinite(span) and span > 0.0 else 1.0

                base = robust
                if offset_mode == "relative":
                    base = y_span_from_cfg if y_span_from_cfg is not None else robust
                else:
                    if spans:
                        spans_sorted = sorted(spans)
                        base = spans_sorted[len(spans_sorted) // 2]
                offset_step = float(base) * float(offset_ratio)
            else:
                offset_step = 0.0
            if not math.isfinite(offset_step) or offset_step <= 0:
                offset_enabled = False

    datetime_plotted = False
    plotted_count = 0
    inline_points: list[dict[str, float | str | None]] = []
    numeric_x_min: float | None = None
    numeric_x_max: float | None = None
    for series in series_list:
        if series.get("visible") is False:
            continue
        x = series.get("x") or []
        y = series.get("y") or []
        name = str(series.get("name") or f"series_{plotted_count + 1}")
        color = series.get("color") or "#1a1a1a"
        lw = float(series.get("line_width") or style.get("line_width") or 1.5)
        if x_scale == "datetime":
            parsed: list[datetime] = []
            ok = True
            for v in x:
                if not isinstance(v, str) or not v:
                    ok = False
                    break
                try:
                    parsed.append(datetime.fromisoformat(v))
                except Exception:
                    ok = False
                    break
            if ok:
                x = parsed
                datetime_plotted = True
            else:
                print("WARN: failed to parse datetime x; falling back to string plotting", file=sys.stderr)

        if offset_enabled:
            try:
                y = [float(v) + float(plotted_count) * float(offset_step) for v in y]
            except Exception:
                # If coercion fails, fall back to unshifted plotting.
                pass

        ax.plot(x, y, linewidth=lw, color=color, label=name)
        plotted_count += 1

        if inline_enabled and (x_scale != "datetime") and not datetime_plotted:
            try:
                xs = [float(v) for v in x]
                ys = [float(v) for v in y]
            except Exception:
                continue
            if not xs or not ys:
                continue
            x_last = float(xs[-1])
            y_last = float(ys[-1])
            if not (math.isfinite(x_last) and math.isfinite(y_last)):
                continue
            xmin = float(min(xs))
            xmax = float(max(xs))
            if math.isfinite(xmin) and math.isfinite(xmax):
                numeric_x_min = xmin if numeric_x_min is None else float(min(numeric_x_min, xmin))
                numeric_x_max = xmax if numeric_x_max is None else float(max(numeric_x_max, xmax))
            inline_points.append(
                {
                    "label": str(name),
                    "color": str(color),
                    "x_last": x_last,
                    "y_last": y_last,
                    "label_x": _as_finite_float(series.get("label_x")),
                    "label_y": _as_finite_float(series.get("label_y")),
                }
            )

    if datetime_plotted:
        locator = mdates.AutoDateLocator()
        ax.xaxis.set_major_locator(locator)
        ax.xaxis.set_major_formatter(mdates.ConciseDateFormatter(locator))
        fig.autofmt_xdate()
    else:
        if x_scale == "log":
            ax.set_xscale("log")
        if y_scale == "log":
            ax.set_yscale("log")

    # Axis ranges (optional).
    if isinstance(axis_range_cfg, dict):
        rx = axis_range_cfg.get("x") if isinstance(axis_range_cfg.get("x"), dict) else {}
        ry = axis_range_cfg.get("y") if isinstance(axis_range_cfg.get("y"), dict) else {}

        x_min = rx.get("min")
        x_max = rx.get("max")
        if x_scale == "datetime":
            if isinstance(x_min, str) and x_min:
                try:
                    x_min = datetime.fromisoformat(x_min)
                except Exception:
                    x_min = None
            else:
                x_min = None
            if isinstance(x_max, str) and x_max:
                try:
                    x_max = datetime.fromisoformat(x_max)
                except Exception:
                    x_max = None
            else:
                x_max = None
        else:
            try:
                x_min = float(x_min) if x_min is not None else None
            except Exception:
                x_min = None
            try:
                x_max = float(x_max) if x_max is not None else None
            except Exception:
                x_max = None
            if x_scale == "log":
                if x_min is not None and x_min <= 0:
                    x_min = None
                if x_max is not None and x_max <= 0:
                    x_max = None
        if x_min is not None or x_max is not None:
            ax.set_xlim(left=x_min, right=x_max)

        try:
            y_min = float(ry.get("min")) if ry.get("min") is not None else None
        except Exception:
            y_min = None
        try:
            y_max = float(ry.get("max")) if ry.get("max") is not None else None
        except Exception:
            y_max = None
        if y_scale == "log":
            if y_min is not None and y_min <= 0:
                y_min = None
            if y_max is not None and y_max <= 0:
                y_max = None
        if y_min is not None or y_max is not None:
            ax.set_ylim(bottom=y_min, top=y_max)

    # Tick label styling (font size / rotation / numeric formatting).
    try:
        x_font_size = int(ticks_x.get("font_size")) if isinstance(ticks_x, dict) and ticks_x.get("font_size") is not None else None
    except Exception:
        x_font_size = None
    try:
        y_font_size = int(ticks_y.get("font_size")) if isinstance(ticks_y, dict) and ticks_y.get("font_size") is not None else None
    except Exception:
        y_font_size = None
    try:
        x_top_font_size = int(ticks_x.get("top_font_size")) if isinstance(ticks_x, dict) and ticks_x.get("top_font_size") is not None else None
    except Exception:
        x_top_font_size = None
    try:
        y_right_font_size = int(ticks_y.get("right_font_size")) if isinstance(ticks_y, dict) and ticks_y.get("right_font_size") is not None else None
    except Exception:
        y_right_font_size = None
    if x_font_size is not None:
        ax.tick_params(axis="x", labelsize=max(1, x_font_size))
    if y_font_size is not None:
        ax.tick_params(axis="y", labelsize=max(1, y_font_size))

    x_show_labels = bool(ticks_x.get("show_labels") if isinstance(ticks_x, dict) and ticks_x.get("show_labels") is not None else True)
    x_show_ticks = bool(ticks_x.get("show_ticks") if isinstance(ticks_x, dict) and ticks_x.get("show_ticks") is not None else True)
    y_show_labels = bool(ticks_y.get("show_labels") if isinstance(ticks_y, dict) and ticks_y.get("show_labels") is not None else True)
    y_show_ticks = bool(ticks_y.get("show_ticks") if isinstance(ticks_y, dict) and ticks_y.get("show_ticks") is not None else True)
    x_show_labels_bottom = bool(ticks_x.get("show_labels_bottom") if isinstance(ticks_x, dict) and ticks_x.get("show_labels_bottom") is not None else x_show_labels)
    x_show_labels_top = bool(ticks_x.get("show_labels_top") if isinstance(ticks_x, dict) and ticks_x.get("show_labels_top") is not None else False)
    x_show_ticks_bottom = bool(ticks_x.get("show_ticks_bottom") if isinstance(ticks_x, dict) and ticks_x.get("show_ticks_bottom") is not None else x_show_ticks)
    x_show_ticks_top = bool(ticks_x.get("show_ticks_top") if isinstance(ticks_x, dict) and ticks_x.get("show_ticks_top") is not None else False)
    y_show_labels_left = bool(ticks_y.get("show_labels_left") if isinstance(ticks_y, dict) and ticks_y.get("show_labels_left") is not None else y_show_labels)
    y_show_labels_right = bool(ticks_y.get("show_labels_right") if isinstance(ticks_y, dict) and ticks_y.get("show_labels_right") is not None else False)
    y_show_ticks_left = bool(ticks_y.get("show_ticks_left") if isinstance(ticks_y, dict) and ticks_y.get("show_ticks_left") is not None else y_show_ticks)
    y_show_ticks_right = bool(ticks_y.get("show_ticks_right") if isinstance(ticks_y, dict) and ticks_y.get("show_ticks_right") is not None else False)
    ax.tick_params(
        axis="x",
        labelbottom=x_show_labels_bottom,
        labeltop=x_show_labels_top,
        bottom=x_show_ticks_bottom,
        top=x_show_ticks_top,
    )
    ax.tick_params(
        axis="y",
        labelleft=y_show_labels_left,
        labelright=y_show_labels_right,
        left=y_show_ticks_left,
        right=y_show_ticks_right,
    )

    x_tick_font_family = str(ticks_x.get("font_family") or "").strip() if isinstance(ticks_x, dict) else ""
    y_tick_font_family = str(ticks_y.get("font_family") or "").strip() if isinstance(ticks_y, dict) else ""
    x_top_tick_font_family = str(ticks_x.get("top_font_family") or x_tick_font_family).strip() if isinstance(ticks_x, dict) else ""
    y_right_tick_font_family = str(ticks_y.get("right_font_family") or y_tick_font_family).strip() if isinstance(ticks_y, dict) else ""
    if x_tick_font_family.lower() in {"", "auto", "inherit"}:
        x_tick_font_family = ""
    if y_tick_font_family.lower() in {"", "auto", "inherit"}:
        y_tick_font_family = ""
    if x_top_tick_font_family.lower() in {"", "auto", "inherit"}:
        x_top_tick_font_family = ""
    if y_right_tick_font_family.lower() in {"", "auto", "inherit"}:
        y_right_tick_font_family = ""

    x_label_color = str(ticks_x.get("label_color") or "").strip() if isinstance(ticks_x, dict) else ""
    y_label_color = str(ticks_y.get("label_color") or "").strip() if isinstance(ticks_y, dict) else ""
    x_top_label_color = str(ticks_x.get("top_label_color") or x_label_color).strip() if isinstance(ticks_x, dict) else ""
    y_right_label_color = str(ticks_y.get("right_label_color") or y_label_color).strip() if isinstance(ticks_y, dict) else ""

    x_tick_color = str(ticks_x.get("tick_color") or "").strip() if isinstance(ticks_x, dict) else ""
    y_tick_color = str(ticks_y.get("tick_color") or "").strip() if isinstance(ticks_y, dict) else ""
    x_tick_width = None
    y_tick_width = None
    x_tick_length = None
    y_tick_length = None
    if isinstance(ticks_x, dict) and ticks_x.get("tick_width") is not None:
        try:
            x_tick_width = float(ticks_x.get("tick_width"))
        except Exception:
            x_tick_width = None
    if isinstance(ticks_y, dict) and ticks_y.get("tick_width") is not None:
        try:
            y_tick_width = float(ticks_y.get("tick_width"))
        except Exception:
            y_tick_width = None
    if isinstance(ticks_x, dict) and ticks_x.get("tick_length") is not None:
        try:
            x_tick_length = float(ticks_x.get("tick_length"))
        except Exception:
            x_tick_length = None
    if isinstance(ticks_y, dict) and ticks_y.get("tick_length") is not None:
        try:
            y_tick_length = float(ticks_y.get("tick_length"))
        except Exception:
            y_tick_length = None
    if x_tick_color or x_tick_width is not None or x_tick_length is not None:
        kwargs = {}
        if x_tick_color:
            kwargs["color"] = x_tick_color
        if x_tick_width is not None:
            kwargs["width"] = max(0.1, float(x_tick_width))
        if x_tick_length is not None:
            kwargs["length"] = max(0.0, float(x_tick_length))
        ax.tick_params(axis="x", **kwargs)
    if y_tick_color or y_tick_width is not None or y_tick_length is not None:
        kwargs = {}
        if y_tick_color:
            kwargs["color"] = y_tick_color
        if y_tick_width is not None:
            kwargs["width"] = max(0.1, float(y_tick_width))
        if y_tick_length is not None:
            kwargs["length"] = max(0.0, float(y_tick_length))
        ax.tick_params(axis="y", **kwargs)

    x_rotation = None
    if isinstance(ticks_x, dict) and ticks_x.get("rotation") is not None:
        try:
            x_rotation = float(ticks_x.get("rotation"))
        except Exception:
            x_rotation = None
    if x_rotation is not None:
        for tick in ax.get_xticklabels():
            tick.set_rotation(x_rotation)
            tick.set_ha("right" if x_rotation and abs(x_rotation) >= 15 else "center")

    def _apply_numeric_format(axis: str, fmt: str) -> None:
        fmt = (fmt or "auto").strip().lower()
        if fmt == "auto":
            return
        if fmt not in {"plain", "scientific"}:
            return
        # Skip formatting for datetime and log axes.
        if axis == "x" and (x_scale == "datetime" or x_scale == "log"):
            return
        if axis == "y" and y_scale == "log":
            return
        # Keep scientific notation in normal text font (avoid mathtext font switching).
        formatter = mticker.ScalarFormatter(useMathText=False)
        if fmt == "scientific":
            formatter.set_scientific(True)
            formatter.set_powerlimits((-3, 3))
        else:
            formatter.set_scientific(False)
        if axis == "x":
            ax.xaxis.set_major_formatter(formatter)
        else:
            ax.yaxis.set_major_formatter(formatter)

    if isinstance(ticks_x, dict):
        _apply_numeric_format("x", str(ticks_x.get("format") or "auto"))
    if isinstance(ticks_y, dict):
        _apply_numeric_format("y", str(ticks_y.get("format") or "auto"))

    for tick in ax.xaxis.get_major_ticks():
        if x_font_size is not None:
            tick.label1.set_fontsize(max(1, x_font_size))
        if x_top_font_size is not None:
            tick.label2.set_fontsize(max(1, x_top_font_size))
        if x_tick_font_family:
            tick.label1.set_fontfamily(x_tick_font_family)
        if x_top_tick_font_family:
            tick.label2.set_fontfamily(x_top_tick_font_family)
        if x_label_color:
            tick.label1.set_color(x_label_color)
        if x_top_label_color:
            tick.label2.set_color(x_top_label_color)

    for tick in ax.yaxis.get_major_ticks():
        if y_font_size is not None:
            tick.label1.set_fontsize(max(1, y_font_size))
        if y_right_font_size is not None:
            tick.label2.set_fontsize(max(1, y_right_font_size))
        if y_tick_font_family:
            tick.label1.set_fontfamily(y_tick_font_family)
        if y_right_tick_font_family:
            tick.label2.set_fontfamily(y_right_tick_font_family)
        if y_label_color:
            tick.label1.set_color(y_label_color)
        if y_right_label_color:
            tick.label2.set_color(y_right_label_color)

    if inline_enabled:
        # Inline labels are a legend replacement; keep the plot clean.
        legend_enabled = False

        if inline_points:
            dx = 0.0
            if (
                numeric_x_min is not None
                and numeric_x_max is not None
                and numeric_x_max > numeric_x_min
            ):
                dx = float((numeric_x_max - numeric_x_min) * dx_ratio)
            if not math.isfinite(dx) or dx <= 0:
                dx = 0.0

            x_text_positions: list[float] = []
            for pt in inline_points:
                x_pos_raw = pt.get("label_x")
                x_last_raw = pt.get("x_last")
                x_pos = _as_finite_float(x_pos_raw)
                if x_pos is None:
                    x_last = _as_finite_float(x_last_raw)
                    if x_last is None:
                        continue
                    x_pos = float(x_last + dx)
                if x_scale == "log" and x_pos <= 0:
                    continue
                x_text_positions.append(float(x_pos))

            if x_text_positions:
                x_left, x_right = ax.get_xlim()
                pad = float(abs(dx)) if dx > 0 else 0.0
                if pad <= 0 and numeric_x_min is not None and numeric_x_max is not None:
                    span = float(numeric_x_max - numeric_x_min)
                    if math.isfinite(span) and span > 0:
                        pad = float(span * 0.01)
                if not math.isfinite(pad) or pad <= 0:
                    pad = 0.01
                new_xlim = _expand_xlim_for_inline_labels(
                    x_left=float(x_left),
                    x_right=float(x_right),
                    label_positions=x_text_positions,
                    pad=float(pad),
                )
                if new_xlim is not None:
                    ax.set_xlim(new_xlim[0], new_xlim[1])

            for pt in inline_points:
                label = str(pt.get("label") or "")
                color = str(pt.get("color") or "#1a1a1a")
                x_last = _as_finite_float(pt.get("x_last"))
                y_last = _as_finite_float(pt.get("y_last"))
                if x_last is None or y_last is None:
                    continue
                x_pos = _as_finite_float(pt.get("label_x"))
                y_pos = _as_finite_float(pt.get("label_y"))
                if x_pos is None:
                    x_pos = float(x_last + dx)
                if y_pos is None:
                    y_pos = float(y_last)
                if x_scale == "log" and x_pos <= 0:
                    continue
                if y_scale == "log" and y_pos <= 0:
                    continue
                if not (math.isfinite(x_pos) and math.isfinite(y_pos)):
                    continue
                ax.text(
                    float(x_pos),
                    float(y_pos),
                    str(label),
                    color=str(color),
                    va="center",
                    ha="left",
                    fontsize=max(8, font_size - 2),
                    fontweight="bold",
                    clip_on=False,
                )

    annotations = spec.get("annotations") or []
    if x_scale != "datetime" and annotations:
        y_min, y_max = ax.get_ylim()
        y_span = max(1e-9, (y_max - y_min))
        y_text = y_max - 0.06 * y_span
        for ann in annotations:
            if str(ann.get("type") or "") != "peak_vline":
                continue
            x_val = ann.get("x")
            if not isinstance(x_val, (int, float)):
                continue
            color = ann.get("color") or "#c73e3a"
            text = str(ann.get("text") or f"{float(x_val):.2f}")
            ax.axvline(float(x_val), color=color, linestyle="--", alpha=0.55, linewidth=1.0)
            ax.text(
                float(x_val),
                y_text,
                text,
                rotation=90,
                color=color,
                va="top",
                ha="right",
                fontsize=max(8, font_size - 2),
            )

    if plotted_count > 1 and legend_enabled:
        legend = ax.legend(loc=legend_location, fontsize=max(8, font_size - 2))
        for text in legend.get_texts():
            text.set_fontweight("bold")

    axis_font_family = str(axis_text.get("font_family") or "").strip() if isinstance(axis_text, dict) else ""
    if axis_font_family.lower() in {"", "auto", "inherit"}:
        axis_font_family = ""
    axis_font_size = None
    axis_color = None
    if isinstance(axis_text, dict) and axis_text.get("font_size") is not None:
        try:
            axis_font_size = int(axis_text.get("font_size"))
        except Exception:
            axis_font_size = None
    if isinstance(axis_text, dict) and axis_text.get("color") is not None:
        axis_color = str(axis_text.get("color") or "").strip() or None

    axis_kwargs = {"fontweight": "bold"}
    if axis_font_family:
        axis_kwargs["fontfamily"] = axis_font_family
    if axis_font_size is not None:
        axis_kwargs["fontsize"] = max(1, axis_font_size)
    if axis_color:
        axis_kwargs["color"] = axis_color

    ax.set_xlabel(_label_with_unit(spec.get("x_label") or "X", spec.get("x_unit") or ""), **axis_kwargs)
    ax.set_ylabel(_label_with_unit(spec.get("y_label") or "Y", spec.get("y_unit") or ""), **axis_kwargs)

    title = spec.get("title") or ""
    if title:
        title_font_family = str(title_text.get("font_family") or "").strip() if isinstance(title_text, dict) else ""
        if title_font_family.lower() in {"", "auto", "inherit"}:
            title_font_family = ""
        title_font_size = None
        title_color = None
        if isinstance(title_text, dict) and title_text.get("font_size") is not None:
            try:
                title_font_size = int(title_text.get("font_size"))
            except Exception:
                title_font_size = None
        if isinstance(title_text, dict) and title_text.get("color") is not None:
            title_color = str(title_text.get("color") or "").strip() or None

        title_kwargs = {"fontweight": "bold"}
        if title_font_family:
            title_kwargs["fontfamily"] = title_font_family
        if title_font_size is not None:
            title_kwargs["fontsize"] = max(1, title_font_size)
        if title_color:
            title_kwargs["color"] = title_color
        ax.set_title(title, **title_kwargs)

    if grid:
        ax.grid(True, alpha=grid_alpha)

    for tick in list(ax.get_xticklabels()) + list(ax.get_yticklabels()):
        tick.set_fontweight("bold")

    fig.tight_layout()
    fig.savefig(out_path, format=fmt, bbox_inches="tight", facecolor="white")
    if bool(spec.get("analysis_png_output")) and fmt != "png":
        fig.savefig(base / "out.png", format="png", bbox_inches="tight", facecolor="white")
    plt.close(fig)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
