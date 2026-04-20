import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getUploads, downloadUpload, downloadBatch } from '../api/client';
import type { UploadListItem } from '../types';

export default function Results() {
  const { t } = useTranslation();
  const [uploads, setUploads] = useState<UploadListItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const navigate = useNavigate();
  const pageSize = 12;

  useEffect(() => {
    loadUploads();
  }, [page]);

  const loadUploads = async () => {
    setLoading(true);
    try {
      const res = await getUploads(page, pageSize);
      setUploads(res.data.items);
      setTotal(res.data.total);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const toggleSelect = (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleDownloadOne = async (id: number, filename: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await downloadUpload(id);
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = filename.replace('.xlsx', '_判定结果.xlsx');
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const handleBatchDownload = async () => {
    if (selected.size === 0) return;
    try {
      const res = await downloadBatch(Array.from(selected));
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const a = document.createElement('a');
      a.href = url;
      a.download = 'inspection_results.zip';
      a.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error(err);
    }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-serif text-charcoal mb-1">{t('history.title')}</h2>
          <p className="text-warm-gray text-sm">{t('history.totalRecords', { count: total })}</p>
        </div>
        {selected.size > 0 && (
          <button
            onClick={handleBatchDownload}
            className="px-4 py-2 bg-charcoal text-cream text-sm rounded
                       hover:bg-ink transition-colors tracking-wide flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
            {t('history.batchDownload', { count: selected.size })}
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12 text-warm-gray font-serif">{t('history.loading')}</div>
      ) : uploads.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-warm-gray font-serif">{t('history.empty')}</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {uploads.map(u => (
            <div
              key={u.id}
              onClick={() => navigate(`/history/${u.id}`)}
              className={`bg-white border rounded-lg p-5 cursor-pointer transition-all hover:shadow-md
                ${selected.has(u.id) ? 'border-terracotta ring-1 ring-terracotta/30' : 'border-sand/50'}`}
            >
              {/* Top: checkbox + form type */}
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <input
                    type="checkbox"
                    checked={selected.has(u.id)}
                    onChange={() => {}}
                    onClick={(e) => toggleSelect(u.id, e)}
                    className="rounded border-sand text-terracotta focus:ring-terracotta/30 flex-shrink-0 mt-0.5"
                  />
                  <span className="text-xs text-terracotta bg-terracotta/10 px-2 py-0.5 rounded tracking-wide truncate">
                    {u.form_name || t('history.unrecognized')}
                  </span>
                </div>
                <button
                  onClick={(e) => handleDownloadOne(u.id, u.filename, e)}
                  className="text-xs text-warm-gray hover:text-terracotta transition-colors ml-2 flex-shrink-0"
                  title={t('history.download')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              </div>

              {/* Filename */}
              <h4 className="font-medium text-charcoal text-sm truncate !m-0 mb-2" title={u.filename}>
                {u.filename}
              </h4>

              {/* Stats */}
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs text-warm-gray">
                  {u.total_sheets} {t('history.sheets')}
                </span>
                {u.ok_count > 0 && (
                  <span className="text-xs text-forest font-medium">{u.ok_count} {t('history.ok')}</span>
                )}
                {u.ng_count > 0 && (
                  <span className="text-xs text-rust font-medium">{u.ng_count} {t('history.ng')}</span>
                )}
                {u.no_spec_count > 0 && (
                  <span className="text-xs text-gold font-medium">{u.no_spec_count} {t('history.noSpec')}</span>
                )}
              </div>

              {/* Date */}
              <div className="text-xs text-warm-gray">
                {u.upload_time ? new Date(u.upload_time).toLocaleString('zh-CN') : ''}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 pt-4">
          {Array.from({ length: totalPages }, (_, i) => (
            <button
              key={i}
              onClick={() => setPage(i + 1)}
              className={`px-3 py-1.5 text-sm rounded transition-colors
                ${page === i + 1
                  ? 'bg-charcoal text-cream'
                  : 'text-warm-gray border border-sand/50 hover:bg-paper'
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
