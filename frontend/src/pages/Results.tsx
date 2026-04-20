import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUploadBatches, downloadUpload, downloadBatch } from '../api/client';
import { downloadBlob } from '../utils/download';
import type { UploadBatch, UploadListItem } from '../types';

export default function Results() {
  const { t } = useTranslation();
  const [batches, setBatches] = useState<UploadBatch[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [expandedBatch, setExpandedBatch] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadingBatchId, setDownloadingBatchId] = useState<string | null>(null);
  const navigate = useNavigate();
  const pageSize = 10;

  useEffect(() => {
    loadBatches();
  }, [page]);

  const loadBatches = async () => {
    setLoading(true);
    try {
      const res = await getUploadBatches(page, pageSize);
      setBatches(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadFile = async (id: number, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingId(id);
    try {
      const res = await downloadUpload(id);
      downloadBlob(res.data, filename.replace('.xlsx', '_判定结果.xlsx'));
    } catch (err) {
      console.error(err);
      alert(t('upload.downloadFailed'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadBatch = async (batch: UploadBatch, e: React.MouseEvent) => {
    e.stopPropagation();
    setDownloadingBatchId(batch.batch_id);
    try {
      const ids = batch.files.map(f => f.id);
      const res = await downloadBatch(ids);
      downloadBlob(res.data, `batch_${batch.batch_id.slice(0, 8)}.zip`);
    } catch (err) {
      console.error(err);
      alert(t('upload.downloadFailed'));
    } finally {
      setDownloadingBatchId(null);
    }
  };

  const toggleExpand = (batchId: string) => {
    setExpandedBatch(prev => prev === batchId ? null : batchId);
  };

  const totalPages = Math.ceil(total / pageSize);

  const SpinnerIcon = () => (
    <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
      <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );

  const DownloadIcon = () => (
    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
        d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
    </svg>
  );

  const batchBorderStyle = (ok: number, ng: number, noSpec: number) => {
    if (ng > 0) return 'border-rust/30 bg-rust/5';
    if (ok > 0 && noSpec === 0) return 'border-forest/30 bg-forest/5';
    return 'border-sand/40 bg-white';
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h2 className="text-2xl font-serif text-charcoal mb-1">{t('history.title')}</h2>
        <p className="text-warm-gray text-sm">{t('history.totalRecords', { count: total })}</p>
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-warm-gray font-serif">{t('history.loading')}</div>
      ) : batches.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-warm-gray font-serif">{t('history.empty')}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map(batch => {
            const isExpanded = expandedBatch === batch.batch_id;
            return (
              <div key={batch.batch_id}
                className={`border rounded-lg overflow-hidden transition-all ${batchBorderStyle(batch.ok_count, batch.ng_count, batch.no_spec_count)}`}>
                {/* Batch Header */}
                <div
                  onClick={() => toggleExpand(batch.batch_id)}
                  className="flex items-center px-5 py-4 cursor-pointer hover:bg-paper/50 transition-all group"
                >
                  {/* Expand arrow */}
                  <svg
                    className={`w-4 h-4 text-warm-gray mr-3 transition-transform shrink-0 ${isExpanded ? 'rotate-90' : ''}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>

                  {/* File count badge */}
                  <div className="w-10 h-10 rounded-lg bg-charcoal text-cream flex items-center justify-center font-serif font-bold text-sm mr-4 shrink-0">
                    {batch.file_count}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-sm font-medium text-charcoal">
                        {batch.file_count} {t('history.batchFiles')}
                      </span>
                      <span className="text-xs text-warm-gray">·</span>
                      <span className="text-xs text-warm-gray">
                        {batch.total_sheets} {t('history.sheets')}
                      </span>
                      {batch.form_types.map(ft => (
                        <span key={ft} className="text-[10px] bg-terracotta/10 text-terracotta px-1.5 py-0.5 rounded">
                          {ft}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center gap-3">
                      {batch.ok_count > 0 && (
                        <span className="text-xs text-forest font-medium">{batch.ok_count} {t('history.ok')}</span>
                      )}
                      {batch.ng_count > 0 && (
                        <span className="text-xs text-rust font-medium">{batch.ng_count} {t('history.ng')}</span>
                      )}
                      {batch.no_spec_count > 0 && (
                        <span className="text-xs text-gold font-medium">{batch.no_spec_count} {t('history.noSpec')}</span>
                      )}
                    </div>
                  </div>

                  {/* Time */}
                  <div className="text-xs text-warm-gray mr-4 shrink-0">
                    {batch.upload_time ? new Date(batch.upload_time).toLocaleString('zh-CN') : ''}
                  </div>

                  {/* Batch Download */}
                  <button
                    onClick={(e) => handleDownloadBatch(batch, e)}
                    disabled={downloadingBatchId === batch.batch_id}
                    className="px-3 py-1.5 text-xs text-charcoal border border-sand/50 rounded
                               hover:bg-charcoal hover:text-cream hover:shadow-md
                               active:scale-95 transition-all shrink-0 flex items-center gap-1.5
                               disabled:opacity-50"
                    title={t('upload.downloadAll')}
                  >
                    {downloadingBatchId === batch.batch_id ? <SpinnerIcon /> : <DownloadIcon />}
                    {t('upload.downloadAll')}
                  </button>
                </div>

                {/* Expanded: File List */}
                {isExpanded && (
                  <div className="border-t border-sand/30 bg-cream/50">
                    {batch.files.map((file, idx) => (
                      <FileRow
                        key={file.id}
                        file={file}
                        isLast={idx === batch.files.length - 1}
                        downloadingId={downloadingId}
                        onDownload={handleDownloadFile}
                        onClick={() => navigate(`/history/${file.id}`)}
                        t={t}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`px-3 py-1.5 text-sm rounded transition-all
                ${page === i + 1
                  ? 'bg-charcoal text-cream'
                  : 'text-warm-gray border border-sand/50 hover:bg-paper hover:shadow-sm'
                }`}
            >
              {i + 1}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function FileRow({ file, isLast, downloadingId, onDownload, onClick, t }: {
  file: UploadListItem;
  isLast: boolean;
  downloadingId: number | null;
  onDownload: (id: number, filename: string, e: React.MouseEvent) => void;
  onClick: () => void;
  t: (key: string) => string;
}) {
  return (
    <div
      onClick={onClick}
      className={`flex items-center px-5 py-3 pl-12 cursor-pointer
        hover:bg-paper/80 transition-all group
        ${!isLast ? 'border-b border-sand/20' : ''}`}
    >
      {/* File icon */}
      <svg className="w-4 h-4 text-warm-gray mr-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
          d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>

      {/* Filename */}
      <span className="text-sm text-charcoal truncate flex-1 min-w-0 group-hover:text-terracotta transition-colors" title={file.filename}>
        {file.filename}
      </span>

      {/* Form type */}
      <span className="text-[10px] text-terracotta bg-terracotta/10 px-1.5 py-0.5 rounded mx-2 shrink-0">
        {file.form_name || t('history.unrecognized')}
      </span>

      {/* Stats */}
      <div className="flex items-center gap-2 mr-3 shrink-0">
        <span className="text-xs text-warm-gray">{file.total_sheets} {t('history.sheets')}</span>
        {file.ok_count > 0 && <span className="text-[10px] text-forest font-medium">{file.ok_count} OK</span>}
        {file.ng_count > 0 && <span className="text-[10px] text-rust font-medium">{file.ng_count} NG</span>}
      </div>

      {/* Download */}
      <button
        onClick={(e) => onDownload(file.id, file.filename, e)}
        disabled={downloadingId === file.id}
        className="p-1.5 text-warm-gray rounded
                   hover:text-terracotta hover:bg-terracotta/10
                   active:scale-90 transition-all disabled:opacity-50 shrink-0"
        title={t('history.download')}
      >
        {downloadingId === file.id ? (
          <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
            <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
        ) : (
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
        )}
      </button>

      {/* Arrow */}
      <svg className="w-3.5 h-3.5 text-warm-gray opacity-0 group-hover:opacity-100 transition-opacity ml-1 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
      </svg>
    </div>
  );
}
