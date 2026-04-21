import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { previewImport, confirmImport } from '../api/client';
import SpecDiffView from './SpecDiffView';

interface Props {
  open: boolean;
  formCode: string;
  file: File | null;
  onSuccess: () => void;
  onCancel: () => void;
  toast: (msg: string, type: 'success' | 'error') => void;
}

interface PreviewSpec {
  equipment_id: string;
  equipment_name: string;
  is_new: boolean;
  existing_item_count: number;
  new_item_count: number;
  diff: {
    added: unknown[];
    removed: unknown[];
    modified: unknown[];
    unchanged: unknown[];
    summary: { added: number; removed: number; modified: number; unchanged: number };
  };
  items: unknown[];
}

interface PreviewResult {
  form_code: string;
  file_hash: string;
  original_filename: string;
  file_validation: {
    matches_form_type: boolean | null;
    detected_form_code: string | null;
    is_duplicate: boolean;
    duplicate_info: unknown;
    fingerprint_similarity: number | null;
    warnings: string[];
  };
  structure_validation: {
    valid: boolean;
    warnings: string[];
  };
  parsed_specs: PreviewSpec[];
  parse_method: 'builtin' | 'ai' | 'header' | null;
  ai_confidence: number | null;
  content_identical?: boolean;
  is_blocked?: boolean;
}

