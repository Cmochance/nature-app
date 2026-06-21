import { open } from "@tauri-apps/plugin-dialog";

// 路径小工具(全 app 共用,避免各组件重复实现)
export function ext(p: string): string {
  const m = p.toLowerCase().match(/\.[a-z0-9]+$/);
  return m ? m[0] : "";
}
export function fileName(p: string): string {
  return p.split("/").pop() ?? p;
}
export function dirOf(p: string): string {
  const i = p.lastIndexOf("/");
  return i > 0 ? p.slice(0, i) : p;
}

// 文件/目录选择器(Home 与 TaskConfig 共用)
export async function pickDir(): Promise<string | null> {
  const dir = await open({ directory: true, multiple: false });
  return typeof dir === "string" ? dir : null;
}
export async function pickFiles(): Promise<string[]> {
  const f = await open({ multiple: true });
  if (Array.isArray(f)) return f as string[];
  if (typeof f === "string") return [f];
  return [];
}
