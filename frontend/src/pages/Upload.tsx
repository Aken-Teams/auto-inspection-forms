import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import FileUploader from '../components/FileUploader';
import StepIndicator from '../components/StepIndicator';
import { uploadBatch, downloadUpload, downloadBatch } from '../api/client';
import { downloadBlob } from '../utils/download';

interface UploadResultItem {
  upload_id: number;
  filename: string;
  form_type: string | null;
  form_name: string;
  total_sheets: number;
  results_summary?: { ok: number; ng: number; no_spec: number };
  error?: string;
}

export default function Upload() {
  const { t } = useTranslation();
  const [step, setStep] = useState<0 | 1>(0);
  const [uploading, setUploading] = useState(false);
  const [results, setResults] = useState<UploadResultItem[]>([]);
  const [downloadingId, setDownloadingId] = useState<number | null>(null);
  const [downloadingAll, setDownloadingAll] = useState(false);
  const navigate = useNavigate();

  const steps = [
    { key: 'upload', label: t('upload.step1') },
    { key: 'results', label: t('upload.step2') },
  ];

  const handleUpload = async (files: File[]) => {
    setUploading(true);
    setResults([]);
    try {
      const res = await uploadBatch(files);
      setResults(res.data.results);
      setStep(1);
    } catch (err: any) {
      alert(err.response?.data?.detail || err.message);
    } finally {
      setUploading(false);
    }
  };

  const handleDownloadOne = async (uploadId: number, filename: string) => {
    setDownloadingId(uploadId);
    try {
      const res = await downloadUpload(uploadId);
      downloadBlob(res.data, filename.replace('.xlsx', '_判定结果.xlsx'));
    } catch (err) {
      console.error(err);
      alert(t('upload.downloadFailed'));
    } finally {
      setDownloadingId(null);
    }
  };

  const handleDownloadAll = async () => {
    const ids = results.map(r => r.upload_id).filter(Boolean);
    if (ids.length === 0) return;
    setDownloadingAll(true);
    try {
      const res = await downloadBatch(ids);
      downloadBlob(res.data, 'inspection_results.zip');
    } catch (err) {
      console.error(err);
      alert(t('upload.downloadFailed'));
    } finally {
      setDownloadingAll(false);
    }
  };

  const handleReset = () => {
    setStep(0);
    setResults([]);
  };

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-2xl font-serif text-charcoal mb-1">{t('upload.title')}</h2>
        <p className="text-warm-gray text-sm">{t('upload.description')}</p>
      </div>

      <StepIndicator steps={steps} currentStep={step} />

      {/* Step 1: Upload */}
      {step === 0 && (
        <div className="space-y-8">
          <FileUploader onFilesSelected={handleUpload} uploading={uploading} />
          <div className="grid grid-cols-3 gap-4">
            {[
              { title: t('upload.featureAutoDetect'), desc: t('upload.featureAutoDetectDesc') },
              { title: t('upload.featureSpecMatch'), desc: t('upload.featureSpecMatchDesc') },
              { title: t('upload.featureBatch'), desc: t('upload.featureBatchDesc') },
            ].map(card => (
              <div key={card.title} className="bg-white border border-sand/40 rounded-lg p-5">
                <h4 className="font-serif text-charcoal mb-2 !text-sm">{card.title}</h4>
                <p className="text-xs text-warm-gray leading-relaxed">{card.desc}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Step 2: Results */}
      {step === 1 && (
        <div className="space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-serif text-charcoal !m-0">{t('upload.resultTitle')}</h3>
              <p className="text-sm text-warm-gray mt-1">{t('upload.resultDesc')}</p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={handleReset}
                className="px-4 py-2 text-sm border border-sand/50 text-charcoal rounded
                           hover:bg-paper hover:shadow-sm active:scale-95 transition-all tracking-wide"
              >
                {t('upload.uploadMore')}
              </button>
              {results.length > 1 && (
                <button
                  onClick={handleDownloadAll}
                  disabled={downloadingAll}
                  className="px-4 py-2 bg-charcoal text-cream text-sm rounded
                             hover:bg-ink hover:shadow-md active:scale-95 transition-all tracking-wide
                             flex items-center gap-2 disabled:opacity-50"
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
                  {t('upload.downloadAll')}
                </button>
              )}
            </div>
          </div>

          <div className="space-y-3">
            {results.map((r, i) => (
              <div key={i} className="bg-white border border-sand/50 rounded-lg p-5 hover:shadow-sm transition-all">
                <div className="flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-1">
                      <h4 className="font-medium text-charcoal text-sm truncate !m-0">{r.filename}</h4>
                      {r.form_name && (
                        <span className="text-xs text-terracotta bg-terracotta/10 px-2 py-0.5 rounded tracking-wide">
                          {r.form_name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-warm-gray">
                      {r.total_sheets} {t('upload.sheets')}
                      {r.error && <span className="text-rust ml-2">{r.error}</span>}
                    </p>
                  </div>

                  {r.results_summary && (
                    <div className="flex items-center gap-4 ml-4">
                      {r.results_summary.ok > 0 && (
                        <div className="text-center">
                          <div className="text-lg font-serif text-forest">{r.results_summary.ok}</div>
                          <div className="text-[10px] text-warm-gray tracking-wider">{t('history.ok')}</div>
                        </div>
                      )}
                      {r.results_summary.ng > 0 && (
                        <div className="text-center">
                          <div className="text-lg font-serif text-rust">{r.results_summary.ng}</div>
                          <div className="text-[10px] text-warm-gray tracking-wider">{t('history.ng')}</div>
                        </div>
                      )}
                      {r.results_summary.no_spec > 0 && (
                        <div className="text-center">
                          <div className="text-lg font-serif text-gold">{r.results_summary.no_spec}</div>
                          <div className="text-[10px] text-warm-gray tracking-wider">{t('history.noSpec')}</div>
                        </div>
                      )}
                    </div>
                  )}

                  <div className="flex items-center gap-2 ml-4">
                    <button
                      onClick={() => handleDownloadOne(r.upload_id, r.filename)}
                      disabled={downloadingId === r.upload_id}
                      className="text-xs text-terracotta tracking-wide
                                 px-3 py-1.5 rounded border border-terracotta/30
                                 hover:bg-terracotta/10 hover:border-terracotta/50 hover:shadow-sm
                                 active:scale-95 transition-all disabled:opacity-50
                                 flex items-center gap-1.5"
                    >
                      {downloadingId === r.upload_id ? (
                        <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
                          <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                          <path className="opacity-80" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                      )}
                      {t('upload.download')}
                    </button>
                    <button
                      onClick={() => navigate(`/history/${r.upload_id}`)}
                      className="text-xs text-charcoal tracking-wide
                                 px-3 py-1.5 rounded border border-sand/50
                                 hover:bg-charcoal hover:text-cream hover:border-charcoal hover:shadow-sm
                                 active:scale-95 transition-all"
                    >
                      {t('upload.viewDetail')}
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
