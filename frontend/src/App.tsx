import { useState, useRef, useCallback, useEffect } from 'react';
import { ArrowUpTrayIcon } from '@heroicons/react/24/outline';
import { prepareFilesForUpload } from './utils/prepareFiles';

const MAX_FILES = 20;
const MAX_FILE_SIZE_MB = 20;
// 업로드는 서버리스 단일 요청으로 처리

interface SelectedFile {
  file: File;
  preview: string;
  id: string;
}

function App() {
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<SelectedFile[]>([]);
  const [isPreparing, setIsPreparing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [uploadStatus, setUploadStatus] = useState<{
    type: 'success' | 'error' | null;
    message: string;
  }>({ type: null, message: '' });

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);

      if (selectedFiles.length + files.length > MAX_FILES) {
        alert(`한 번에 최대 ${MAX_FILES}개까지 업로드할 수 있습니다.`);
        return;
      }

      const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
      const oversized = files.filter((f) => f.size > maxBytes);
      if (oversized.length > 0) {
        setUploadStatus({
          type: 'error',
          message: `파일당 최대 ${MAX_FILE_SIZE_MB}MB까지만 업로드할 수 있습니다.`,
        });
      }

      const validFiles = files.filter((f) => f.size <= maxBytes);

      const newFiles: SelectedFile[] = validFiles.map((file) => ({
        file,
        preview: URL.createObjectURL(file),
        id: `${Date.now()}-${Math.random()}`,
      }));

      setSelectedFiles((prev) => [...prev, ...newFiles]);

      // Reset input to allow selecting the same file again
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    },
    [selectedFiles.length],
  );

  useEffect(() => {
    if (uploadStatus.type) {
      const timer = window.setTimeout(() => {
        setUploadStatus({ type: null, message: '' });
      }, 3500);
      return () => window.clearTimeout(timer);
    }
  }, [uploadStatus.type]);

  const handleRemoveFile = useCallback((id: string) => {
    setSelectedFiles((prev) => {
      const fileToRemove = prev.find((f) => f.id === id);
      if (fileToRemove) {
        URL.revokeObjectURL(fileToRemove.preview);
      }
      return prev.filter((f) => f.id !== id);
    });
  }, []);

  const validateForm = (): boolean => {
    let isValid = true;
    
    if (!name.trim()) {
      setNameError('이름을 입력해주세요.');
      isValid = false;
    } else {
      setNameError('');
    }

    if (selectedFiles.length === 0) {
      alert('최소 한 개의 사진 또는 영상을 선택해주세요.');
      isValid = false;
    }

    return isValid;
  };

  const handleUpload = async () => {
    if (!validateForm()) {
      return;
    }

    setUploadStatus({ type: null, message: '' });

    try {
      setIsPreparing(true);
      // 전처리
      const toPrepare = selectedFiles.map((s) => s.file);
      const prepared = await prepareFilesForUpload(toPrepare, MAX_FILES);
      setIsPreparing(false);

      // Vercel 서버리스 본문 제한(약 4.5~5MB) 회피: 3.5MB 단위로 배치 업로드
      const MAX_BATCH_BYTES = Math.floor(3.5 * 1024 * 1024);
      const batches: { items: { name: string; blob: Blob; type: string }[]; totalBytes: number }[] = [];
      let current: { items: { name: string; blob: Blob; type: string }[]; totalBytes: number } = { items: [], totalBytes: 0 };
      prepared.forEach((p) => {
        const size = (p.blob as any).size ?? 0;
        if (current.items.length > 0 && current.totalBytes + size > MAX_BATCH_BYTES) {
          batches.push(current);
          current = { items: [], totalBytes: 0 };
        }
        current.items.push(p);
        current.totalBytes += size;
      });
      if (current.items.length > 0) batches.push(current);

      setIsUploading(true);
      setProgress({ done: 0, total: prepared.length });

      for (const b of batches) {
        const form = new FormData();
        form.append('name', name.trim());
        b.items.forEach((item) => {
          form.append('files[]', new File([item.blob], item.name, { type: item.type }));
        });
        const res = await fetch('/api/upload', { method: 'POST', body: form });
        if (!res.ok) {
          const txt = await res.text();
          throw new Error(txt || '업로드 실패');
        }
        setProgress((p) => ({ done: Math.min(p.done + b.items.length, p.total), total: p.total }));
      }

      setUploadStatus({ type: 'success', message: '업로드가 완료되었습니다.\n함께해주셔서 감사합니다.' });
      selectedFiles.forEach((f) => URL.revokeObjectURL(f.preview));
      setSelectedFiles([]);

    } catch (error) {
      setUploadStatus({
        type: 'error',
        message: error instanceof Error 
          ? error.message 
          : '업로드 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
      });
    } finally {
      setIsPreparing(false);
      setIsUploading(false);
    }
  };

  const isUploadDisabled = !name.trim() || selectedFiles.length === 0 || isPreparing || isUploading;

  return (
    <div className="min-h-screen bg-white pt-0 pb-20 px-4">
      <div className="max-w-md mx-auto rounded-2xl p-0">
        <div className="-mx-4 sm:mx-0 mb-6 relative overflow-hidden">
          <div className="w-full h-52 sm:h-64 md:h-72">
            <img
              src="/background2.jpg"
              alt="신랑신부 손 사진"
              className="w-full h-full object-cover"
              loading="lazy"
            />
          </div>
          <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
          <div className="absolute inset-x-0 bottom-0 px-6 pb-6 pt-12 text-white">
            <h3 className="text-2xl font-bold">
              현종❤️지혜 결혼식에 함께해주셔서 감사합니다.
            </h3>
          </div>
        </div>
        <div className="mb-6">
          <div className="bg-gray-50 border border-gray-100 rounded-2xl p-5 space-y-2 text-sm text-gray-700 leading-relaxed">
            <p className="font-semibold">오늘을 빛내주신 여러분의 시선으로 따뜻한 온기를 담아 나눠주세요.</p>
            <p className="whitespace-pre-line">
              {`예쁜 장면, 웃음 가득한 순간, 짧은 영상까지 여러분의 시선으로 오늘을 마음껏 담아주세요.\n오늘의 설렘과 웃음이 여러분의 카메라 속에도 오래 남길 바랍니다.`}
            </p>
          </div>
        </div>

        {/* Name Input */}
        <div className="mb-6">
          <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
            이름
          </label>
          <input
            id="name"
            type="text"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (nameError) setNameError('');
            }}
            placeholder="이름을 입력해주세요"
            className={`w-full px-4 py-3 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent ${
              nameError ? 'border-red-300' : 'border-gray-300'
            }`}
          />
          {nameError && (
            <p className="mt-1 text-sm text-red-600">{nameError}</p>
          )}
        </div>

        {/* Photo Upload Section */}
        <div className="mb-6">
          <label className="block text-sm font-medium text-gray-700 mb-2">
            사진·영상
          </label>
          <div className="relative pb-8">
            <div
              className={`w-full rounded-2xl border border-gray-200 bg-gray-50/60 p-4 min-h-[18rem] flex ${
                selectedFiles.length > 0 ? 'items-start justify-start' : 'items-center justify-center'
              }`}
            >
              {selectedFiles.length === 0 ? (
                <div className="text-center space-y-4">
                  <ArrowUpTrayIcon className="mx-auto w-8 h-8 text-gray-500" strokeWidth={1.6} />
                  <p className="text-sm text-gray-600">
                    기록한 따뜻한 순간들을 나눠주세요.
                  </p>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center px-5 py-2.5 rounded-full bg-blue-500 text-white text-sm font-medium shadow-sm hover:bg-blue-600 active:bg-blue-700 transition-colors"
                  >
                    업로드하기
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-3 gap-3 w-full">
                  {selectedFiles.map((selectedFile) => {
                    const isVideo = selectedFile.file.type.startsWith('video/');
                    return (
                      <div key={selectedFile.id} className="relative aspect-square group">
                        {isVideo ? (
                          <video
                            src={selectedFile.preview}
                            className="w-full h-full object-cover rounded-xl"
                            muted
                            playsInline
                            loop
                            autoPlay
                          />
                        ) : (
                          <img
                            src={selectedFile.preview}
                            alt="Preview"
                            className="w-full h-full object-cover rounded-xl"
                          />
                        )}
                        <button
                          type="button"
                          onClick={() => handleRemoveFile(selectedFile.id)}
                          className="absolute top-1.5 right-1.5 w-7 h-7 bg-gray-900/70 text-white rounded-full flex items-center justify-center opacity-90 hover:opacity-100 active:scale-95 transition"
                          aria-label="삭제"
                        >
                          <span className="text-lg leading-none">×</span>
                        </button>
                      </div>
                    );
                  })}
                  {selectedFiles.length < MAX_FILES && (
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      className="aspect-square rounded-xl border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-500 hover:border-blue-400 hover:text-blue-500 transition"
                    >
                      <span className="text-3xl font-light">+</span>
                    </button>
                  )}
                </div>
              )}
            </div>
            <div className="absolute bottom-2 right-2 text-xs text-gray-500">
              {selectedFiles.length}/{MAX_FILES} 업로드
            </div>
          </div>
        </div>

        {/* Upload hint text (bottom) */}
        <div className="mt-4 mb-4">
          <p className="whitespace-pre-line text-xs text-gray-400 text-center leading-tight">
            {`신부가 AI와 함께 1시간 만에 완성한 서비스입니다.\n가끔 예민해질 수 있으니 업로드가 안되면 카톡으로 보내주세요!`}
          </p>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*,video/*"
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

      </div>

      {/* Bottom Action Button */}
      <div className="fixed bottom-0 left-0 right-0 bg-white/90 backdrop-blur border-t border-gray-100 px-4 py-3">
        <button
          type="button"
          onClick={handleUpload}
          disabled={isUploadDisabled}
          className="max-w-md mx-auto block w-full py-4 px-4 bg-blue-600 text-white rounded-2xl font-semibold text-base shadow-md hover:bg-blue-700 active:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors touch-manipulation"
        >
          {isPreparing
            ? '사진을 업로드하기 좋게 준비 중입니다…'
            : isUploading
            ? `${progress.done} / ${progress.total} 업로드 중…`
            : '신랑 · 신부에게 전달하기'}
        </button>
      </div>

      {/* Toast */}
      {uploadStatus.type && (
        <div className="fixed top-4 right-4 z-50">
          <div
            className={`w-72 rounded-2xl shadow-lg border px-4 py-3 text-sm whitespace-pre-line ${
              uploadStatus.type === 'success'
                ? 'bg-white border-green-200 text-green-700'
                : 'bg-white border-red-200 text-red-700'
            }`}
          >
            {uploadStatus.message}
          </div>
        </div>
      )}
    </div>
  );
}

export default App;

