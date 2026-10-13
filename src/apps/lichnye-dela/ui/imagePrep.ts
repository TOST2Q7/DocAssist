import type { ImagePrep } from '../model/transfer';

/*
 * Подготовка фото и сканов в браузере: поворот по EXIF, обрезка 3:4 по центру (фото на документы),
 * уменьшение до нужного размера и JPEG. Если браузер не может прочитать картинку (HEIC в Chrome),
 * возвращает null — тогда в пакет попадает исходный файл.
 */
export const prepareImage: ImagePrep = async (data, { maxSide, crop34 }) => {
  let bmp: ImageBitmap;
  try {
    bmp = await createImageBitmap(new Blob([data as BlobPart]));
  } catch {
    return null;
  }
  let sx = 0;
  let sy = 0;
  let sw = bmp.width;
  let sh = bmp.height;
  if (crop34) {
    const ratio = 3 / 4;
    if (sw / sh > ratio) {
      const w = Math.round(sh * ratio);
      sx = Math.round((sw - w) / 2);
      sw = w;
    } else {
      const h = Math.round(sw / ratio);
      sy = Math.round((sh - h) / 2);
      sh = h;
    }
  }
  const scale = Math.min(1, maxSide / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  // Прозрачный PNG → белый фон, а не чёрный.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, w, h);
  bmp.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.9));
  return blob ? new Uint8Array(await blob.arrayBuffer()) : null;
};
