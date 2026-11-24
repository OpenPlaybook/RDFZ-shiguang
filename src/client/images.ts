export type ImageKind = "jpeg" | "png" | "gif" | "webp" | "heic" | "unknown";

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () =>
      reject(new Error("图片读取失败，请换 JPEG/PNG/WebP 再试"));
    image.src = src;
  });
}

export async function compressImage(
  src: string,
  maxSide = 1024,
  quality = 0.82,
) {
  const image = await loadImage(src);
  const scale = Math.min(1, maxSide / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));
  canvas.getContext("2d")!.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

export function readAsDataURL(file: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || "");
      if (!result.startsWith("data:")) reject(new Error("读取图片失败"));
      else resolve(result);
    };
    reader.onerror = () => reject(new Error("读取图片失败"));
    reader.readAsDataURL(file);
  });
}

/** 按文件头识别真实格式（不信任扩展名 / MIME）。 */
export async function sniffImageKind(file: Blob): Promise<ImageKind> {
  const buf = await file.slice(0, 24).arrayBuffer();
  const b = new Uint8Array(buf);
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return "jpeg";
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47
  )
    return "png";
  if (
    b.length >= 6 &&
    b[0] === 0x47 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x38
  )
    return "gif";
  if (
    b.length >= 12 &&
    b[0] === 0x52 &&
    b[1] === 0x49 &&
    b[2] === 0x46 &&
    b[3] === 0x46 &&
    b[8] === 0x57 &&
    b[9] === 0x45 &&
    b[10] === 0x42 &&
    b[11] === 0x50
  )
    return "webp";
  // ISO BMFF: ....ftypXXXX （HEIC/HEIF/AVIF）
  if (b.length >= 12) {
    const box = String.fromCharCode(b[4], b[5], b[6], b[7]);
    if (box === "ftyp") {
      const brand = String.fromCharCode(b[8], b[9], b[10], b[11]).toLowerCase();
      if (
        brand === "heic" ||
        brand === "heix" ||
        brand === "hevc" ||
        brand === "hevx" ||
        brand === "mif1" ||
        brand === "msf1" ||
        brand === "heif"
      )
        return "heic";
    }
  }
  return "unknown";
}

function canvasToJpegDataUrl(
  source: CanvasImageSource,
  width: number,
  height: number,
  maxSide: number,
  quality: number,
) {
  const scale = Math.min(1, maxSide / Math.max(width, height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  canvas.getContext("2d")!.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", quality);
}

async function heicToJpegBlob(file: Blob, quality: number): Promise<Blob | null> {
  try {
    const mod = await import("heic2any");
    const heic2any = mod.default;
    const result = await heic2any({
      blob: file,
      toType: "image/jpeg",
      quality,
    });
    const out = Array.isArray(result) ? result[0] : result;
    return out instanceof Blob ? out : null;
  } catch {
    return null;
  }
}

/**
 * 把任意可选中的图片转成真正的 JPEG data URL。
 * 顺序：createImageBitmap → heic2any（HEIC）→ 常规 data URL + canvas。
 */
export async function toJpegDataUrl(
  file: Blob,
  maxSide = 960,
  quality = 0.72,
): Promise<string | null> {
  const kind = await sniffImageKind(file);

  try {
    if (typeof createImageBitmap === "function") {
      const bitmap = await createImageBitmap(file);
      try {
        return canvasToJpegDataUrl(
          bitmap,
          bitmap.width,
          bitmap.height,
          maxSide,
          quality,
        );
      } finally {
        bitmap.close?.();
      }
    }
  } catch {
    /* fall through */
  }

  if (kind === "heic" || /heic|heif/i.test(file.type || "")) {
    const converted = await heicToJpegBlob(file, quality);
    if (converted) {
      try {
        if (typeof createImageBitmap === "function") {
          const bitmap = await createImageBitmap(converted);
          try {
            return canvasToJpegDataUrl(
              bitmap,
              bitmap.width,
              bitmap.height,
              maxSide,
              quality,
            );
          } finally {
            bitmap.close?.();
          }
        }
        const dataUrl = await readAsDataURL(converted);
        return await compressImage(dataUrl, maxSide, quality);
      } catch {
        try {
          return await readAsDataURL(converted);
        } catch {
          return null;
        }
      }
    }
  }

  try {
    if (kind === "heic") return null;
    const dataUrl = await readAsDataURL(file);
    if (!/^data:image\/(jpeg|jpg|png|gif|webp|bmp)/i.test(dataUrl))
      return null;
    return await compressImage(dataUrl, maxSide, quality);
  } catch {
    return null;
  }
}

/** @deprecated 使用 toJpegDataUrl */
export async function compressImageFile(
  file: File,
  maxSide = 960,
  quality = 0.72,
) {
  return toJpegDataUrl(file, maxSide, quality);
}

/** 可靠地把 data URL 转成 Blob（避免大图 Uint8Array.from 映射出问题）。 */
export function dataUrlToBlob(url: string) {
  const comma = url.indexOf(",");
  if (comma < 0) throw new Error("无效图片数据");
  const prefix = url.slice(0, comma);
  const data = url.slice(comma + 1);
  const mime = prefix.match(/:(.*?);/)?.[1] || "image/jpeg";
  const isBase64 = /;base64/i.test(prefix);
  if (!isBase64) {
    return new Blob([decodeURIComponent(data)], { type: mime });
  }
  const bin = atob(data);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type: mime });
}

