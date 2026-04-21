import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import type { JudgedRow } from '../types';

interface Props {
  headers: { key: string; label: string; group: string }[];
  rows: JudgedRow[];
  hasSpec: boolean;
}

// Only NG cells get colored — OK cells stay clean
const JUDGMENT_CELL_STYLES: Record<string, string> = {
  OK: '',
  NG: 'bg-rose/20 text-rust font-semibold',
  SKIP: '',
  NO_SPEC: 'bg-gold/8',
  ERROR: 'bg-rose/10 text-rust',
};

const ROW_JUDGMENT_STYLES: Record<string, string> = {
  OK: 'text-forest font-semibold',
  NG: 'bg-rose/20 text-rust font-semibold',
  SKIP: 'text-warm-gray',
  NO_SPEC: 'text-warm-gray',
};

// Extra fields from parsers - leading appear before date, trailing after values
const EXTRA_LABELS: Record<string, string> = {
  equipment_id: '设备编号',
  package: 'Package',
  measurer: '测量者',
  inspector: '点检人员',
  supervisor: '领班确认',
  signer: '签名',
};
const LEADING_EXTRAS = ['equipment_id', 'package', 'measurer'];
const TRAILING_EXTRAS = ['inspector', 'supervisor', 'signer'];

export default function InspectionTable({ headers, rows, hasSpec }: Props) {
  const { t } = useTranslation();

  // Filter out "judgment" from data headers — we render our own judgment column
  const dataHeaders = useMemo(() =>
    headers.filter(h => h.key !== 'judgment'),
    [headers]
  );

  // Detect which extra fields have data
  const { leadingExtras, trailingExtras } = useMemo(() => {
    const leading: string[] = [];
    const trailing: string[] = [];
    if (rows.length === 0) return { leadingExtras: leading, trailingExtras: trailing };

    for (const key of LEADING_EXTRAS) {
      if (rows.some(r => r.extra?.[key])) leading.push(key);
    }
    for (const key of TRAILING_EXTRAS) {
      if (rows.some(r => r.extra?.[key])) trailing.push(key);
    }
    return { leadingExtras: leading, trailingExtras: trailing };
  }, [rows]);

  // Group headers (excluding judgment)
  const groups: { group: string; keys: { key: string; label: string }[] }[] = [];
  const groupMap = new Map<string, { key: string; label: string }[]>();

  for (const h of dataHeaders) {
    if (!groupMap.has(h.group)) {
      groupMap.set(h.group, []);
      groups.push({ group: h.group, keys: groupMap.get(h.group)! });
    }
    groupMap.get(h.group)!.push({ key: h.key, label: h.label });
  }

  const allKeys = dataHeaders.map(h => h.key);
  // +1 for the judgment column we always add
  const showJudgment = hasSpec;
  const totalCols = leadingExtras.length + 2 + allKeys.length + (showJudgment ? 1 : 0) + trailingExtras.length;

  return (
    <div className="overflow-x-auto border border-sand/60 rounded-lg bg-white shadow-sm">
      {!hasSpec && (
        <div className="bg-gold/10 border-b border-gold/30 px-4 py-2 text-gold text-sm font-medium tracking-wide">
          {t('table.noSpecWarning')}
        </div>
      )}

      <table className="w-full text-sm">
        {/* Group header */}
        <thead>
          <tr className="bg-charcoal text-cream/90">
            {leadingExtras.map(key => (
              <th key={key}
                  className="px-3 py-2 text-left font-medium text-xs tracking-wider border-r border-charcoal/70"
                  rowSpan={2}>{EXTRA_LABELS[key]}</th>
            ))}
            <th className="px-3 py-2 text-left font-medium text-xs tracking-wider border-r border-charcoal/70"
                rowSpan={2}>{t('table.date')}</th>
            <th className="px-3 py-2 text-left font-medium text-xs tracking-wider border-r border-charcoal/70"
                rowSpan={2}>{t('table.time')}</th>
            {groups.map(g => (
              <th key={g.group}
                  colSpan={g.keys.length}
                  className="px-2 py-1.5 text-center font-medium text-xs tracking-wider border-r border-charcoal/70 bg-charcoal/80">
                {g.group}
              </th>
            ))}
            {showJudgment && (
              <th className="px-3 py-2 text-center font-medium text-xs tracking-wider border-r border-charcoal/70"
                  rowSpan={2}>{t('table.judgment')}</th>
            )}
            {trailingExtras.map(key => (
              <th key={key}
                  className="px-3 py-2 text-left font-medium text-xs tracking-wider border-r border-charcoal/70"
                  rowSpan={2}>{EXTRA_LABELS[key]}</th>
            ))}
          </tr>
          <tr className="bg-ink/90 text-cream/80">
            {dataHeaders.map(h => (
              <th key={h.key}
                  className="px-2 py-1.5 text-center font-normal text-[11px] tracking-wide border-r border-ink/60 whitespace-nowrap">
                {h.label}
              </th>
            ))}
          </tr>

          {/* Spec row */}
          {hasSpec && rows.length > 0 && (
            <tr className="bg-paper border-b border-sand/60">
              <td colSpan={leadingExtras.length + 2} className="px-3 py-1 text-xs text-warm-gray italic font-serif border-r border-sand/40">
                {t('table.spec')}
              </td>
              {allKeys.map(key => {
                const spec = rows[0]?.values?.[key]?.spec || '';
                return (
                  <td key={key} className="px-2 py-1 text-center text-[10px] text-terracotta border-r border-sand/40 whitespace-nowrap">
                    {spec}
                  </td>
                );
              })}
              {showJudgment && (
                <td className="border-r border-sand/40" />
              )}
              {trailingExtras.length > 0 && (
                <td colSpan={trailingExtras.length} className="border-r border-sand/40" />
              )}
            </tr>
          )}
        </thead>

        <tbody>
          {rows.map((row, i) => {
            const rowJudgment = row.row_judgment || 'SKIP';
            const judgmentStyle = ROW_JUDGMENT_STYLES[rowJudgment] || '';

            return (
              <tr key={i} className={`border-b border-sand/30 ${i % 2 === 0 ? 'bg-white' : 'bg-cream/40'} hover:bg-paper/60 transition-colors`}>
                {leadingExtras.map(key => (
                  <td key={key} className="px-3 py-1.5 text-xs text-charcoal whitespace-nowrap border-r border-sand/30">
                    {row.extra?.[key] != null ? String(row.extra[key]) : ''}
                  </td>
                ))}
                <td className="px-3 py-1.5 text-xs text-charcoal whitespace-nowrap border-r border-sand/30">
                  {row.date}
                </td>
                <td className="px-3 py-1.5 text-xs text-charcoal whitespace-nowrap border-r border-sand/30">
                  {row.time}
                </td>
                {allKeys.map(key => {
                  const val = row.values?.[key];
                  const raw = val?.raw;
                  const judgment = val?.judgment || 'SKIP';
                  const cellStyle = JUDGMENT_CELL_STYLES[judgment] || '';

                  return (
                    <td key={key}
                        className={`px-2 py-1.5 text-center text-xs border-r border-sand/30 whitespace-nowrap ${cellStyle}`}
                        title={val?.spec ? `${t('table.spec')}: ${val.spec}` : undefined}>
                      {raw !== null && raw !== undefined ? String(raw) : ''}
                    </td>
                  );
                })}
                {showJudgment && (
                  <td className={`px-2 py-1.5 text-center text-xs border-r border-sand/30 whitespace-nowrap ${judgmentStyle}`}>
                    {rowJudgment !== 'SKIP' ? rowJudgment : ''}
                  </td>
                )}
                {trailingExtras.map(key => (
                  <td key={key} className="px-3 py-1.5 text-xs text-charcoal whitespace-nowrap border-r border-sand/30">
                    {row.extra?.[key] != null ? String(row.extra[key]) : ''}
                  </td>
                ))}
              </tr>
            );
          })}

          {rows.length === 0 && (
            <tr>
              <td colSpan={totalCols} className="px-4 py-8 text-center text-warm-gray font-serif">
                {t('table.noData')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
