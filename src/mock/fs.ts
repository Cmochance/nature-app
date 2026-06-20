// ── Mock 实现:@tauri-apps/plugin-fs 的纯浏览器替身 ──

const MOCK_FILE_CONTENTS: Record<string, string> = {
  "/mock/workdir/chart_v1.png": "# mock 产物脚本内容",
};

export async function readTextFile(path: string): Promise<string> {
  console.debug(`[mock] readTextFile("${path}")`);
  return MOCK_FILE_CONTENTS[path] ?? `# mock: ${path}\n\n(这是 mock 模式下的占位文件内容)`;
}

export async function exists(_path: string): Promise<boolean> {
  return true;
}
