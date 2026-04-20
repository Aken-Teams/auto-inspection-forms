import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import StatusBadge from '../components/StatusBadge';
import InspectionTable from '../components/InspectionTable';
import { useToast } from '../components/Toast';
import { getUploadDetail, downloadUpload, downloadSheet } from '../api/client';
import { downloadBlob } from '../utils/download';
import type { UploadDetail, SheetResult } from '../types';

export default function ResultDetail() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [detail, setDetail] = useState<UploadDetail | null>(null);
  const [activeSheet, setActiveSheet] = useState<number>(0);
  const [loading, setLoading] = useState(true);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const [downloadingSheet, setDownloadingSheet] = useState(false);

  useEffect(() => {
    if (id) loadDetail(parseInt(id));
  }, [id]);

  const loadDetail = async (uploadId: number) => {
    setLoading(true);
    try {
      const res = await getUploadDetail(uploadId);
      setDetail(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDownloadAll = async () => {
    if (!detail) return;
    setDownloadingAll(true);
    try {
      const res = await downloadUpload(detail.id);
      downloadBlob(res.data, detail.filename.replace('.xlsx', '_判定结果.xlsx'));
    } catch (err) {
      console.error(err);
      toast(t('upload.downloadFailed'), 'error');
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleDownloadSheet = async (result: SheetResult) => {
    setDownloadingSheet(true);
    try {
      const res = await downloadSheet(result.id);
      downloadBlob(res.data, `${result.sheet_name}_判定结果.xlsx`);
    } catch (err) {
      console.error(err);
      toast(t('upload.downloadFailed'), 'error');
    } finally {
      setDownloadingSheet(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-warm-gray font-serif text-lg">{t('common.loading')}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="text-center py-20">
        <p className="text-warm-gray font-serif">{t('table.noData')}</p>
      </div>
    );
  }

  const currentSheet = detail.sheets[activeSheet];

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/history')}
            className="text-xs text-warm-gray hover:text-terracotta hover:underline transition-colors tracking-wide mb-2 inline-block"
          >
            &larr; {t('detail.backToList')}
          </button>
          <h2 className="text-xl font-serif text-charcoal mb-1">{detail.filename}</h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-terracotta bg-terracotta/10 px-2 py-0.5 rounded tracking-wide">
              {detail.form_name}
            </span>
            <span className="text-xs text-warm-gray">
              {detail.upload_time ? new Date(detail.upload_time).toLocaleString('zh-CN') : ''}
            </span>
          </div>
        </div>
        <button
          onClick={handleDownloadAll}
          disabled={downloadingAll}
          className="px-4 py-2 bg-charcoal text-cream text-sm rounded
                     hover:bg-ink hover:shadow-md active:scale-95 transition-all
                     tracking-wide flex items-center gap-2 disabled:opacity-50"
        >
          {downloadingAll ? (
            <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
              <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          ) : (
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          )}
          {t('detail.downloadAll')}
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-4 gap-4">
        <div className="bg-white border border-sand/50 rounded-lg p-4 text-center">
          <div className="text-2xl font-serif text-charcoal">{detail.sheets.length}</div>
          <div className="text-xs text-warm-gray tracking-wider mt-1">{t('detail.totalSheets')}</div>
        </div>
        <div className="bg-white border border-sage/30 rounded-lg p-4 text-center">
          <div className="text-2xl font-serif text-forest">
            {detail.sheets.filter(s => s.overall_result === 'OK').length}
          </div>
          <div className="text-xs text-warm-gray tracking-wider mt-1">{t('detail.ok')}</div>
        </div>
        <div className="bg-white border border-rose/30 rounded-lg p-4 text-center">
          <div className="text-2xl font-serif text-rust">
            {detail.sheets.filter(s => s.overall_result === 'NG').length}
          </div>
          <div className="text-xs text-warm-gray tracking-wider mt-1">{t('detail.ng')}</div>
        </div>
        <div className="bg-white border border-gold/30 rounded-lg p-4 text-center">
          <div className="text-2xl font-serif text-gold">
            {detail.sheets.filter(s => s.overall_result === 'NO_SPEC').length}
          </div>
          <div className="text-xs text-warm-gray tracking-wider mt-1">{t('detail.noSpec')}</div>
        </div>
      </div>

      {/* Sheet Tabs - horizontal scroll only */}
      <div className="border-b border-sand/50">
        <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-0">
          {detail.sheets.map((sheet, i) => (
            <button
              key={sheet.id}
              onClick={() => setActiveSheet(i)}
              className={`px-4 py-2 text-sm whitespace-nowrap transition-all rounded-t flex items-center gap-2 shrink-0
                ${activeSheet === i
                  ? 'bg-white border border-b-0 border-sand/50 text-charcoal font-medium -mb-[1px]'
                  : 'text-warm-gray hover:text-charcoal hover:bg-paper/50'
                }`}
            >
              {sheet.sheet_name}
              <StatusBadge status={sheet.overall_result} size="sm" />
            </button>
          ))}
        </div>
      </div>

      {/* Active Sheet Content */}
      {currentSheet && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <h3 className="text-base font-serif text-charcoal !m-0">{currentSheet.sheet_name}</h3>
              <StatusBadge status={currentSheet.overall_result} size="md" />
              {currentSheet.equipment_id && (
                <span className="text-xs text-warm-gray">
                  {t('detail.equipment')}: {currentSheet.equipment_id}
                </span>
              )}
            </div>
            <button
              onClick={() => handleDownloadSheet(currentSheet)}
              disabled={downloadingSheet}
              className="text-xs text-terracotta tracking-wide
                         px-3 py-1.5 rounded border border-terracotta/30
                         hover:bg-terracotta/10 hover:border-terracotta/50 hover:shadow-sm
                         active:scale-95 transition-all disabled:opacity-50
                         flex items-center gap-1.5"
            >
              {downloadingSheet ? (
                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                </svg>
              )}
              {t('detail.downloadSheet')}
            </button>
          </div>

          {/* Judgment Summary */}
          {currentSheet.judged_data?.summary && currentSheet.has_spec && (
            <div className="flex gap-6 text-xs text-warm-gray bg-paper rounded-lg px-4 py-2">
              <span>{t('detail.inspectionItems')}: <strong className="text-charcoal">{currentSheet.judged_data.summary.total}</strong></span>
              <span>{t('detail.ok')}: <strong className="text-forest">{currentSheet.judged_data.summary.ok}</strong></span>
              <span>{t('detail.ng')}: <strong className="text-rust">{currentSheet.judged_data.summary.ng}</strong></span>
              <span>{t('detail.skip')}: <strong className="text-warm-gray">{currentSheet.judged_data.summary.skip}</strong></span>
            </div>
          )}

          {/* Data Table */}
          <InspectionTable
            headers={currentSheet.raw_data?.headers || []}
            rows={currentSheet.judged_data?.judged_rows || []}
            hasSpec={currentSheet.has_spec}
          />
        </div>
      )}
    </div>
  );
}
