/*
 * Размер и тип картинки по её байтам — без браузера (нужно, чтобы вставить фото в .docx с верными пропорциями).
 * Понимает JPEG и PNG: только их Word показывает везде.
 */

export type ImageType = 'jpeg' | 'png';

export interface ImageInfo {
  type: ImageType;
  width: number;
  height: number;
}

export function imageType(b: Uint8Array): ImageType | null {
  if (b.length > 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'png';
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'jpeg';
  return null;
}

export function imageInfo(b: Uint8Array): ImageInfo | null {
  const type = imageType(b);
  if (!type) return null;
  const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (type === 'png') {
    if (b.length < 24) return null;
    return { type, width: view.getUint32(16), height: view.getUint32(20) };
  }
  // JPEG: ищем маркер SOF (кадр) — в нём высота и ширина.
  let p = 2;
  while (p + 9 < b.length) {
    if (b[p] !== 0xff) {
      p++;
      continue;
    }
    const marker = b[p + 1];
    if (marker === 0xff) {
      p++;
      continue;
    }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      p += 2;
      continue;
    }
    const len = view.getUint16(p + 2);
    const isSof = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) return { type, height: view.getUint16(p + 5), width: view.getUint16(p + 7) };
    p += 2 + len;
  }
  return null;
}
