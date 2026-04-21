import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Toast';
import { getFormSpecs, updateSpec } from '../api/client';
import SpecVersionHistory from '../components/SpecVersionHistory';
import type { FormSpec, SpecItemData } from '../types';

function CustomSelect({ value, onChange, options, className = '' }: {
  value: string;
  onChange: (val: string) => void;
  options: { value: string; label: string; desc?: string }[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const hasDesc = options.some(o => o.desc);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const selected = options.find(o => o.value === value);

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between border border-sand rounded px-2 py-1.5 text-sm
                   bg-white hover:border-terracotta/50 focus:outline-none focus:border-terracotta transition-colors"
      >
        <span className="truncate text-charcoal">{selected?.label || value}</span>
        <svg className={`w-3.5 h-3.5 text-warm-gray ml-1 shrink-0 transition-transform ${open ? 'rotate-180' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {open && (
        <div className={`absolute z-50 top-full mt-1 left-0 bg-white border border-sand rounded shadow-lg py-1 max-h-60 overflow-y-auto
          ${hasDesc ? 'w-56' : 'w-full'}`}>
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false); }}
              className={`w-full text-left px-3 py-1.5 transition-colors
                ${opt.value === value
                  ? 'bg-terracotta/10 text-terracotta'
                  : 'text-charcoal hover:bg-sand/30'}`}
            >
              <span className={`text-sm ${opt.value === value ? 'font-medium' : ''}`}>{opt.label}</span>
              {opt.desc && <span className="block text-[11px] text-warm-gray leading-tight mt-0.5">{opt.desc}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function HelpTip({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <span ref={ref} className="relative inline-block ml-1">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen(!open); }}
        className="text-warm-gray font-normal cursor-help hover:text-charcoal transition-colors"
      >(?)</button>
      {open && (
        <div className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-1 w-48 px-3 py-2 text-xs font-normal text-charcoal bg-white border border-sand rounded shadow-lg leading-relaxed whitespace-normal">
          {text}
        </div>
      )}
    </span>
  );
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

function formatSpecValue(item: SpecItemData): string {
  switch (item.spec_type) {
    case 'range':
      return `${item.min_value ?? ''} ~ ${item.max_value ?? ''}`;
    case 'min':
      return `≥ ${item.min_value ?? ''}`;
    case 'max':
      return `≤ ${item.max_value ?? ''}`;
    case 'exact':
      return item.expected_text || '';
    case 'threshold':
      return `${item.threshold_operator || ''} ${item.threshold_value ?? ''}`;
    default:
      return '';
  }
}

interface EditItem {
  item_name: string;
  group_name: string;
  sub_group: string;
  spec_type: string;
  min_value: string;
  max_value: string;
  expected_text: string;
  threshold_value: string;
  threshold_operator: string;
}

function toEditItem(item: SpecItemData): EditItem {
  return {
    item_name: item.item_name,
    group_name: item.group_name || '',
    sub_group: item.sub_group || '',
    spec_type: item.spec_type,
    min_value: item.min_value != null ? String(item.min_value) : '',
    max_value: item.max_value != null ? String(item.max_value) : '',
    expected_text: item.expected_text || '',
    threshold_value: item.threshold_value != null ? String(item.threshold_value) : '',
    threshold_operator: item.threshold_operator || '',
  };
}

function emptyEditItem(): EditItem {
  return {
    item_name: '',
    group_name: '',
    sub_group: '',
    spec_type: 'range',
    min_value: '',
    max_value: '',
    expected_text: '',
    threshold_value: '',
    threshold_operator: '',
  };
}

export default function SpecDetail() {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { formCode, specId } = useParams<{ formCode: string; specId: string }>();
  const navigate = useNavigate();

  const [spec, setSpec] = useState<FormSpec | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [editItems, setEditItems] = useState<EditItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [showVersions, setShowVersions] = useState(false);
  const [versionKey, setVersionKey] = useState(0);

  useEffect(() => {
    if (formCode && specId) loadSpec();
  }, [formCode, specId]);

  const loadSpec = async () => {
    setLoading(true);
    try {
      const res = await getFormSpecs(formCode!, true);
      const found = res.data.find((s: FormSpec) => s.id === parseInt(specId!));
      setSpec(found || null);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const startEdit = () => {
    if (!spec) return;
    setEditItems(spec.items.map(toEditItem));
    setEditing(true);
  };

  const cancelEdit = () => {
    setEditing(false);
    setEditItems([]);
  };

  const addItem = () => {
    setEditItems([...editItems, emptyEditItem()]);
  };

  const removeItem = (idx: number) => {
    setEditItems(editItems.filter((_, i) => i !== idx));
  };

  const updateField = (idx: number, field: keyof EditItem, value: string) => {
    const updated = [...editItems];
    updated[idx] = { ...updated[idx], [field]: value };
    setEditItems(updated);
  };

  const handleSave = async () => {
    if (!spec) return;
    setSaving(true);
    try {
      const items = editItems
        .filter(e => e.item_name.trim())
        .map(e => ({
          item_name: e.item_name.trim(),
          spec_type: e.spec_type,
          min_value: e.min_value ? parseFloat(e.min_value) : null,
          max_value: e.max_value ? parseFloat(e.max_value) : null,
          expected_text: e.expected_text || null,
          threshold_value: e.threshold_value ? parseFloat(e.threshold_value) : null,
          threshold_operator: e.threshold_operator || null,
          group_name: e.group_name || null,
          sub_group: e.sub_group || null,
        }));
      await updateSpec(spec.id, { items });
      setEditing(false);
      loadSpec();
    } catch (err) {
      console.error(err);
      toast(t('specs.saveFailed'), 'error');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <p className="text-warm-gray font-serif text-lg">{t('common.loading')}</p>
      </div>
    );
  }

  if (!spec) {
    return (
      <div className="text-center py-20">
        <p className="text-warm-gray font-serif">{t('table.noData')}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Breadcrumb & Header */}
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate('/specs')}
            className="text-xs text-warm-gray hover:text-terracotta transition-colors tracking-wide mb-2 inline-block"
          >
            &larr; {t('specDetail.backToList')}
          </button>
          <h2 className="text-xl font-serif text-charcoal mb-1">
            {spec.equipment_name}
          </h2>
          <div className="flex items-center gap-3">
            <span className="text-xs text-terracotta bg-terracotta/10 px-2 py-0.5 rounded tracking-wide">
              {formCode}
            </span>
            <span className="text-xs text-warm-gray">
              {spec.equipment_id}
            </span>
            <span className="text-xs text-warm-gray">
              {spec.items.length} {t('specs.itemCount')}
            </span>
          </div>
        </div>
        <div className="flex gap-2">
          {editing ? (
            <>
              <button
                onClick={cancelEdit}
                className="px-4 py-2 text-sm text-warm-gray border border-sand/50 rounded hover:bg-paper transition-colors"
              >
                {t('specDetail.cancel')}
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="px-4 py-2 text-sm bg-forest text-cream rounded hover:bg-forest/90 transition-colors disabled:opacity-50"
              >
                {saving ? t('common.loading') : t('specDetail.save')}
              </button>
            </>
          ) : (
            <>
              <button
                onClick={() => setShowVersions(!showVersions)}
                className={`px-4 py-2 text-sm border rounded tracking-wide flex items-center gap-2 transition-colors
                  ${showVersions
                    ? 'border-terracotta/50 text-terracotta bg-terracotta/5'
                    : 'border-sand/50 text-warm-gray hover:text-charcoal hover:bg-paper'}`}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                {t('specs.versionHistory')}
              </button>
              <button
                onClick={startEdit}
                className="px-4 py-2 text-sm bg-charcoal text-cream rounded hover:bg-ink transition-colors tracking-wide flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
                {t('specDetail.edit')}
              </button>
            </>
          )}
        </div>
      </div>

      {/* Items Table */}
      {!editing ? (
        spec.items.length === 0 ? (
          <div className="text-center py-12">
            <p className="text-warm-gray font-serif mb-2">{t('specDetail.noItems')}</p>
            <p className="text-xs text-warm-gray">{t('specDetail.noItemsHint')}</p>
          </div>
        ) : (
          <div className="bg-white border border-sand/50 rounded-lg overflow-hidden shadow-sm">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-paper border-b border-sand/50">
                  <th className="px-4 py-3 text-left font-medium text-charcoal tracking-wide w-8">#</th>
                  <th className="px-4 py-3 text-left font-medium text-charcoal tracking-wide">{t('specDetail.itemName')}<HelpTip text={t('specDetail.itemNameHint')} /></th>
                  <th className="px-4 py-3 text-left font-medium text-charcoal tracking-wide">{t('specDetail.group')}<HelpTip text={t('specDetail.groupHint')} /></th>
                  <th className="px-4 py-3 text-left font-medium text-charcoal tracking-wide">{t('specDetail.subGroup')}<HelpTip text={t('specDetail.subGroupHint')} /></th>
                  <th className="px-4 py-3 text-center font-medium text-charcoal tracking-wide">{t('specDetail.type')}<HelpTip text={t('specDetail.typeHint')} /></th>
                  <th className="px-4 py-3 text-center font-medium text-charcoal tracking-wide">{t('specDetail.specValue')}<HelpTip text={t('specDetail.specValueHint')} /></th>
                </tr>
              </thead>
              <tbody>
                {spec.items.map((item, idx) => (
                  <tr key={item.id}
                    className={`border-b border-sand/20 ${idx % 2 === 1 ? 'bg-cream/30' : ''}`}
                  >
                    <td className="px-4 py-2.5 text-warm-gray text-xs">{idx + 1}</td>
                    <td className="px-4 py-2.5 text-charcoal font-medium">{item.item_name}</td>
                    <td className="px-4 py-2.5 text-warm-gray">{item.group_name || '-'}</td>
                    <td className="px-4 py-2.5 text-warm-gray">{item.sub_group || '-'}</td>
                    <td className="px-4 py-2.5 text-center">
                      <span className="text-xs px-2 py-0.5 rounded bg-sand/30 text-charcoal">
                        {t(SPEC_TYPE_KEYS[item.spec_type] || `specDetail.specTypeRange`)}
                      </span>
                    </td>
                    <td className="px-4 py-2.5 text-center text-terracotta font-medium">
                      {formatSpecValue(item)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* Edit Mode */
        <div className="space-y-3">
          {editItems.map((item, idx) => (
            <div key={idx} className="bg-white border border-sand/50 rounded-lg p-4 flex gap-3 items-start">
              <span className="text-xs text-warm-gray mt-2 w-6 shrink-0">{idx + 1}</span>
              <div className="flex-1 grid grid-cols-6 gap-3">
                <div className="col-span-2">
                  <label className="text-[10px] text-warm-gray tracking-wide">{t('specDetail.itemName')}</label>
                  <input
                    type="text"
                    value={item.item_name}
                    onChange={e => updateField(idx, 'item_name', e.target.value)}
                    className="w-full border border-sand rounded px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-warm-gray tracking-wide">{t('specDetail.group')}</label>
                  <input
                    type="text"
                    value={item.group_name}
                    onChange={e => updateField(idx, 'group_name', e.target.value)}
                    className="w-full border border-sand rounded px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-warm-gray tracking-wide">{t('specDetail.subGroup')}</label>
                  <input
                    type="text"
                    value={item.sub_group}
                    onChange={e => updateField(idx, 'sub_group', e.target.value)}
                    className="w-full border border-sand rounded px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta"
                  />
                </div>
                <div>
                  <label className="text-[10px] text-warm-gray tracking-wide">{t('specDetail.type')}</label>
                  <CustomSelect
                    value={item.spec_type}
                    onChange={val => updateField(idx, 'spec_type', val)}
                    options={[
                      { value: 'range', label: t('specDetail.specTypeRange'), desc: t('specDetail.specTypeRangeDesc') },
                      { value: 'check', label: t('specDetail.specTypeCheck'), desc: t('specDetail.specTypeCheckDesc') },
                      { value: 'text', label: t('specDetail.specTypeText'), desc: t('specDetail.specTypeTextDesc') },
                      { value: 'threshold', label: t('specDetail.specTypeThreshold'), desc: t('specDetail.specTypeThresholdDesc') },
                      { value: 'min', label: t('specDetail.specTypeMin'), desc: t('specDetail.specTypeMinDesc') },
                      { value: 'max', label: t('specDetail.specTypeMax'), desc: t('specDetail.specTypeMaxDesc') },
                      { value: 'exact', label: t('specDetail.specTypeExact'), desc: t('specDetail.specTypeExactDesc') },
                    ]}
                  />
                </div>
                <div>
                  <label className="text-[10px] text-warm-gray tracking-wide">{t('specDetail.specValue')}</label>
                  {item.spec_type === 'range' ? (
                    <div className="flex gap-1 items-center">
                      <input type="text" value={item.min_value}
                        onChange={e => updateField(idx, 'min_value', e.target.value)}
                        className="w-full border border-sand rounded px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta"
                        placeholder="min" />
                      <span className="text-warm-gray">~</span>
                      <input type="text" value={item.max_value}
                        onChange={e => updateField(idx, 'max_value', e.target.value)}
                        className="w-full border border-sand rounded px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta"
                        placeholder="max" />
                    </div>
                  ) : item.spec_type === 'min' ? (
                    <input type="text" value={item.min_value}
                      onChange={e => updateField(idx, 'min_value', e.target.value)}
                      className="w-full border border-sand rounded px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta"
                      placeholder="≥" />
                  ) : item.spec_type === 'max' ? (
                    <input type="text" value={item.max_value}
                      onChange={e => updateField(idx, 'max_value', e.target.value)}
                      className="w-full border border-sand rounded px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta"
                      placeholder="≤" />
                  ) : item.spec_type === 'exact' ? (
                    <input type="text" value={item.expected_text}
                      onChange={e => updateField(idx, 'expected_text', e.target.value)}
                      className="w-full border border-sand rounded px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta" />
                  ) : (
                    <div className="flex gap-1 items-center">
                      <CustomSelect
                        value={item.threshold_operator}
                        onChange={val => updateField(idx, 'threshold_operator', val)}
                        className="w-14 shrink-0"
                        options={[
                          { value: '=', label: '=' },
                          { value: '!=', label: '\u2260' },
                          { value: '<', label: '<' },
                          { value: '<=', label: '\u2264' },
                          { value: '>', label: '>' },
                          { value: '>=', label: '\u2265' },
                          { value: '~', label: '\u2248' },
                          { value: '+-', label: '\u00B1' },
                        ]}
                      />
                      <input type="text" value={item.threshold_value}
                        onChange={e => updateField(idx, 'threshold_value', e.target.value)}
                        className="w-full border border-sand rounded px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta" />
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => removeItem(idx)}
                className="text-rust hover:text-rust/70 mt-5 shrink-0"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ))}

          <button
            onClick={addItem}
            className="w-full border-2 border-dashed border-sand/60 rounded-lg py-3 text-sm text-warm-gray
                       hover:border-terracotta/40 hover:text-terracotta transition-colors flex items-center justify-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('specDetail.addItem')}
          </button>
        </div>
      )}

      {/* Version History Panel */}
      {showVersions && !editing && (
        <div className="mt-6">
          <h3 className="text-sm font-serif text-charcoal mb-3 flex items-center gap-2">
            <svg className="w-4 h-4 text-terracotta" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            {t('specs.versionHistory')}
          </h3>
          <SpecVersionHistory
            key={versionKey}
            specId={spec.id}
            onRollback={() => { loadSpec(); setVersionKey(k => k + 1); }}
          />
        </div>
      )}
    </div>
  );
}
