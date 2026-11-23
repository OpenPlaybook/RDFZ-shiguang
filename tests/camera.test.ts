import { describe, it, expect } from "vitest";
import { openCamera, cameraErrorMessage } from "../src/client/camera";
function fixture(play: () => Promise<void> = async () => {}) {
  let stopped = false;
  const stream = {
    getTracks: () => [
      {
        stop: () => {
          stopped = true;
        },
      },
    ],
  } as unknown as MediaStream;
  const video = { srcObject: null, play } as unknown as HTMLVideoElement;
  return { stream, video, stopped: () => stopped };
}
describe("camera acquisition and cleanup", () => {
  it("keeps a successfully playing current stream until its owner stops it", async () => {
    const f = fixture();
    let acquired: MediaStream | undefined;
    expect(
      await openCamera(
        f.video,
        () => true,
        (next) => {
          acquired = next;
        },
        async () => f.stream,
      ),
    ).toBe(f.stream);
    expect(acquired).toBe(f.stream);
    expect(f.video.srcObject).toBe(f.stream);
    expect(f.stopped()).toBe(false);
  });
  it("stops and unbinds a stream when playback fails", async () => {
    const error = new Error("playback failed"),
      f = fixture(async () => {
        throw error;
      });
    await expect(
      openCamera(
        f.video,
        () => true,
        () => {},
        async () => f.stream,
      ),
    ).rejects.toBe(error);
    expect(f.stopped()).toBe(true);
    expect(f.video.srcObject).toBeNull();
  });
  it("drops a late permission result without overwriting a newer camera", async () => {
    const f = fixture(),
      newer = fixture();
    f.video.srcObject = newer.stream;
    expect(
      await openCamera(
        f.video,
        () => false,
        () => {
          throw Error("must not acquire stale result");
        },
        async () => f.stream,
      ),
    ).toBeNull();
    expect(f.stopped()).toBe(true);
    expect(f.video.srcObject).toBe(newer.stream);
    expect(newer.stopped()).toBe(false);
  });
  it("cleans up cancellation during playback without reporting success", async () => {
    let active = true;
    const f = fixture(async () => {
      active = false;
    });
    expect(
      await openCamera(
        f.video,
        () => active,
        () => {},
        async () => f.stream,
      ),
    ).toBeNull();
    expect(f.stopped()).toBe(true);
    expect(f.video.srcObject).toBeNull();
  });
  it("distinguishes permission, unavailable devices and device access errors", () => {
    const message = (name: string) => {
      const e = new Error();
      e.name = name;
      return cameraErrorMessage(e);
    };
    expect(message("NotAllowedError")).toContain("权限被拒绝");
    expect(message("NotFoundError")).toContain("未找到");
    expect(message("NotReadableError")).toContain("占用");
  });
});
