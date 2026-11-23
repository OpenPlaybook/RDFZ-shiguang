type CameraPolicy = { allowsFeature(name: string): boolean };
export function cameraAvailabilityMessage(): string | null {
  if (!window.isSecureContext) return "摄像头需要通过 HTTPS 安全页面使用";
  if (!navigator.mediaDevices?.getUserMedia)
    return "当前浏览器不支持摄像头，请使用系统浏览器或相册上传";
  const doc = document as Document & {
    permissionsPolicy?: CameraPolicy;
    featurePolicy?: CameraPolicy;
  };
  const policy = doc.permissionsPolicy ?? doc.featurePolicy;
  if (policy && !policy.allowsFeature("camera"))
    return "当前页面未开放摄像头权限，请刷新页面后重试或联系管理员";
  return null;
}
export function cameraErrorMessage(error: unknown): string {
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return "摄像头权限被拒绝，请在浏览器的网站设置和系统隐私设置中允许摄像头";
  if (name === "NotFoundError")
    return "未找到可用摄像头，请连接设备或使用相册上传";
  if (name === "NotReadableError" || name === "AbortError")
    return "摄像头暂时无法读取，可能被其他应用占用，请关闭后重试";
  return "摄像头预览未能启动，请重试或使用相册上传";
}
export async function openCamera(
  video: HTMLVideoElement,
  isCurrent: () => boolean,
  onAcquired: (stream: MediaStream) => void,
  acquire: () => Promise<MediaStream> = () =>
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: "environment" } },
      audio: false,
    }),
): Promise<MediaStream | null> {
  const next = await acquire();
  const release = () => {
    next.getTracks().forEach((track) => track.stop());
    if (video.srcObject === next) video.srcObject = null;
  };
  try {
    if (!isCurrent()) {
      release();
      return null;
    }
    onAcquired(next);
    video.srcObject = next;
    await video.play();
    if (!isCurrent()) {
      release();
      return null;
    }
    return next;
  } catch (error) {
    release();
    throw error;
  }
}
