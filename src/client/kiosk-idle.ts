/** 公共终端闲置计时。到点后由调用方清空表单，不退出终端账号。 */
export function createIdleCountdown(limitMs: number, onFire: () => void) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let startedAt = 0;
  function clear() {
    if (timer) clearTimeout(timer);
    timer = undefined;
  }
  function arm() {
    clear();
    startedAt = Date.now();
    timer = setTimeout(onFire, limitMs);
  }
  return {
    start: arm,
    bump: arm,
    remaining() {
      if (!timer) return 0;
      return Math.max(0, limitMs - (Date.now() - startedAt));
    },
    stop: clear,
  };
}
