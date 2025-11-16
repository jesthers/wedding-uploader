export const MAX_FILE_BYTES = 20 * 1024 * 1024;

function scaleToMax(width: number, height: number, maxDim: number): { width: number; height: number } {
  if (width <= maxDim && height <= maxDim) return { width, height };
  const ratio = width > height ? maxDim / width : maxDim / height;
  return { width: Math.round(width * ratio), height: Math.round(height * ratio) };
}

async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  const arrayBuffer = await file.arrayBuffer();
  const blob = new Blob([arrayBuffer], { type: file.type });
  return await createImageBitmap(blob);
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (b) => {
        if (b) resolve(b);
        else reject(new Error('이미지 인코딩에 실패했습니다.'));
      },
      'image/jpeg',
      quality,
    );
  });
}

export async function compressImageToUnderLimit(
  file: File,
  maxBytes: number = MAX_FILE_BYTES,
  maxDim: number = 2560,
  initialQuality: number = 0.8,
): Promise<Blob> {
  const bitmap = await fileToImageBitmap(file);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 초기화 실패');

  // 1차 리사이즈
  let { width, height } = scaleToMax(bitmap.width, bitmap.height, maxDim);
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(bitmap, 0, 0, width, height);

  // 1차 품질 루프
  for (let q = initialQuality; q >= 0.5; q -= 0.1) {
    const blob = await canvasToBlob(canvas, Number(q.toFixed(2)));
    if (blob.size <= maxBytes) return blob;
  }

  // 2차: 더 작은 사이즈로 한 번 더 줄이기
  const dim2 = 1920;
  ({ width, height } = scaleToMax(width, height, dim2));
  canvas.width = width;
  canvas.height = height;
  ctx.drawImage(bitmap, 0, 0, width, height);

  for (let q = 0.75; q >= 0.5; q -= 0.05) {
    const blob = await canvasToBlob(canvas, Number(q.toFixed(2)));
    if (blob.size <= maxBytes) return blob;
  }

  throw new Error('이미지를 20MB 이하로 압축할 수 없습니다.');
}

export const __helpers = { scaleToMax, fileToImageBitmap, canvasToBlob };


