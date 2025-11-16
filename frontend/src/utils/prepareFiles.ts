import { compressImageToUnderLimit, MAX_FILE_BYTES } from './imageCompress';

export type PreparedFile = { name: string; blob: Blob; type: string };

export async function prepareFilesForUpload(files: File[], limitCount = 20): Promise<PreparedFile[]> {
  if (files.length > limitCount) {
    throw new Error(`한 번에 최대 ${limitCount}개까지 업로드할 수 있어요.`);
  }

  const prepared: PreparedFile[] = [];

  for (const f of files) {
    const type = f.type;
    if (type.startsWith('image/')) {
      const blob = await compressImageToUnderLimit(f, MAX_FILE_BYTES);
      const base = f.name.replace(/\.[^/.]+$/, '');
      prepared.push({ name: `${base}.jpg`, blob, type: 'image/jpeg' });
    } else if (type.startsWith('video/')) {
      if (f.size > MAX_FILE_BYTES) {
        throw new Error('영상은 20MB 이하만 업로드할 수 있어요. 30초 내 촬영을 권장합니다.');
      }
      prepared.push({ name: f.name, blob: f, type });
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


