// ── Mock 实现:@tauri-apps/plugin-dialog 的纯浏览器替身 ──

// 浏览器里用原生 file input 模拟文件对话框。
// 为了不阻塞 UI,返回假路径字符串。
export async function open(
  options?: unknown,
): Promise<string | string[] | null> {
  console.debug("[mock] dialog.open()", options);

  // 用原生 <input type=file> 弹出系统选择器
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.style.position = "fixed";
    input.style.left = "-9999px";

    input.addEventListener("change", () => {
      const files = input.files;
      if (!files || files.length === 0) {
        resolve(null);
        return;
      }
      // 浏览器无法获取真实路径,用文件名构造假路径
      const paths = Array.from(files).map(
        (f) => `/mock/uploads/${f.name}`,
      );
      resolve(paths.length === 1 ? paths[0] : paths);
    });

    // 用户取消时 change 不会触发,用 window focus 检测取消
    input.addEventListener("cancel", () => resolve(null));

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  });
}
