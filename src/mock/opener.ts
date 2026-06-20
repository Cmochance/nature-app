// ── Mock 实现:@tauri-apps/plugin-opener 的纯浏览器替身 ──

export async function openPath(path: string): Promise<void> {
  console.debug(`[mock] openPath("${path}")`);
  // 浏览器里无法打开系统资源管理器,仅打印日志
}

export async function openUrl(url: string): Promise<void> {
  console.debug(`[mock] openUrl("${url}")`);
  window.open(url, "_blank");
}

export async function revealItemInDir(path: string): Promise<void> {
  console.debug(`[mock] revealItemInDir("${path}")`);
}
