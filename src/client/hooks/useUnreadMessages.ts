import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../api";

const POLL_MS = 20_000;

/**
 * 进入应用后轮询未读配对消息；未读增加时回调，供 toast / 弹窗提醒。
 */
export function useUnreadMessages(
  enabled: boolean,
  onNew: (unread: number) => void,
) {
  const [unread, setUnread] = useState(0);
  const known = useRef<number | null>(null);
  const onNewRef = useRef(onNew);
  onNewRef.current = onNew;

  const refresh = useCallback(async (signal?: AbortSignal) => {
    try {
      const data = await api<{ unread: number }>("/api/messages", { signal });
      const next = data.unread || 0;
      setUnread(next);
      if (known.current !== null && next > known.current) {
        onNewRef.current(next);
      }
      known.current = next;
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") return;
      // 游客/未就绪时静默；不打断主流程
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const ctrl = new AbortController();
    void refresh(ctrl.signal);
    const timer = setInterval(() => void refresh(), POLL_MS);
    const onFocus = () => void refresh();
    window.addEventListener("focus", onFocus);
    return () => {
      ctrl.abort();
      clearInterval(timer);
      window.removeEventListener("focus", onFocus);
    };
  }, [enabled, refresh]);

  return { unread, refreshUnread: refresh };
}
