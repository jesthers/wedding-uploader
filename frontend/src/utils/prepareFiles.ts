import { compressImageToUnderLimit, MAX_FILE_BYTES } from './imageCompress';

export type PreparedFile = { name: string; blob: Blob; type: string };

export async function prepareFilesForUpload(files: File[], limitCount = 20): Promise<PreparedFile[]> {
  if (files.length > limitCount) {
    throw new Error(`한 번에 최대 ${limitCount}개까지 업로드할 수 있어요.`);
  }

  const prepared: PreparedFile[] = [];
  // Vercel 서버리스 요청 본문 제한 대비(여유 포함)
  const SERVERLESS_MAX_BYTES = Math.floor(3.5 * 1024 * 1024);

  for (const f of files) {
    const type = f.type;
    if (type.startsWith('image/')) {
      // 이미지: 서버리스 한도 내로 압축
      const blob = await compressImageToUnderLimit(f, Math.min(MAX_FILE_BYTES, SERVERLESS_MAX_BYTES));
      const base = f.name.replace(/\.[^/.]+$/, '');
      prepared.push({ name: `${base}.jpg`, blob, type: 'image/jpeg' });
    } else if (type.startsWith('video/')) {
      // 영상 업로드 비활성화
      throw new Error('영상 업로드는 지원하지 않습니다. 사진만 업로드해주세요.');
    } else {
      throw new Error('이미지/영상 파일만 업로드할 수 있어요.');
    }
  }

  return prepared;
}

export async function uploadInBatches<T>(
  items: T[],
  worker: (item: T, index: number) => Promise<void>,
  concurrency = 3,
): Promise<void> {
  let current = 0;
  let active = 0;
  return new Promise((resolve, reject) => {
    const next = () => {
      if (current >= items.length && active === 0) {
        resolve();
        return;
      }
      while (active < concurrency && current < items.length) {
        const index = current++;
        active++;
        worker(items[index], index)
          .then(() => {
            active--;
            next();
          })
          .catch((e) => {
            reject(e);
          });
      }
    };
    next();
  });
}


