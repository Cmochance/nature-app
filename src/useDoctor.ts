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

  const refresh = useCallback(() => {
    if (loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);
    Promise.allSettled([
      invoke<DoctorReport>("check_doctor"),
      invoke<SetupStatus>("get_setup_status"),
    ]).then((res) => {
      const [d, s] = res;
      if (d.status === "fulfilled") setDoctor(d.value);
      if (s.status === "fulfilled") setSetup(s.value);
      loadedRef.current = true;
    }).finally(() => {
      loadingRef.current = false;
      setLoading(false);
    });
  }, []);

  const ensureLoaded = useCallback(() => {
    if (loadedRef.current || loadingRef.current) return;
    refresh();
  }, [refresh]);

  const checkAcademic = useCallback((force = false) => {
    if ((acCheckedRef.current && !force) || acChecking) return;
    setAcChecking(true);
    invoke<boolean>("check_academic_search")
      .then((v) => { setAcRegisteredState(v); acCheckedRef.current = true; })
      .catch(() => { acCheckedRef.current = true; })
      .finally(() => setAcChecking(false));
  }, [acChecking]);

  const setAcRegistered = useCallback((v: boolean) => {
    setAcRegisteredState(v);
    acCheckedRef.current = true;
  }, []);

  return { doctor, setup, loading, acRegistered, acChecking, ensureLoaded, refresh, checkAcademic, setAcRegistered };
}
