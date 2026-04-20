import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../components/ConfirmDialog';
import { getFormTypes, getFormSpecs, deleteSpec, renameSpec, createSpec, importSpecs } from '../api/client';
import type { FormType } from '../types';

interface SpecListItem {
  id: number;
  equipment_id: string;
  equipment_name: string;
  item_count: number;
  extra_info: Record<string, unknown>;
}

export default function SpecManagement() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formTypes, setFormTypes] = useState<FormType[]>([]);
  const [activeType, setActiveType] = useState('');
  const [specs, setSpecs] = useState<SpecListItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialogs
  const [deleteTarget, setDeleteTarget] = useState<SpecListItem | null>(null);
  const [renameTarget, setRenameTarget] = useState<SpecListItem | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');

  useEffect(() => {
    loadFormTypes();
  }, []);

  useEffect(() => {
    if (activeType) loadSpecs(activeType);
  }, [activeType]);

  const loadFormTypes = async () => {
    try {
      const res = await getFormTypes();
      setFormTypes(res.data);
      if (res.data.length > 0) setActiveType(res.data[0].form_code);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const loadSpecs = async (formCode: string) => {
    setLoading(true);
    try {
      const res = await getFormSpecs(formCode, false);
      setSpecs(res.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      await deleteSpec(deleteTarget.id);
      setDeleteTarget(null);
      loadSpecs(activeType);
    } catch (err) {
      console.error(err);
      alert(t('specs.deleteFailed'));
    }
  };

  const handleRename = async () => {
    if (!renameTarget || !renameValue.trim()) return;
    try {
      await renameSpec(renameTarget.id, renameValue.trim());
      setRenameTarget(null);
      loadSpecs(activeType);
    } catch (err) {
      console.error(err);
      alert(t('specs.saveFailed'));
    }
  };

  const handleCreate = async () => {
    if (!newId.trim() || !newName.trim()) return;
    try {
      await createSpec(activeType, { equipment_id: newId.trim(), equipment_name: newName.trim() });
      setShowAddDialog(false);
      setNewId('');
      setNewName('');
      loadSpecs(activeType);
    } catch (err: any) {
      alert(err.response?.data?.detail || t('specs.saveFailed'));
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importSpecs(activeType, file);
      loadSpecs(activeType);
      alert(t('specs.importSuccess'));
    } catch (err) {
      console.error(err);
      alert(t('specs.importFailed'));
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-serif text-charcoal mb-1">{t('specs.title')}</h2>
        <p className="text-warm-gray text-sm">{t('specs.description')}</p>
      </div>

      {/* Form Type Tabs */}
      <div className="flex gap-2 flex-wrap">
        {formTypes.map(ft => (
          <button
            key={ft.form_code}
            onClick={() => setActiveType(ft.form_code)}
            className={`px-4 py-2 text-sm rounded transition-all tracking-wide
              ${activeType === ft.form_code
                ? 'bg-charcoal text-cream'
                : 'bg-white border border-sand/50 text-charcoal hover:bg-paper'
              }`}
          >
            <span className="font-medium">{ft.form_code}</span>
            <span className="ml-2 opacity-70">{ft.form_name}</span>
            <span className="ml-2 text-xs opacity-50">({ft.spec_count})</span>
          </button>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex gap-3">
        <button
          onClick={() => setShowAddDialog(true)}
          className="px-4 py-2 text-sm bg-forest text-cream rounded hover:bg-forest/90
                     transition-colors tracking-wide flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
          {t('specs.addGroup')}
        </button>
        <button
          onClick={() => fileInputRef.current?.click()}
          className="px-4 py-2 text-sm border border-terracotta/40 text-terracotta rounded
                     hover:bg-terracotta/5 transition-colors tracking-wide flex items-center gap-2"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
              d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
          </svg>
          {t('specs.importExcel')}
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".xlsx,.xls"
          className="hidden"
          onChange={handleImport}
        />
      </div>

      {/* Specs Table */}
      {loading ? (
        <div className="text-center py-12 text-warm-gray font-serif">{t('specs.loading')}</div>
      ) : specs.length === 0 ? (
        <div className="text-center py-12">
          <p className="text-warm-gray font-serif mb-2">{t('specs.noSpecs')}</p>
          <p className="text-xs text-warm-gray">{t('specs.noSpecsHint')}</p>
        </div>
      ) : (
        <div className="bg-white border border-sand/50 rounded-lg overflow-hidden shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-paper border-b border-sand/50">
                <th className="px-5 py-3 text-left font-medium text-charcoal tracking-wide">{t('specs.equipmentId')}</th>
                <th className="px-5 py-3 text-left font-medium text-charcoal tracking-wide">{t('specs.equipmentName')}</th>
                <th className="px-5 py-3 text-center font-medium text-charcoal tracking-wide">{t('specs.itemCount')}</th>
                <th className="px-5 py-3 text-center font-medium text-charcoal tracking-wide">{t('specs.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {specs.map((spec, idx) => (
                <tr
                  key={spec.id}
                  onClick={() => navigate(`/specs/${activeType}/${spec.id}`)}
                  className={`border-b border-sand/20 cursor-pointer hover:bg-paper/40 transition-colors
                    ${idx % 2 === 1 ? 'bg-cream/30' : ''}`}
                >
                  <td className="px-5 py-3 text-charcoal font-medium">{spec.equipment_id}</td>
                  <td className="px-5 py-3 text-warm-gray">{spec.equipment_name}</td>
                  <td className="px-5 py-3 text-center text-charcoal">{spec.item_count}</td>
                  <td className="px-5 py-3 text-center" onClick={e => e.stopPropagation()}>
                    <div className="flex justify-center gap-2">
                      <button
                        onClick={() => { setRenameTarget(spec); setRenameValue(spec.equipment_name); }}
                        className="text-xs text-terracotta hover:text-rust transition-colors px-2 py-1
                                   rounded border border-terracotta/20 hover:bg-terracotta/5"
                      >
                        {t('specs.rename')}
                      </button>
                      <button
                        onClick={() => setDeleteTarget(spec)}
                        className="text-xs text-rust hover:text-rust/80 transition-colors px-2 py-1
                                   rounded border border-rust/20 hover:bg-rust/5"
                      >
                        {t('specs.delete')}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Delete Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('specs.confirmDeleteTitle')}
        message={t('specs.confirmDelete', { name: deleteTarget?.equipment_name || '' })}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        danger
      />

      {/* Rename Dialog */}
      {renameTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-ink/40" onClick={() => setRenameTarget(null)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-base font-serif text-charcoal mb-4">{t('specs.rename')}</h3>
            <input
              type="text"
              value={renameValue}
              onChange={e => setRenameValue(e.target.value)}
              placeholder={t('specs.renamePlaceholder')}
              className="w-full border border-sand rounded px-3 py-2 text-sm focus:outline-none focus:border-terracotta mb-4"
              autoFocus
              onKeyDown={e => e.key === 'Enter' && handleRename()}
            />
            <div className="flex justify-end gap-3">
              <button onClick={() => setRenameTarget(null)}
                className="px-4 py-2 text-sm text-warm-gray border border-sand/50 rounded hover:bg-paper">{t('specs.cancel')}</button>
              <button onClick={handleRename}
                className="px-4 py-2 text-sm bg-charcoal text-cream rounded hover:bg-ink">{t('specs.confirm')}</button>
            </div>
          </div>
        </div>
      )}

      {/* Add Group Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-ink/40" onClick={() => setShowAddDialog(false)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-base font-serif text-charcoal mb-4">{t('specs.addGroupTitle')}</h3>
            <div className="space-y-3 mb-4">
              <input
                type="text"
                value={newId}
                onChange={e => setNewId(e.target.value)}
                placeholder={t('specs.addGroupPlaceholder')}
                className="w-full border border-sand rounded px-3 py-2 text-sm focus:outline-none focus:border-terracotta"
                autoFocus
              />
              <input
                type="text"
                value={newName}
                onChange={e => setNewName(e.target.value)}
                placeholder={t('specs.addGroupNamePlaceholder')}
                className="w-full border border-sand rounded px-3 py-2 text-sm focus:outline-none focus:border-terracotta"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAddDialog(false)}
                className="px-4 py-2 text-sm text-warm-gray border border-sand/50 rounded hover:bg-paper">{t('specs.cancel')}</button>
              <button onClick={handleCreate}
                className="px-4 py-2 text-sm bg-forest text-cream rounded hover:bg-forest/90">{t('specs.confirm')}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
