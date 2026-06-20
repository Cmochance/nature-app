import matplotlib as mpl
import matplotlib.pyplot as plt

# 1. 设置符合 Nature 规范的 rcParams
mpl.rcParams.update({
    "font.family": "sans-serif",
    "font.sans-serif": ["Arial", "Helvetica", "DejaVu Sans", "sans-serif"],
    "svg.fonttype": "none",     # 可在 Illustrator 中编辑的文本
    "pdf.fonttype": 42,         # 保证 PDF 字体可编辑
    "font.size": 11,            # 核心字体大小
    "axes.spines.right": False,
    "axes.spines.top": False,
    "axes.linewidth": 1.0,
    "legend.frameon": False,
})

# 2. 定义数据和调色板
categories = ["A", "B", "C"]
values = [3, 5, 2]

PALETTE = {
    "blue_main":      "#0F4D92",
    "green_3":        "#8BCF8B",
    "red_strong":     "#B64342",
}

colors = [PALETTE["blue_main"], PALETTE["green_3"], PALETTE["red_strong"]]

# 3. 初始化 Figure 和 Axes (横向图表比例调整为 6x4)
fig, ax = plt.subplots(figsize=(6, 4), dpi=300)

# 4. 绘制横向柱状图，设置柱子高度为 0.5，添加黑色细边框
bars = ax.barh(categories, values, color=colors, height=0.5, edgecolor="black", linewidth=1.0)

# 5. 设置坐标轴标签 and 主标题 (交换 X/Y 轴标签)
ax.set_xlabel("Value", fontsize=12, fontweight="bold")
ax.set_ylabel("Category", fontsize=12, fontweight="bold")
ax.set_title("Distribution of A, B, and C", fontsize=14, fontweight="bold", pad=15)

# 设置刻度字体和方向，使 Y 轴方向由上至下 (A -> B -> C)
ax.tick_params(axis="both", which="major", labelsize=11, direction="out", length=4, width=1.0)
ax.invert_yaxis()
ax.set_xlim(0, 6) # X 轴留有 20% 空间，方便数据标签摆放

# 6. 在柱状图右侧标注具体数值
for bar in bars:
    width = bar.get_width()
    ax.annotate(
        f"{width}",
        xy=(width, bar.get_y() + bar.get_height() / 2),
        xytext=(4, 0),  # 向右偏移 4 个点
        textcoords="offset points",
        ha="left",
        va="center",
        fontsize=11,
        fontweight="bold"
    )

# 7. 导出高分辨率图像 (保存为新版本 v2)
plt.tight_layout(pad=2)
fig.savefig("chart_v2.png", dpi=600, bbox_inches="tight")
fig.savefig("chart_v2.svg", bbox_inches="tight")
fig.savefig("chart_v2.pdf", bbox_inches="tight")
plt.close(fig)
