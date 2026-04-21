import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { getSpecVersions, getVersionDetail, rollbackVersion } from '../api/client';
import { useToast } from './Toast';
import ConfirmDialog from './ConfirmDialog';
import SpecDiffView from './SpecDiffView';

interface VersionSummary {
  id: number;
  version_number: number;
  source: string;
  source_filename: string | null;
  file_hash: string | null;
  item_count: number;
  change_summary: { added?: number; removed?: number; modified?: number; unchanged?: number } | null;
  created_at: string;
}

interface VersionDetail {
  id: number;
  form_spec_id: number;
  version_number: number;
  source: string;
  source_filename: string | null;
  stored_filepath: string | null;
  file_hash: string | null;
  items_snapshot: SnapshotItem[];
  item_count: number;
  change_summary: unknown;
  created_at: string;
}

interface SnapshotItem {
  item_name: string;
  spec_type: string;
  min_value?: number | null;
  max_value?: number | null;
  expected_text?: string | null;
  threshold_value?: number | null;
  threshold_operator?: string | null;
  display_order?: number;
  group_name?: string | null;
  sub_group?: string | null;
}

interface Props {
  specId: number;
  onRollback?: () => void;
}

const SPEC_TYPE_KEYS: Record<string, string> = {
  range: 'specDetail.specTypeRange',
  check: 'specDetail.specTypeCheck',
  text: 'specDetail.specTypeText',
  threshold: 'specDetail.specTypeThreshold',
  min: 'specDetail.specTypeMin',
  max: 'specDetail.specTypeMax',
  exact: 'specDetail.specTypeExact',
  skip: 'specDetail.specTypeSkip',
};

function SourceIcon({ source }: { source: string }) {
  if (source === 'import') {
    return (
      <svg className="w-4 h-4 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
      </svg>
    );
  }
  if (source === 'manual_edit') {
    return (
      <svg className="w-4 h-4 text-terracotta" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
      </svg>
    );
  }
  // rollback
  return (
    <svg className="w-4 h-4 text-warm-gray" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a5 5 0 015 5v2M3 10l4-4m-4 4l4 4" />
    </svg>
  );
}

