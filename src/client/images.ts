export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("图片读取失败"));
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
export function dataUrlToBlob(url: string) {
  const [prefix, data] = url.split(",");
  const bin = atob(data);
  return new Blob([Uint8Array.from(bin, (c) => c.charCodeAt(0))], {
    type: prefix.match(/:(.*?);/)?.[1] || "image/jpeg",
  });
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