export default function ImportPreviewDialog({ open, formCode, file, onSuccess, onCancel, toast }: Props) {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && file) {
      setLoading(true);
      setError(null);
      setPreview(null);
      previewImport(formCode, file)
        .then(res => setPreview(res.data))
        .catch(err => setError(err.response?.data?.detail || t('specs.previewFailed')))
        .finally(() => setLoading(false));
    }
  }, [open, file, formCode, t]);

  const handleConfirm = async () => {
    if (!file) return;
    setConfirming(true);
    try {
      await confirmImport(formCode, file);
      toast(t('specs.importSuccess'), 'success');
      onSuccess();
    } catch (err: unknown) {
      const msg = (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail || t('specs.importFailed');
      toast(msg, 'error');
    } finally {
      setConfirming(false);
    }
  };

  if (!open) return null;

  const hasBlockingIssues = preview && (
    !preview.structure_validation.valid ||
    preview.parsed_specs.length === 0 ||
    preview.file_validation.is_duplicate ||
    preview.content_identical
  );

  const allWarnings = [
    ...(preview?.file_validation.warnings || []),
    ...(preview?.structure_validation.warnings || []),
  ];

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-cream rounded-lg shadow-xl w-full max-w-3xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-charcoal/10">
          <div>
            <h2 className="text-lg font-semibold text-charcoal">{t('specs.importPreview')}</h2>
            {file && <p className="text-xs text-charcoal/50 mt-0.5">{file.name}</p>}
          </div>
          <button onClick={onCancel} className="text-charcoal/40 hover:text-charcoal text-xl">&times;</button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-12">
              <div className="animate-spin rounded-full h-8 w-8 border-2 border-terracotta border-t-transparent mr-3" />
              <span className="text-charcoal/60">{t('specs.previewLoading')}</span>
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="bg-rust/10 border border-rust/30 rounded p-4 text-rust text-sm">
              {error}
            </div>
          )}

          {/* Preview content */}
          {preview && !loading && (
            <>
              {/* File Validation */}
              <div className="bg-sand/30 rounded-lg p-4 space-y-2">
                <h3 className="text-sm font-semibold text-charcoal">{t('specs.fileValidation')}</h3>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-charcoal/60">{t('specs.detectedType')}: </span>
                    <span className="font-medium">
                      {preview.file_validation.detected_form_code || '-'}
                      {preview.file_validation.matches_form_type === true && (
                        <span className="text-forest ml-1">✓</span>
                      )}
                      {preview.file_validation.matches_form_type === false && (
                        <span className="text-rust ml-1">✗</span>
                      )}
                    </span>
                  </div>
                  {preview.file_validation.fingerprint_similarity != null && (
                    <div>
                      <span className="text-charcoal/60">{t('specs.fingerprintMatch')}: </span>
                      <span className="font-medium">
                        {Math.round(preview.file_validation.fingerprint_similarity * 100)}%
                      </span>
                    </div>
                  )}
                  <div>
                    <span className="text-charcoal/60">{t('specs.duplicateCheck')}: </span>
                    <span className={`font-medium ${preview.file_validation.is_duplicate ? 'text-terracotta' : 'text-forest'}`}>
                      {preview.file_validation.is_duplicate ? t('specs.isDuplicate') : t('specs.notDuplicate')}
                    </span>
                  </div>
                  <div>
                    <span className="text-charcoal/60">{t('specs.parseMethod')}: </span>
                    <span className="font-medium">
                      {preview.parse_method === 'builtin'
                        ? t('specs.parseBuiltin')
                        : preview.parse_method === 'header'
                        ? t('specs.parseHeader')
                        : t('specs.parseAI')}
                      {preview.ai_confidence != null && (
                        <span className="text-charcoal/50 ml-1">
                          ({t('specs.aiConfidence')}: {Math.round(preview.ai_confidence * 100)}%)
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>

              {/* Duplicate / identical blocking */}
              {preview.file_validation.is_duplicate && (
                <div className="bg-rust/10 border border-rust/30 rounded-lg p-3 text-sm text-rust font-medium">
                  ✗ {t('specs.duplicateBlocked', '此檔案已匯入過，無法重複匯入')}
                </div>
              )}
              {preview.content_identical && !preview.file_validation.is_duplicate && (
                <div className="bg-rust/10 border border-rust/30 rounded-lg p-3 text-sm text-rust font-medium">
                  ✗ {t('specs.contentIdenticalBlocked', '此檔案的規格內容與現有資料完全相同，無需重複匯入')}
                </div>
              )}

              {/* Warnings */}
              {allWarnings.length > 0 && !(preview.file_validation.is_duplicate || preview.content_identical) && (
                <div className="bg-terracotta/10 border border-terracotta/30 rounded-lg p-3">
                  <div className="text-sm font-medium text-terracotta mb-1">⚠ {t('specs.importWarnings')}</div>
                  <ul className="text-xs text-terracotta/80 space-y-0.5">
                    {allWarnings.map((w, i) => (
                      <li key={i}>• {w}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* AI note */}
              {preview.parse_method === 'ai' && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-xs text-blue-700">
                  {t('specs.aiParserNote')}
                </div>
              )}

              {/* Parsed specs */}
              {preview.parsed_specs.length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold text-charcoal mb-2">
                    {t('specs.equipmentSpecs')} ({preview.parsed_specs.length})
                  </h3>
                  <div className="space-y-2">
                    {preview.parsed_specs.map((spec, i) => (
                      <div key={i} className="border border-charcoal/10 rounded-lg p-3">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-sm">{spec.equipment_id}</span>
                          {spec.equipment_name !== spec.equipment_id && (
                            <span className="text-xs text-charcoal/50">{spec.equipment_name}</span>
                          )}
                          <span className={`text-xs px-1.5 py-0.5 rounded ${spec.is_new ? 'bg-forest/10 text-forest' : 'bg-charcoal/10 text-charcoal/60'}`}>
                            {spec.is_new ? t('specs.specNew') : t('specs.specExisting')}
                          </span>
                          <span className="text-xs text-charcoal/50">
                            {spec.is_new
                              ? `${spec.new_item_count} ${t('specs.itemCount')}`
                              : `${spec.existing_item_count} → ${spec.new_item_count}`
                            }
                          </span>
                        </div>
                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        <SpecDiffView diff={spec.diff as any} collapsed={preview.parsed_specs.length > 2} />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {preview.parsed_specs.length === 0 && !loading && (
                <div className="text-center py-8 text-charcoal/50 text-sm">
                  {t('specs.noSpecsParsed')}
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-charcoal/10">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-charcoal/60 hover:text-charcoal rounded transition-colors"
          >
            {t('specs.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={loading || confirming || !!error || hasBlockingIssues}
            className="px-4 py-2 text-sm bg-terracotta text-cream rounded hover:bg-terracotta/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {confirming ? t('specs.importInProgress') : t('specs.confirmImport')}
          </button>
        </div>
      </div>
    </div>
  );
}
