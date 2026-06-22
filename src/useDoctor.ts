import { useCallback, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { DoctorReport } from "./types/engine";

export interface SetupStatus { skills: string; pyenv: string; }

// 环境体检控制器:状态提到 App 层持有,跨视图存活 → 进设置页不每次重探。
// - 首开 ensureLoaded() 异步跑一次(check_doctor + get_setup_status,各派生一次 codex/uv 探测),之后读缓存秒开
// - refresh() 手动重新检测
// - checkAcademic() 按需查 codex mcp list(只在展开「文献检索 MCP」面板时跑,不进页面就派生 codex)
export interface DoctorController {
  doctor: DoctorReport | null;
  setup: SetupStatus | null;
  loading: boolean;
  acRegistered: boolean | null; // null = 尚未查
  acChecking: boolean;
  ensureLoaded: () => void;
  refresh: () => void;
  checkAcademic: (force?: boolean) => void;
  setAcRegistered: (v: boolean) => void;
}

export function useDoctor(): DoctorController {
  const [doctor, setDoctor] = useState<DoctorReport | null>(null);
  const [setup, setSetup] = useState<SetupStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [acRegistered, setAcRegisteredState] = useState<boolean | null>(null);
  const [acChecking, setAcChecking] = useState(false);

  const loadedRef = useRef(false);
  const loadingRef = useRef(false);
  const acCheckedRef = useRef(false);
  // T7:用 ref 做 in-flight guard,避免闭包陈旧导致并发两次 codex mcp list
  const acCheckingRef = useRef(false);

  // T7:checkAcademic 用 ref guard 防并发,useCallback([]) 稳定引用
  // T6:定义在 refresh 之前,使 refresh 可直接引用
  const checkAcademic = useCallback((force = false) => {
    if ((acCheckedRef.current && !force) || acCheckingRef.current) return;
    acCheckingRef.current = true;
    setAcChecking(true);
    invoke<boolean>("check_academic_search")
      .then((v) => { setAcRegisteredState(v); acCheckedRef.current = true; })
      .catch(() => { acCheckedRef.current = true; })
      .finally(() => { acCheckingRef.current = false; setAcChecking(false); });
  }, []);

  const refresh = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    Promise.allSettled([
      invoke<DoctorReport>("check_doctor"),
      invoke<SetupStatus>("get_setup_status"),
    ]).then((res) => {
      const [d, s] = res;
      // T4:仅 check_doctor 成功才标记已加载;失败不锁,下次进设置 ensureLoaded 可重试
      if (d.status === "fulfilled") { setDoctor(d.value); loadedRef.current = true; }
      if (s.status === "fulfilled") setSetup(s.value);
      // T6:若 MCP 已被查过,重新检测时一并刷新注册态(配合登录/重新检测)
      if (acCheckedRef.current) checkAcademic(true);
    }).finally(() => {
      loadingRef.current = false;
      setLoading(false);
    });
  }, [checkAcademic]);

  const ensureLoaded = useCallback(() => {
    if (loadedRef.current || loadingRef.current) return;
    refresh();
  }, [refresh]);

  const setAcRegistered = useCallback((v: boolean) => {
    setAcRegisteredState(v);
    acCheckedRef.current = true;
  }, []);

  return { doctor, setup, loading, acRegistered, acChecking, ensureLoaded, refresh, checkAcademic, setAcRegistered };
}
