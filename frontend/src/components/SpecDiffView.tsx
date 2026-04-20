import { useState } from 'react';
import { useTranslation } from 'react-i18next';

interface DiffItem {
  item_name: string;
  spec_type: string;
  min_value?: number | null;
  max_value?: number | null;
  expected_text?: string | null;
  threshold_value?: number | null;
  threshold_operator?: string | null;
  group_name?: string | null;
  sub_group?: string | null;
}

interface ModifiedItem {
  item_name: string;
  group_name?: string | null;
  sub_group?: string | null;
  old: DiffItem;
  new: DiffItem;
  changes: string[];
}

interface SpecDiff {
  added: DiffItem[];
  removed: DiffItem[];
  modified: ModifiedItem[];
  unchanged: DiffItem[];
  summary: { added: number; removed: number; modified: number; unchanged: number };
}

interface Props {
  diff: SpecDiff;
  collapsed?: boolean;
}

const SPEC_TYPE_LABELS: Record<string, string> = {
  range: 'Range', check: 'Check', text: 'Text',
  threshold: 'Threshold', min: 'Min', max: 'Max',
  exact: 'Exact', skip: 'Skip',
};

function formatSpecValue(item: DiffItem): string {
  if (item.spec_type === 'range' && item.min_value != null && item.max_value != null) {
    return `${item.min_value}~${item.max_value}`;
  }
  if (item.spec_type === 'threshold' && item.threshold_value != null) {
    return `${item.threshold_operator || '>='}${item.threshold_value}`;
  }
  if (item.spec_type === 'check') return '√';
  if (item.expected_text) return item.expected_text;
  if (item.spec_type === 'skip') return '-';
  return '-';
}

export default function SpecDiffView({ diff, collapsed = true }: Props) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(!collapsed);
  const { summary } = diff;

  const hasChanges = summary.added > 0 || summary.removed > 0 || summary.modified > 0;

  return (
    <div className="text-sm">
      {/* Summary bar */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 text-left px-2 py-1 hover:bg-sand/30 rounded transition-colors"
      >
        <span className="text-charcoal/50">{expanded ? '▼' : '▶'}</span>
        <div className="flex gap-3 flex-wrap">
          {summary.added > 0 && (
            <span className="text-forest font-medium">+{summary.added} {t('specs.diffAdded')}</span>
          )}
          {summary.removed > 0 && (
            <span className="text-rust font-medium">-{summary.removed} {t('specs.diffRemoved')}</span>
          )}
          {summary.modified > 0 && (
            <span className="text-terracotta font-medium">~{summary.modified} {t('specs.diffModified')}</span>
          )}
          {!hasChanges && (
            <span className="text-charcoal/50">{t('specs.diffUnchanged')}</span>
          )}
        </div>
      </button>

      {/* Detail table */}
      {expanded && hasChanges && (
        <div className="mt-2 border border-charcoal/10 rounded overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="bg-sand/50">
                <th className="px-2 py-1 text-left font-medium">{t('specs.diffStatus')}</th>
                <th className="px-2 py-1 text-left font-medium">{t('specDetail.itemName')}</th>
                <th className="px-2 py-1 text-left font-medium">{t('specDetail.group')}</th>
                <th className="px-2 py-1 text-left font-medium">{t('specDetail.type')}</th>
                <th className="px-2 py-1 text-left font-medium">{t('specDetail.specValue')}</th>
              </tr>
            </thead>
            <tbody>
              {/* Added items */}
              {diff.added.map((item, i) => (
                <tr key={`add-${i}`} className="bg-forest/5">
                  <td className="px-2 py-1 text-forest font-medium">+</td>
                  <td className="px-2 py-1">{item.item_name}</td>
                  <td className="px-2 py-1 text-charcoal/60">{item.group_name}{item.sub_group ? ` / ${item.sub_group}` : ''}</td>
                  <td className="px-2 py-1">{SPEC_TYPE_LABELS[item.spec_type] || item.spec_type}</td>
                  <td className="px-2 py-1 text-forest">{formatSpecValue(item)}</td>
                </tr>
              ))}
              {/* Removed items */}
              {diff.removed.map((item, i) => (
                <tr key={`rem-${i}`} className="bg-rust/5">
                  <td className="px-2 py-1 text-rust font-medium">-</td>
                  <td className="px-2 py-1 line-through text-charcoal/50">{item.item_name}</td>
                  <td className="px-2 py-1 text-charcoal/40">{item.group_name}{item.sub_group ? ` / ${item.sub_group}` : ''}</td>
                  <td className="px-2 py-1 text-charcoal/50">{SPEC_TYPE_LABELS[item.spec_type] || item.spec_type}</td>
                  <td className="px-2 py-1 text-rust line-through">{formatSpecValue(item)}</td>
                </tr>
              ))}
              {/* Modified items */}
              {diff.modified.map((mod, i) => (
                <tr key={`mod-${i}`} className="bg-terracotta/5">
                  <td className="px-2 py-1 text-terracotta font-medium">~</td>
                  <td className="px-2 py-1">{mod.item_name}</td>
                  <td className="px-2 py-1 text-charcoal/60">{mod.group_name}{mod.sub_group ? ` / ${mod.sub_group}` : ''}</td>
                  <td className="px-2 py-1">
                    {mod.old.spec_type !== mod.new.spec_type ? (
                      <><span className="text-rust line-through">{SPEC_TYPE_LABELS[mod.old.spec_type]}</span> → <span className="text-forest">{SPEC_TYPE_LABELS[mod.new.spec_type]}</span></>
                    ) : (
                      SPEC_TYPE_LABELS[mod.new.spec_type] || mod.new.spec_type
                    )}
                  </td>
                  <td className="px-2 py-1">
                    <span className="text-rust line-through mr-1">{formatSpecValue(mod.old)}</span>
                    <span className="text-charcoal/30 mx-1">→</span>
                    <span className="text-forest">{formatSpecValue(mod.new)}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
