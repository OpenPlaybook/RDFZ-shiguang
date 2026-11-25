import { afterEach, describe, expect, it, vi } from "vitest";
import { createIdleCountdown } from "../src/client/kiosk-idle.js";
afterEach(() => {
  vi.useRealTimers();
});
describe("kiosk idle countdown", () => {
  it("clears only after two idle minutes and restarts when someone uses the terminal", () => {
    vi.useFakeTimers();
    let fired = 0;
    const idle = createIdleCountdown(120_000, () => {
      fired += 1;
    });
    idle.start();
    vi.advanceTimersByTime(119_000);
    expect(fired).toBe(0);
    idle.bump();
    vi.advanceTimersByTime(119_000);
    expect(fired).toBe(0);
    vi.advanceTimersByTime(1_000);
    expect(fired).toBe(1);
    idle.stop();
    vi.advanceTimersByTime(120_000);
    expect(fired).toBe(1);
  });
});