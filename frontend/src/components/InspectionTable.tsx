import { useTranslation } from 'react-i18next';
import type { JudgedRow } from '../types';

interface Props {
  headers: { key: string; label: string; group: string }[];
  rows: JudgedRow[];
  hasSpec: boolean;
}

const JUDGMENT_CELL_STYLES: Record<string, string> = {
  OK: 'bg-sage/15 text-forest',
  NG: 'bg-rose/20 text-rust font-semibold',
  SKIP: '',
  NO_SPEC: 'bg-gold/8',
  ERROR: 'bg-rose/10 text-rust',
};

export default function InspectionTable({ headers, rows, hasSpec }: Props) {
  const { t } = useTranslation();

  // Group headers
  const groups: { group: string; keys: { key: string; label: string }[] }[] = [];
  const groupMap = new Map<string, { key: string; label: string }[]>();

  for (const h of headers) {
    if (!groupMap.has(h.group)) {
      groupMap.set(h.group, []);
      groups.push({ group: h.group, keys: groupMap.get(h.group)! });
    }
    groupMap.get(h.group)!.push({ key: h.key, label: h.label });
  }

  const allKeys = headers.map(h => h.key);

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
          </tr>
          <tr className="bg-ink/90 text-cream/80">
            {headers.map(h => (
              <th key={h.key}
                  className="px-2 py-1.5 text-center font-normal text-[11px] tracking-wide border-r border-ink/60 whitespace-nowrap">
                {h.label}
              </th>
            ))}
          </tr>

          {/* Spec row */}
          {hasSpec && rows.length > 0 && (
            <tr className="bg-paper border-b border-sand/60">
              <td colSpan={2} className="px-3 py-1 text-xs text-warm-gray italic font-serif border-r border-sand/40">
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
            </tr>
          )}
        </thead>

        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className={`border-b border-sand/30 ${i % 2 === 0 ? 'bg-white' : 'bg-cream/40'} hover:bg-paper/60 transition-colors`}>
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
            </tr>
          ))}

          {rows.length === 0 && (
            <tr>
              <td colSpan={allKeys.length + 2} className="px-4 py-8 text-center text-warm-gray font-serif">
                {t('table.noData')}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
