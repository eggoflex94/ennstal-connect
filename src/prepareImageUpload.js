export function fittedImageSize(width, height, maxEdge = 1920) {
  if (!(width > 0 && height > 0)) throw new Error('Das Bild konnte nicht gelesen werden.');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}
export async function prepareImageUpload(file, { maxEdge = 1920, quality = 0.82 } = {}) {
  if (!file?.size || /image\/gif/i.test(file.type) || /\.gif$/i.test(file.name || '')) return file;
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image(); img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('Das Bild konnte nicht verarbeitet werden. Bitte JPG, PNG oder WebP verwenden.'));
      img.src = url;
    });
    const size = fittedImageSize(image.naturalWidth, image.naturalHeight, maxEdge);
    const canvas = document.createElement('canvas'); Object.assign(canvas, size);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Bildverarbeitung ist in diesem Browser nicht verfügbar.');
    ctx.drawImage(image, 0, 0, size.width, size.height);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/webp', quality));
    if (!blob) throw new Error('Das Bild konnte nicht komprimiert werden.');
    if (blob.size >= file.size && image.naturalWidth === size.width && image.naturalHeight === size.height) return file;
    const extension = blob.type === 'image/webp' ? 'webp' : blob.type === 'image/jpeg' ? 'jpg' : 'png';
    return new File([blob], `${(file.name || 'image').replace(/\.[^.]+$/, '')}.${extension}`, { type: blob.type });
  } finally { URL.revokeObjectURL(url); }
}
