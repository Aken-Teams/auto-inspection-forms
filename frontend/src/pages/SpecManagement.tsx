import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../components/ConfirmDialog';
import {
  getFormTypes, getFormSpecs, deleteSpec, renameSpec, createSpec, importSpecs,
  createFormType, patchFormType, deleteFormType,
} from '../api/client';
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

  // Form type dialogs
  const [showAddFormType, setShowAddFormType] = useState(false);
  const [newFtCode, setNewFtCode] = useState('');
  const [newFtName, setNewFtName] = useState('');
  const [newFtPattern, setNewFtPattern] = useState('');
  const [editingFormType, setEditingFormType] = useState<FormType | null>(null);
  const [editFtName, setEditFtName] = useState('');
  const [editFtPattern, setEditFtPattern] = useState('');
  const [deleteFormTypeTarget, setDeleteFormTypeTarget] = useState<FormType | null>(null);

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
      if (res.data.length > 0 && !activeType) setActiveType(res.data[0].form_code);
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

  // Form type CRUD
  const handleCreateFormType = async () => {
    if (!newFtCode.trim() || !newFtName.trim()) return;
    try {
      await createFormType({
        form_code: newFtCode.trim(),
        form_name: newFtName.trim(),
        file_pattern: newFtPattern.trim() || undefined,
      });
      setShowAddFormType(false);
      setNewFtCode('');
      setNewFtName('');
      setNewFtPattern('');
      await loadFormTypes();
      setActiveType(newFtCode.trim());
    } catch (err: any) {
      alert(err.response?.data?.detail || t('specs.saveFailed'));
    }
  };

  const handleEditFormType = async () => {
    if (!editingFormType) return;
    try {
      await patchFormType(editingFormType.form_code, {
        form_name: editFtName.trim() || undefined,
        file_pattern: editFtPattern,
      });
      setEditingFormType(null);
      loadFormTypes();
    } catch (err: any) {
      alert(err.response?.data?.detail || t('specs.saveFailed'));
    }
  };

  const handleDeleteFormType = async () => {
    if (!deleteFormTypeTarget) return;
    try {
      await deleteFormType(deleteFormTypeTarget.form_code);
      setDeleteFormTypeTarget(null);
      const remaining = formTypes.filter(ft => ft.form_code !== deleteFormTypeTarget.form_code);
      if (activeType === deleteFormTypeTarget.form_code && remaining.length > 0) {
        setActiveType(remaining[0].form_code);
      }
      loadFormTypes();
    } catch (err: any) {
      alert(err.response?.data?.detail || t('specs.deleteFailed'));
    }
  };

  const activeFormType = formTypes.find(ft => ft.form_code === activeType);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-serif text-charcoal mb-1">{t('specs.title')}</h2>
        <p className="text-warm-gray text-sm">{t('specs.description')}</p>
      </div>

      {/* Form Types - two-column layout */}
      <div className="grid grid-cols-[280px_1fr] gap-6">
        {/* Left: Form Type List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-medium text-charcoal tracking-wide">{t('specs.formTypeList')}</h3>
            <button
              onClick={() => setShowAddFormType(true)}
              className="p-1.5 text-forest rounded hover:bg-forest/10
                         active:scale-90 transition-all"
              title={t('specs.addFormType')}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
            </button>
          </div>

          <div className="space-y-1.5">
            {formTypes.map(ft => (
              <div
                key={ft.form_code}
                onClick={() => setActiveType(ft.form_code)}
                className={`group px-3 py-2.5 rounded-lg cursor-pointer transition-all
                  ${activeType === ft.form_code
                    ? 'bg-charcoal text-cream shadow-md'
                    : 'bg-white border border-sand/40 hover:bg-paper hover:shadow-sm'
                  }`}
              >
                <div className="flex items-center justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{ft.form_code}</div>
                    <div className={`text-xs truncate ${activeType === ft.form_code ? 'text-cream/70' : 'text-warm-gray'}`}>
                      {ft.form_name}
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0 ml-2">
                    <span className={`text-[10px] px-1.5 py-0.5 rounded
                      ${activeType === ft.form_code ? 'bg-cream/20 text-cream' : 'bg-sand/30 text-charcoal'}`}>
                      {ft.spec_count}
                    </span>
                    {!ft.is_builtin && activeType === ft.form_code && (
                      <div className="flex gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFormType(ft);
                            setEditFtName(ft.form_name);
                            setEditFtPattern(ft.file_pattern || '');
                          }}
                          className="p-1 rounded hover:bg-cream/20 transition-colors"
                          title={t('specs.editMapping')}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteFormTypeTarget(ft); }}
                          className="p-1 rounded hover:bg-rust/20 transition-colors"
                          title={t('specs.delete')}
                        >
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
                {ft.file_pattern && (
                  <div className={`text-[10px] mt-1 truncate font-mono
                    ${activeType === ft.form_code ? 'text-cream/50' : 'text-warm-gray/60'}`}
                    title={ft.file_pattern}
                  >
                    {t('specs.filePattern')}: {ft.file_pattern}
                  </div>
                )}
                {ft.is_builtin && (
                  <div className={`text-[10px] mt-1 ${activeType === ft.form_code ? 'text-cream/50' : 'text-warm-gray/60'}`}>
                    {t('specs.builtIn')}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Right: Spec Groups for selected form type */}
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between">
            <div className="flex gap-3">
              <button
                onClick={() => setShowAddDialog(true)}
                className="px-4 py-2 text-sm bg-forest text-cream rounded
                           hover:bg-forest/90 hover:shadow-md active:scale-95
                           transition-all tracking-wide flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                {t('specs.addGroup')}
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm border border-terracotta/40 text-terracotta rounded
                           hover:bg-terracotta/10 hover:border-terracotta/60 hover:shadow-sm active:scale-95
                           transition-all tracking-wide flex items-center gap-2"
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
            {activeFormType && (
              <div className="text-xs text-warm-gray">
                {activeFormType.form_code} · {specs.length} {t('specs.equipmentGroups')}
              </div>
            )}
          </div>

          {/* Specs Table */}
          {loading ? (
            <div className="text-center py-12 text-warm-gray font-serif">{t('specs.loading')}</div>
          ) : specs.length === 0 ? (
            <div className="bg-white border border-sand/40 rounded-lg p-12 text-center">
              <svg className="mx-auto w-12 h-12 text-sand mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                  d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
              <p className="text-warm-gray font-serif mb-2">{t('specs.noSpecs')}</p>
              <p className="text-xs text-warm-gray mb-6">{t('specs.noSpecsHint')}</p>
              <div className="flex justify-center gap-3">
                <button
                  onClick={() => setShowAddDialog(true)}
                  className="px-4 py-2 text-sm bg-forest text-cream rounded
                             hover:bg-forest/90 hover:shadow-md active:scale-95 transition-all"
                >
                  {t('specs.addGroup')}
                </button>
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 text-sm border border-terracotta/40 text-terracotta rounded
                             hover:bg-terracotta/10 active:scale-95 transition-all"
                >
                  {t('specs.importExcel')}
                </button>
              </div>
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
                      className={`border-b border-sand/20 cursor-pointer
                        hover:bg-terracotta/5 hover:shadow-sm transition-all group
                        ${idx % 2 === 1 ? 'bg-cream/30' : ''}`}
                    >
                      <td className="px-5 py-3.5 text-charcoal font-medium">
                        <div className="flex items-center gap-2">
                          {spec.equipment_id}
                          <span className="text-[10px] text-terracotta opacity-0 group-hover:opacity-100 transition-opacity">
                            {t('specs.clickToViewItems')} &rarr;
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3.5 text-warm-gray">{spec.equipment_name}</td>
                      <td className="px-5 py-3.5 text-center">
                        <span className="text-charcoal bg-sand/30 px-2 py-0.5 rounded text-xs">
                          {spec.item_count}
                        </span>
                      </td>
                      <td className="px-5 py-3.5 text-center" onClick={e => e.stopPropagation()}>
                        <div className="flex justify-center gap-2">
                          <button
                            onClick={() => { setRenameTarget(spec); setRenameValue(spec.equipment_name); }}
                            className="text-xs text-terracotta px-2.5 py-1
                                       rounded border border-terracotta/20
                                       hover:bg-terracotta/10 hover:border-terracotta/40 hover:shadow-sm
                                       active:scale-95 transition-all"
                          >
                            {t('specs.rename')}
                          </button>
                          <button
                            onClick={() => setDeleteTarget(spec)}
                            className="text-xs text-rust px-2.5 py-1
                                       rounded border border-rust/20
                                       hover:bg-rust/10 hover:border-rust/40 hover:shadow-sm
                                       active:scale-95 transition-all"
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
        </div>
      </div>

      {/* Delete Spec Group Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteTarget}
        title={t('specs.confirmDeleteTitle')}
        message={t('specs.confirmDelete', { name: deleteTarget?.equipment_name || '' })}
        onConfirm={handleDelete}
        onCancel={() => setDeleteTarget(null)}
        danger
      />

      {/* Delete Form Type Confirm Dialog */}
      <ConfirmDialog
        open={!!deleteFormTypeTarget}
        title={t('specs.confirmDeleteFormTypeTitle')}
        message={t('specs.confirmDeleteFormType', { name: deleteFormTypeTarget?.form_code || '' })}
        onConfirm={handleDeleteFormType}
        onCancel={() => setDeleteFormTypeTarget(null)}
        danger
      />

      {/* Rename Spec Group Dialog */}
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
                className="px-4 py-2 text-sm text-warm-gray border border-sand/50 rounded
                           hover:bg-paper hover:shadow-sm active:scale-95 transition-all">
                {t('specs.cancel')}
              </button>
              <button onClick={handleRename}
                className="px-4 py-2 text-sm bg-charcoal text-cream rounded
                           hover:bg-ink hover:shadow-md active:scale-95 transition-all">
                {t('specs.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Spec Group Dialog */}
      {showAddDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-ink/40" onClick={() => setShowAddDialog(false)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-base font-serif text-charcoal mb-1">{t('specs.addGroupTitle')}</h3>
            <p className="text-xs text-warm-gray mb-4">
              {activeType && <span className="text-terracotta">{activeType}</span>}
            </p>
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
                className="px-4 py-2 text-sm text-warm-gray border border-sand/50 rounded
                           hover:bg-paper hover:shadow-sm active:scale-95 transition-all">
                {t('specs.cancel')}
              </button>
              <button onClick={handleCreate}
                className="px-4 py-2 text-sm bg-forest text-cream rounded
                           hover:bg-forest/90 hover:shadow-md active:scale-95 transition-all">
                {t('specs.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Form Type Dialog */}
      {showAddFormType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-ink/40" onClick={() => setShowAddFormType(false)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-base font-serif text-charcoal mb-1">{t('specs.addFormType')}</h3>
            <p className="text-xs text-warm-gray mb-4">{t('specs.addFormTypeDesc')}</p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-charcoal font-medium block mb-1">{t('specs.formCode')}</label>
                <input
                  type="text"
                  value={newFtCode}
                  onChange={e => setNewFtCode(e.target.value)}
                  placeholder={t('specs.formCodePlaceholder')}
                  className="w-full border border-sand rounded px-3 py-2 text-sm focus:outline-none focus:border-terracotta"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-charcoal font-medium block mb-1">{t('specs.formNameLabel')}</label>
                <input
                  type="text"
                  value={newFtName}
                  onChange={e => setNewFtName(e.target.value)}
                  placeholder={t('specs.formNamePlaceholder')}
                  className="w-full border border-sand rounded px-3 py-2 text-sm focus:outline-none focus:border-terracotta"
                />
              </div>
              <div>
                <label className="text-xs text-charcoal font-medium block mb-1">{t('specs.filePatternLabel')}</label>
                <input
                  type="text"
                  value={newFtPattern}
                  onChange={e => setNewFtPattern(e.target.value)}
                  placeholder={t('specs.filePatternPlaceholder')}
                  className="w-full border border-sand rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-terracotta"
                  onKeyDown={e => e.key === 'Enter' && handleCreateFormType()}
                />
                <p className="text-[10px] text-warm-gray mt-1">{t('specs.filePatternHint')}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setShowAddFormType(false)}
                className="px-4 py-2 text-sm text-warm-gray border border-sand/50 rounded
                           hover:bg-paper hover:shadow-sm active:scale-95 transition-all">
                {t('specs.cancel')}
              </button>
              <button onClick={handleCreateFormType}
                className="px-4 py-2 text-sm bg-forest text-cream rounded
                           hover:bg-forest/90 hover:shadow-md active:scale-95 transition-all">
                {t('specs.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Form Type Dialog */}
      {editingFormType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-ink/40" onClick={() => setEditingFormType(null)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-lg w-full mx-4 p-6">
            <h3 className="text-base font-serif text-charcoal mb-1">
              {t('specs.editFormType')} - {editingFormType.form_code}
            </h3>
            <p className="text-xs text-warm-gray mb-4">{t('specs.editFormTypeDesc')}</p>
            <div className="space-y-3 mb-4">
              <div>
                <label className="text-xs text-charcoal font-medium block mb-1">{t('specs.formNameLabel')}</label>
                <input
                  type="text"
                  value={editFtName}
                  onChange={e => setEditFtName(e.target.value)}
                  className="w-full border border-sand rounded px-3 py-2 text-sm focus:outline-none focus:border-terracotta"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs text-charcoal font-medium block mb-1">{t('specs.filePatternLabel')}</label>
                <input
                  type="text"
                  value={editFtPattern}
                  onChange={e => setEditFtPattern(e.target.value)}
                  placeholder={t('specs.filePatternPlaceholder')}
                  className="w-full border border-sand rounded px-3 py-2 text-sm font-mono focus:outline-none focus:border-terracotta"
                  onKeyDown={e => e.key === 'Enter' && handleEditFormType()}
                />
                <p className="text-[10px] text-warm-gray mt-1">{t('specs.filePatternHint')}</p>
              </div>
            </div>
            <div className="flex justify-end gap-3">
              <button onClick={() => setEditingFormType(null)}
                className="px-4 py-2 text-sm text-warm-gray border border-sand/50 rounded
                           hover:bg-paper hover:shadow-sm active:scale-95 transition-all">
                {t('specs.cancel')}
              </button>
              <button onClick={handleEditFormType}
                className="px-4 py-2 text-sm bg-charcoal text-cream rounded
                           hover:bg-ink hover:shadow-md active:scale-95 transition-all">
                {t('specs.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