export default function SpecVersionHistory({ specId, onRollback }: Props) {
  const { t } = useTranslation();
  const { toast } = useToast();

  const [versions, setVersions] = useState<VersionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<VersionDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [diffPair, setDiffPair] = useState<{ older: VersionDetail; newer: VersionDetail } | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);

  const [rollbackTarget, setRollbackTarget] = useState<VersionSummary | null>(null);
  const [rollbackBusy, setRollbackBusy] = useState(false);

  useEffect(() => {
    loadVersions();
  }, [specId]);

  const loadVersions = async () => {
    setLoading(true);
    try {
      const res = await getSpecVersions(specId);
      setVersions(res.data);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  };

  const handleExpand = async (v: VersionSummary) => {
    if (expandedId === v.id) {
      setExpandedId(null);
      setDetail(null);
      return;
    }
    setExpandedId(v.id);
    setDetailLoading(true);
    try {
      const res = await getVersionDetail(specId, v.id);
      setDetail(res.data);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleDiff = async (v: VersionSummary) => {
    const idx = versions.findIndex(ver => ver.id === v.id);
    if (idx < 0 || idx >= versions.length - 1) return;

    const older = versions[idx + 1];
    setDiffLoading(true);
    try {
      const [res1, res2] = await Promise.all([
        getVersionDetail(specId, older.id),
        getVersionDetail(specId, v.id),
      ]);
      setDiffPair({ older: res1.data, newer: res2.data });
    } catch {
      // silent
    } finally {
      setDiffLoading(false);
    }
  };

  const handleRollback = async () => {
    if (!rollbackTarget) return;
    setRollbackBusy(true);
    try {
      await rollbackVersion(specId, rollbackTarget.id);
      toast(t('specs.rollbackSuccess'), 'success');
      setRollbackTarget(null);
      loadVersions();
      onRollback?.();
    } catch {
      toast(t('specs.rollbackFailed'), 'error');
    } finally {
      setRollbackBusy(false);
    }
  };

  const sourceLabel = (source: string) => {
    const key = `specs.versionSource${source === 'import' ? 'Import' : source === 'manual_edit' ? 'Manual' : 'Rollback'}`;
    return t(key);
  };

  if (loading) {
    return <p className="text-warm-gray text-sm py-4">{t('common.loading')}</p>;
  }

  if (versions.length === 0) {
    return (
      <p className="text-warm-gray text-sm py-4">{t('specs.noVersions')}</p>
    );
  }

  return (
    <div className="space-y-2">
      {versions.map((v, idx) => (
        <div key={v.id} className="border border-sand/50 rounded-lg bg-white overflow-hidden">
          {/* Version header */}
          <div className="flex items-center justify-between px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-8 h-8 rounded-full bg-paper flex items-center justify-center shrink-0 border border-sand/40">
                <SourceIcon source={v.source} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium text-charcoal text-sm">
                    {t('specs.version', { n: v.version_number })}
                  </span>
                  <span className="text-xs px-1.5 py-0.5 rounded bg-sand/40 text-charcoal/70">
                    {sourceLabel(v.source)}
                  </span>
                  <span className="text-xs text-warm-gray">
                    {t('specs.versionItems', { count: v.item_count })}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-warm-gray">
                  <span>{new Date(v.created_at).toLocaleString()}</span>
                  {v.source_filename && (
                    <span className="truncate max-w-[200px]" title={v.source_filename}>
                      {v.source_filename}
                    </span>
                  )}
                </div>
                {v.change_summary && (
                  <div className="flex gap-2 mt-1 text-xs">
                    {(v.change_summary.added ?? 0) > 0 && (
                      <span className="text-forest">+{v.change_summary.added}</span>
                    )}
                    {(v.change_summary.removed ?? 0) > 0 && (
                      <span className="text-rust">-{v.change_summary.removed}</span>
                    )}
                    {(v.change_summary.modified ?? 0) > 0 && (
                      <span className="text-terracotta">~{v.change_summary.modified}</span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => handleExpand(v)}
                className={`text-xs px-2.5 py-1 rounded transition-colors ${
                  expandedId === v.id
                    ? 'text-terracotta bg-terracotta/10'
                    : 'text-charcoal/60 hover:text-charcoal hover:bg-sand/30'
                }`}
              >
                {expandedId === v.id ? t('specs.cancel') : t('specs.versionView')}
              </button>
              {idx < versions.length - 1 && (
                <button
                  onClick={() => handleDiff(v)}
                  className="text-xs px-2.5 py-1 text-charcoal/60 hover:text-terracotta hover:bg-terracotta/10 rounded transition-colors"
                >
                  {t('specs.versionDiff')}
                </button>
              )}
              {idx > 0 && (
                <button
                  onClick={() => setRollbackTarget(v)}
                  className="text-xs px-2.5 py-1 text-charcoal/60 hover:text-rust hover:bg-rust/10 rounded transition-colors"
                >
                  {t('specs.versionRollback')}
                </button>
              )}
            </div>
          </div>

          {/* Expanded detail */}
          {expandedId === v.id && (
            <div className="border-t border-sand/40 bg-paper/50">
              {detailLoading ? (
                <p className="text-xs text-warm-gray px-4 py-4">{t('common.loading')}</p>
              ) : detail ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-sand/30 border-b border-sand/40">
                        <th className="px-4 py-2 text-left font-medium text-charcoal/70 w-10">#</th>
                        <th className="px-4 py-2 text-left font-medium text-charcoal/70">{t('specDetail.itemName')}</th>
                        <th className="px-4 py-2 text-left font-medium text-charcoal/70">{t('specDetail.group')}</th>
                        <th className="px-4 py-2 text-center font-medium text-charcoal/70">{t('specDetail.type')}</th>
                        <th className="px-4 py-2 text-center font-medium text-charcoal/70">{t('specDetail.specValue')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {detail.items_snapshot.map((item, i) => (
                        <tr key={i} className={`border-b border-sand/20 ${i % 2 === 1 ? 'bg-cream/30' : ''}`}>
                          <td className="px-4 py-2 text-warm-gray text-xs">{i + 1}</td>
                          <td className="px-4 py-2 text-charcoal font-medium">{item.item_name}</td>
                          <td className="px-4 py-2 text-warm-gray">
                            {item.group_name || '-'}
                            {item.sub_group ? ` / ${item.sub_group}` : ''}
                          </td>
                          <td className="px-4 py-2 text-center">
                            <span className="text-xs px-2 py-0.5 rounded bg-sand/30 text-charcoal">
                              {t(SPEC_TYPE_KEYS[item.spec_type] || 'specDetail.specTypeRange')}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-center text-terracotta font-medium">{formatSnapshotValue(item)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ))}

      {/* Diff modal */}
      {(diffPair || diffLoading) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-ink/40" onClick={() => { setDiffPair(null); setDiffLoading(false); }} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-base font-serif text-charcoal">
                {t('specs.versionDiff')}
              </h3>
              <button
                onClick={() => { setDiffPair(null); setDiffLoading(false); }}
                className="text-charcoal/40 hover:text-charcoal"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {diffLoading ? (
              <p className="text-sm text-warm-gray py-8 text-center">{t('common.loading')}</p>
            ) : diffPair ? (
              <div>
                <p className="text-xs text-warm-gray mb-3">
                  {t('specs.version', { n: diffPair.older.version_number })} → {t('specs.version', { n: diffPair.newer.version_number })}
                </p>
                <SpecDiffView
                  diff={computeSnapshotDiff(diffPair.older.items_snapshot, diffPair.newer.items_snapshot)}
                  collapsed={false}
                />
              </div>
            ) : null}
          </div>
        </div>
      )}

      {/* Rollback confirm dialog */}
      <ConfirmDialog
        open={!!rollbackTarget}
        title={t('specs.rollbackConfirmTitle')}
        message={rollbackTarget ? t('specs.rollbackConfirmMessage', { n: rollbackTarget.version_number, count: rollbackTarget.item_count }) : ''}
        onConfirm={handleRollback}
        onCancel={() => setRollbackTarget(null)}
        confirmLabel={rollbackBusy ? t('common.loading') : t('specs.versionRollback')}
        danger
      />
    </div>
  );
}

function formatSnapshotValue(item: SnapshotItem): string {
  switch (item.spec_type) {
    case 'range':
      return `${item.min_value ?? ''} ~ ${item.max_value ?? ''}`;
    case 'min':
      return `>= ${item.min_value ?? ''}`;
    case 'max':
      return `<= ${item.max_value ?? ''}`;
    case 'exact':
      return item.expected_text || '';
    case 'threshold':
      return `${item.threshold_operator || '>='} ${item.threshold_value ?? ''}`;
    case 'check':
      return String.fromCharCode(0x2713);
    case 'skip':
      return '-';
    default:
      return item.expected_text || '-';
  }
}

function computeSnapshotDiff(oldItems: SnapshotItem[], newItems: SnapshotItem[]) {
  const key = (item: SnapshotItem) =>
    `${item.item_name}|${item.group_name || ''}|${item.sub_group || ''}`;

  const oldMap = new Map(oldItems.map(i => [key(i), i]));
  const newMap = new Map(newItems.map(i => [key(i), i]));

  const added: SnapshotItem[] = [];
  const removed: SnapshotItem[] = [];
  const modified: { item_name: string; group_name?: string | null; sub_group?: string | null; old: SnapshotItem; new: SnapshotItem; changes: string[] }[] = [];
  const unchanged: SnapshotItem[] = [];

  for (const [k, item] of newMap) {
    if (!oldMap.has(k)) {
      added.push(item);
    }
  }
  for (const [k, item] of oldMap) {
    if (!newMap.has(k)) {
      removed.push(item);
    }
  }
  for (const [k, newItem] of newMap) {
    const oldItem = oldMap.get(k);
    if (!oldItem) continue;
    const specFields = ['spec_type', 'min_value', 'max_value', 'expected_text', 'threshold_value', 'threshold_operator'] as const;
    const changes = specFields.filter(f => (oldItem as Record<string, unknown>)[f] !== (newItem as Record<string, unknown>)[f]);
    if (changes.length > 0) {
      modified.push({ item_name: newItem.item_name, group_name: newItem.group_name, sub_group: newItem.sub_group, old: oldItem, new: newItem, changes: [...changes] });
    } else {
      unchanged.push(newItem);
    }
  }

  return {
    added,
    removed,
    modified,
    unchanged,
    summary: { added: added.length, removed: removed.length, modified: modified.length, unchanged: unchanged.length },
  };
}
