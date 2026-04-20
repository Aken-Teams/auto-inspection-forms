import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '../components/Toast';
import { getFormSpecs, updateSpec } from '../api/client';
import type { FormSpec, SpecItemData } from '../types';

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
                  <th className="px-4 py-3 text-left font-medium text-charcoal tracking-wide">{t('specDetail.itemName')}</th>
                  <th className="px-4 py-3 text-left font-medium text-charcoal tracking-wide">{t('specDetail.group')}</th>
                  <th className="px-4 py-3 text-left font-medium text-charcoal tracking-wide">{t('specDetail.subGroup')}</th>
                  <th className="px-4 py-3 text-center font-medium text-charcoal tracking-wide">{t('specDetail.type')}</th>
                  <th className="px-4 py-3 text-center font-medium text-charcoal tracking-wide">{t('specDetail.specValue')}</th>
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
                        {item.spec_type}
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
                  <select
                    value={item.spec_type}
                    onChange={e => updateField(idx, 'spec_type', e.target.value)}
                    className="w-full border border-sand rounded px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta bg-white"
                  >
                    <option value="range">range</option>
                    <option value="min">min</option>
                    <option value="max">max</option>
                    <option value="exact">exact</option>
                    <option value="threshold">threshold</option>
                  </select>
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
                      <select value={item.threshold_operator}
                        onChange={e => updateField(idx, 'threshold_operator', e.target.value)}
                        className="w-16 border border-sand rounded px-1 py-1.5 text-sm focus:outline-none focus:border-terracotta bg-white">
                        <option value="<">&lt;</option>
                        <option value="<=">&le;</option>
                        <option value=">">&gt;</option>
                        <option value=">=">&ge;</option>
                      </select>
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
    </div>
  );
}
