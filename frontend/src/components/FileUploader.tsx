import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';

interface Props {
  onFilesSelected: (files: File[]) => void;
  uploading: boolean;
}

export default function FileUploader({ onFilesSelected, uploading }: Props) {
  const { t } = useTranslation();
  const [dragOver, setDragOver] = useState(false);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files).filter(f =>
      f.name.endsWith('.xlsx') || f.name.endsWith('.xls')
    );
    if (files.length) onFilesSelected(files);
  }, [onFilesSelected]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (files.length) onFilesSelected(files);
    e.target.value = '';
  }, [onFilesSelected]);

  return (
    <div
      onDragOver={e => { e.preventDefault(); setDragOver(true); }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      className={`
        relative border-2 border-dashed rounded-lg p-12 text-center
        transition-all duration-300 cursor-pointer
        ${dragOver
          ? 'border-gold bg-gold/5 scale-[1.01]'
          : 'border-sand hover:border-terracotta/50 hover:bg-paper/50'
        }
        ${uploading ? 'opacity-50 pointer-events-none' : ''}
      `}
    >
      <input
        type="file"
        multiple
        accept=".xlsx,.xls"
        onChange={handleChange}
        className="absolute inset-0 opacity-0 cursor-pointer"
        disabled={uploading}
      />

      <div className="mb-4">
        <svg className="mx-auto w-12 h-12 text-warm-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
        </svg>
      </div>

      <p className="text-charcoal font-serif text-lg mb-2">
        {uploading ? t('upload.processing') : t('upload.dropzone')}
      </p>
      <p className="text-warm-gray text-sm">
        {t('upload.dropzoneHint')}
      </p>

      {uploading && (
        <div className="mt-4">
          <div className="w-48 mx-auto h-1 bg-sand rounded-full overflow-hidden">
            <div className="h-full bg-gold rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
        </div>
      )}
    </div>
  );
}
