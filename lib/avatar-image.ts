import { AVATAR_OUTPUT_SIZE, outputSize, sourceRect, type Point } from "@/lib/avatar";

/** Decodes the picked file. The caller revokes `image.src` (an object URL) when the editor closes. */
export async function loadImage(file: File): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (!image.naturalWidth || !image.naturalHeight) throw new Error("empty image");
    return image;
  } catch (error) { URL.revokeObjectURL(url); throw error; }
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number) { return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality)); }

/** Crops the visible square, scales it to max 512px and compresses it (WebP, JPEG as fallback). */
export async function renderAvatar(image: HTMLImageElement, viewport: number, zoom: number, offset: Point): Promise<Blob> {
  const rect = sourceRect({ width: image.naturalWidth, height: image.naturalHeight }, viewport, zoom, offset);
  const edge = Math.min(AVATAR_OUTPUT_SIZE, outputSize(rect.side));
  const canvas = document.createElement("canvas");
  canvas.width = edge; canvas.height = edge;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas unavailable");
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#fff";
  context.fillRect(0, 0, edge, edge);
  context.drawImage(image, rect.sx, rect.sy, rect.side, rect.side, 0, 0, edge, edge);
  const webp = await toBlob(canvas, "image/webp", 0.85);
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await toBlob(canvas, "image/jpeg", 0.88);
  if (!jpeg) throw new Error("encode failed");
  return jpeg;
}