export async function dataUrlToJpegFile(
  url: string,
  filename = "item.jpg",
): Promise<File> {
  const blob = dataUrlToBlob(url);
  // 若已是 jpeg data URL，直接封装；否则再经 canvas 转一次
  if (/^data:image\/jpeg/i.test(url))
    return new File([blob], filename, { type: "image/jpeg" });
  const jpegUrl = await compressImage(url, 1600, 0.85);
  return new File([dataUrlToBlob(jpegUrl)], filename, { type: "image/jpeg" });
}

async function sampleImage(src: string) {
  const image = await loadImage(src);
  const scale = Math.min(1, 160 / Math.max(image.width, image.height));
  const canvas = document.createElement("canvas");
  const w = (canvas.width = Math.max(1, Math.round(image.width * scale)));
  const h = (canvas.height = Math.max(1, Math.round(image.height * scale)));
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(image, 0, 0, w, h);
  return { data: ctx.getImageData(0, 0, w, h).data, w, h };
}
function rgbToHsl(r: number, g: number, b: number) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b),
    min = Math.min(r, g, b);
  let h = 0,
    s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h /= 6;
  }
  return { h: h * 360, s, l };
}

function colorName(h: number, s: number, l: number) {
  if (l < 0.12) return "黑色";
  if (l > 0.88) return "白色";
  if (s < 0.15) return l < 0.4 ? "深灰色" : "浅灰色";
  if (h < 15 || h >= 345) return l > 0.55 ? "粉红色" : "红色";
  if (h < 40) return l > 0.6 ? "橙色" : "棕橙色";
  if (h < 70) return "黄色";
  if (h < 160) return l > 0.45 ? "绿色" : "深绿色";
  if (h < 200) return "青色";
  if (h < 255) return "蓝色";
  if (h < 300) return "紫色";
  return "玫红色";
}

export async function runLocalFallback(dataUrl: string) {
  const { data, w, h } = await sampleImage(dataUrl);
  const buckets = new Map();
  for (let i = 0; i < data.length; i += 16) {
    if (data[i + 3] < 200) continue;
    const { h: hue, s, l } = rgbToHsl(data[i], data[i + 1], data[i + 2]);
    const name = colorName(hue, s, l);
    buckets.set(name, (buckets.get(name) || 0) + 1);
  }
  const main =
    [...buckets.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || "未知颜色";
  const aspect = w / h;
  let kind = "日用品";
  if (aspect > 1.35) kind = "卡片";
  else if (aspect < 0.85) kind = "水杯";
  return `${main}${kind}`;
}
