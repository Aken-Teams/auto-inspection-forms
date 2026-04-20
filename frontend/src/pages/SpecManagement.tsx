import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../components/ConfirmDialog';
import { useToast } from '../components/Toast';
import {
  getFormTypes, getFormSpecs, deleteSpec, renameSpec, createSpec, importSpecs,
  createFormType, patchFormType, deleteFormType, analyzeFile, createFromFile,
} from '../api/client';
import type { FormType } from '../types';

interface SpecListItem {
  id: number;
  equipment_id: string;
  equipment_name: string;
  item_count: number;
  extra_info: Record<string, unknown>;
}

interface SheetInfo {
  name: string;
  headers: string[];
  data_rows: number;
  sample_keywords: string[];
}

interface AnalysisResult {
  filename: string;
  total_sheets: number;
  has_summary: boolean;
  sheets: SheetInfo[];
  common_keywords: string[];
  suggested_id_keywords: string[];
  suggested_file_pattern: string;
  extracted_form_code: string | null;
  matched_form_code: string | null;
}

export default function SpecManagement() {
  const { t } = useTranslation();
  const { toast } = useToast();
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
  const [addFtStep, setAddFtStep] = useState<1 | 2>(1);
  const [addFtFile, setAddFtFile] = useState<File | null>(null);
  const [addFtAnalysis, setAddFtAnalysis] = useState<AnalysisResult | null>(null);
  const [addFtAnalyzing, setAddFtAnalyzing] = useState(false);
  const [addFtCreating, setAddFtCreating] = useState(false);
  const [newFtCode, setNewFtCode] = useState('');
  const [newFtName, setNewFtName] = useState('');
  const addFtFileRef = useRef<HTMLInputElement>(null);
  const [editingFormType, setEditingFormType] = useState<FormType | null>(null);
  const [editFtName, setEditFtName] = useState('');
  const [editFtPattern, setEditFtPattern] = useState('');
  const [deleteFormTypeTarget, setDeleteFormTypeTarget] = useState<FormType | null>(null);
  const [ftSearch, setFtSearch] = useState('');
  const [showSpecGuide, setShowSpecGuide] = useState(false);

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
      toast(t('specs.deleteFailed'), 'error');
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
      toast(t('specs.saveFailed'), 'error');
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
      toast(err.response?.data?.detail || t('specs.saveFailed'), 'error');
    }
  };

  const handleImport = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await importSpecs(activeType, file);
      loadSpecs(activeType);
      toast(t('specs.importSuccess'), 'success');
    } catch (err) {
      console.error(err);
      toast(t('specs.importFailed'), 'error');
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Form type CRUD
  const resetAddFormType = () => {
    setShowAddFormType(false);
    setAddFtStep(1);
    setAddFtFile(null);
    setAddFtAnalysis(null);
    setAddFtAnalyzing(false);
    setAddFtCreating(false);
    setNewFtCode('');
    setNewFtName('');
  };

  const handleAnalyzeFile = async (file: File) => {
    setAddFtFile(file);
    setAddFtAnalyzing(true);
    try {
      const res = await analyzeFile(file);
      const analysis = res.data as AnalysisResult;
      setAddFtAnalysis(analysis);

      // Use extracted form code from backend (regex-based) as suggested code
      if (analysis.extracted_form_code) {
        setNewFtCode(analysis.extracted_form_code);
      } else {
        // Fallback: derive from filename
        const baseName = file.name.replace(/\.[^.]+$/, '');
        setNewFtCode(baseName.substring(0, 20));
      }

      // Suggest form name from filename (remove code and extension)
      const baseName = file.name.replace(/\.[^.]+$/, '');
      setNewFtName(baseName);
      setAddFtStep(2);
    } catch (err: any) {
      toast(err.response?.data?.detail || t('specs.analyzeFailed'), 'error');
      setAddFtFile(null);
    } finally {
      setAddFtAnalyzing(false);
    }
  };

  const handleCreateFromFile = async () => {
    if (!newFtCode.trim() || !newFtName.trim() || !addFtFile) return;
    setAddFtCreating(true);
    try {
      await createFromFile(newFtCode.trim(), newFtName.trim(), addFtFile);
      const savedCode = newFtCode.trim();
      resetAddFormType();
      await loadFormTypes();
      setActiveType(savedCode);
    } catch (err: any) {
      toast(err.response?.data?.detail || t('specs.saveFailed'), 'error');
    } finally {
      setAddFtCreating(false);
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
      toast(err.response?.data?.detail || t('specs.saveFailed'), 'error');
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
      toast(err.response?.data?.detail || t('specs.deleteFailed'), 'error');
    }
  };

  const filteredFormTypes = ftSearch.trim()
    ? formTypes.filter(ft =>
        ft.form_code.toLowerCase().includes(ftSearch.toLowerCase()) ||
        ft.form_name.toLowerCase().includes(ftSearch.toLowerCase())
      )
    : formTypes;

  const activeFormType = formTypes.find(ft => ft.form_code === activeType);

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2">
          <h2 className="text-2xl font-serif text-charcoal mb-1">{t('specs.title')}</h2>
          <button
            onClick={() => setShowSpecGuide(true)}
            className="p-1 text-warm-gray hover:text-terracotta hover:bg-terracotta/10
                       rounded-full transition-all active:scale-90"
            title={t('specs.guideTitle')}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </button>
        </div>
        <p className="text-warm-gray text-sm">{t('specs.description')}</p>
      </div>

      {/* Form Types - two-column layout */}
      <div className="grid grid-cols-[280px_1fr] gap-6">
        {/* Left: Form Type List */}
        <div className="flex flex-col" style={{ maxHeight: 'calc(100vh - 200px)' }}>
          <div className="flex items-center justify-between mb-3">
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

          {/* Search */}
          <div className="relative mb-3">
            <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-warm-gray pointer-events-none"
              fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            <input
              type="text"
              value={ftSearch}
              onChange={e => setFtSearch(e.target.value)}
              placeholder={t('specs.searchFormType')}
              className="w-full border border-sand/60 rounded pl-8 pr-3 py-1.5 text-xs
                         focus:outline-none focus:border-terracotta
                         placeholder:text-warm-gray/50 transition-colors"
            />
            {ftSearch && (
              <button
                onClick={() => setFtSearch('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-warm-gray
                           hover:text-charcoal transition-colors"
              >
                <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>

          <div className="space-y-1.5 overflow-y-auto flex-1 pr-1">
            {filteredFormTypes.map(ft => {
              const isActive = activeType === ft.form_code;
              return (
                <div
                  key={ft.form_code}
                  onClick={() => setActiveType(ft.form_code)}
                  className={`group/ft px-3 py-2.5 rounded-lg cursor-pointer transition-all relative
                    ${isActive
                      ? 'bg-charcoal text-cream shadow-md'
                      : 'bg-white border border-sand/40 hover:bg-paper hover:shadow-sm'
                    }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-semibold truncate">{ft.form_code}</div>
                      <div className={`text-xs truncate ${isActive ? 'text-cream/70' : 'text-warm-gray'}`}>
                        {ft.form_name}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0 ml-2">
                      {/* Spec count - hide on hover to make room for actions */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded group-hover/ft:hidden
                        ${isActive ? 'bg-cream/20 text-cream' : 'bg-sand/30 text-charcoal'}`}>
                        {ft.spec_count}
                      </span>
                      {/* Action buttons - show on hover */}
                      <div className="hidden group-hover/ft:flex gap-0.5">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingFormType(ft);
                            setEditFtName(ft.form_name);
                            setEditFtPattern(ft.file_pattern || '');
                          }}
                          className={`p-1.5 rounded transition-colors ${isActive
                            ? 'hover:bg-cream/20 text-cream'
                            : 'hover:bg-terracotta/10 text-warm-gray hover:text-terracotta'}`}
                          title={t('specs.rename')}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setDeleteFormTypeTarget(ft); }}
                          className={`p-1.5 rounded transition-colors ${isActive
                            ? 'hover:bg-rust/30 text-cream'
                            : 'hover:bg-rust/10 text-warm-gray hover:text-rust'}`}
                          title={t('specs.delete')}
                        >
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  </div>
                  {ft.is_builtin && (
                    <div className={`text-[10px] mt-1 ${isActive ? 'text-cream/50' : 'text-warm-gray/60'}`}>
                      {t('specs.builtIn')}
                    </div>
                  )}
                </div>
              );
            })}
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
        message={
          (deleteFormTypeTarget?.is_builtin
            ? t('specs.builtInWarning') + '\n\n'
            : '') +
          t('specs.confirmDeleteFormType', { name: deleteFormTypeTarget?.form_code || '' })
        }
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

      {/* Add Form Type Dialog - Upload-driven wizard */}
      {showAddFormType && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-ink/40" onClick={resetAddFormType} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <h3 className="text-base font-serif text-charcoal mb-1">{t('specs.addFormType')}</h3>
            <p className="text-xs text-warm-gray mb-4">{t('specs.addFormTypeUploadDesc')}</p>

            {/* Step indicator */}
            <div className="flex items-center gap-3 mb-6">
              <div className={`flex items-center gap-2 text-xs ${addFtStep >= 1 ? 'text-forest' : 'text-warm-gray'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${addFtStep >= 1 ? 'bg-forest text-cream' : 'bg-sand/40 text-warm-gray'}`}>1</span>
                {t('specs.uploadSample')}
              </div>
              <div className="flex-1 h-px bg-sand/40" />
              <div className={`flex items-center gap-2 text-xs ${addFtStep >= 2 ? 'text-forest' : 'text-warm-gray'}`}>
                <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold
                  ${addFtStep >= 2 ? 'bg-forest text-cream' : 'bg-sand/40 text-warm-gray'}`}>2</span>
                {t('specs.confirmCreate')}
              </div>
            </div>

            {/* Step 1: Upload file */}
            {addFtStep === 1 && (
              <div>
                {addFtAnalyzing ? (
                  <div className="text-center py-12">
                    <div className="inline-block w-8 h-8 border-2 border-forest/30 border-t-forest rounded-full animate-spin mb-3" />
                    <p className="text-sm text-warm-gray">{t('specs.analyzing')}</p>
                  </div>
                ) : (
                  <div
                    className="border-2 border-dashed border-sand rounded-lg p-10 text-center
                               hover:border-terracotta/40 hover:bg-terracotta/5 transition-all cursor-pointer"
                    onClick={() => addFtFileRef.current?.click()}
                    onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                    onDrop={e => {
                      e.preventDefault();
                      e.stopPropagation();
                      const file = e.dataTransfer.files?.[0];
                      if (file && /\.xlsx?$/i.test(file.name)) handleAnalyzeFile(file);
                    }}
                  >
                    <svg className="mx-auto w-10 h-10 text-sand mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                        d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                    </svg>
                    <p className="text-sm text-charcoal mb-1">{t('specs.uploadSampleFile')}</p>
                    <p className="text-xs text-warm-gray">{t('specs.uploadSampleHint')}</p>
                    <input
                      ref={addFtFileRef}
                      type="file"
                      accept=".xlsx,.xls"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleAnalyzeFile(file);
                        if (addFtFileRef.current) addFtFileRef.current.value = '';
                      }}
                    />
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Review analysis + confirm */}
            {addFtStep === 2 && addFtAnalysis && (
              <div className="space-y-4">
                {/* Warning: file matches existing form type */}
                {addFtAnalysis.matched_form_code && (
                  <div className="bg-rust/10 rounded-lg p-4 border border-rust/30">
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-rust shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-rust">{t('specs.fileMatchesExisting')}</p>
                        <p className="text-xs text-rust/80 mt-0.5">
                          {t('specs.fileMatchesExistingDesc', { code: addFtAnalysis.matched_form_code })}
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Warning: no summary sheet */}
                {!addFtAnalysis.has_summary && (
                  <div className="bg-amber-50 rounded-lg p-4 border border-amber-200">
                    <div className="flex items-start gap-2">
                      <svg className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                          d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      <div>
                        <p className="text-sm font-medium text-amber-700">{t('specs.noSummarySheet')}</p>
                        <p className="text-xs text-amber-600 mt-0.5">{t('specs.noSummarySheetDesc')}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Analysis summary */}
                <div className="bg-paper rounded-lg p-4 border border-sand/30">
                  <div className="flex items-center gap-2 mb-3">
                    <svg className="w-4 h-4 text-forest" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span className="text-sm font-medium text-charcoal">{t('specs.analysisResult')}</span>
                  </div>
                  <div className="grid grid-cols-3 gap-3 text-xs">
                    <div>
                      <span className="text-warm-gray">{t('specs.detectedSheets')}</span>
                      <p className="text-charcoal font-medium">{addFtAnalysis.total_sheets}</p>
                    </div>
                    <div>
                      <span className="text-warm-gray">{t('specs.hasSummary')}</span>
                      <p className={`font-medium ${addFtAnalysis.has_summary ? 'text-forest' : 'text-rust'}`}>
                        {addFtAnalysis.has_summary ? t('specs.yes') : t('specs.no')}
                      </p>
                    </div>
                    <div>
                      <span className="text-warm-gray">{t('specs.sourceFile')}</span>
                      <p className="text-charcoal font-medium truncate" title={addFtAnalysis.filename}>{addFtAnalysis.filename}</p>
                    </div>
                  </div>
                </div>

                {/* Detected sheets preview */}
                {addFtAnalysis.sheets.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-charcoal mb-2">{t('specs.detectedEquipment')}</h4>
                    <div className="max-h-40 overflow-y-auto border border-sand/30 rounded-lg">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-paper border-b border-sand/30 sticky top-0">
                            <th className="px-3 py-1.5 text-left font-medium text-charcoal">{t('specs.sheetName')}</th>
                            <th className="px-3 py-1.5 text-center font-medium text-charcoal">{t('specs.dataRows')}</th>
                            <th className="px-3 py-1.5 text-left font-medium text-charcoal">{t('specs.headers')}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {addFtAnalysis.sheets.map((sheet, i) => (
                            <tr key={i} className="border-b border-sand/20">
                              <td className="px-3 py-1.5 text-charcoal font-medium">{sheet.name}</td>
                              <td className="px-3 py-1.5 text-center text-warm-gray">{sheet.data_rows}</td>
                              <td className="px-3 py-1.5 text-warm-gray truncate max-w-[200px]"
                                  title={sheet.headers.join(', ')}>
                                {sheet.headers.slice(0, 5).join(', ')}
                                {sheet.headers.length > 5 && '...'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* Form code + name inputs */}
                <div className="space-y-3">
                  <div>
                    <label className="text-xs text-charcoal font-medium block mb-1">{t('specs.formCode')}</label>
                    <input
                      type="text"
                      value={newFtCode}
                      onChange={e => setNewFtCode(e.target.value)}
                      placeholder={t('specs.formCodePlaceholder')}
                      className={`w-full border rounded px-3 py-2 text-sm focus:outline-none
                        ${formTypes.some(ft => ft.form_code === newFtCode.trim())
                          ? 'border-rust focus:border-rust'
                          : 'border-sand focus:border-terracotta'}`}
                    />
                    {formTypes.some(ft => ft.form_code === newFtCode.trim()) && (
                      <p className="text-[11px] text-rust mt-1">{t('specs.formCodeDuplicate')}</p>
                    )}
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
                </div>

                <p className="text-[10px] text-warm-gray">
                  {addFtAnalysis.has_summary
                    ? t('specs.createFromFileHint')
                    : t('specs.createNoSummaryHint')}
                </p>
              </div>
            )}

            {/* Footer buttons */}
            <div className="flex justify-between mt-6">
              <div>
                {addFtStep === 2 && (
                  <button
                    onClick={() => { setAddFtStep(1); setAddFtFile(null); setAddFtAnalysis(null); }}
                    className="px-4 py-2 text-sm text-warm-gray border border-sand/50 rounded
                               hover:bg-paper hover:shadow-sm active:scale-95 transition-all"
                  >
                    {t('specs.reupload')}
                  </button>
                )}
              </div>
              <div className="flex gap-3">
                <button onClick={resetAddFormType}
                  className="px-4 py-2 text-sm text-warm-gray border border-sand/50 rounded
                             hover:bg-paper hover:shadow-sm active:scale-95 transition-all">
                  {t('specs.cancel')}
                </button>
                {addFtStep === 2 && (
                  <button
                    onClick={handleCreateFromFile}
                    disabled={!newFtCode.trim() || !newFtName.trim() || addFtCreating || formTypes.some(ft => ft.form_code === newFtCode.trim())}
                    className="px-4 py-2 text-sm bg-forest text-cream rounded
                               hover:bg-forest/90 hover:shadow-md active:scale-95 transition-all
                               disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                  >
                    {addFtCreating && <div className="w-3.5 h-3.5 border-2 border-cream/30 border-t-cream rounded-full animate-spin" />}
                    {t('specs.createFormType')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Spec Guide Modal */}
      {showSpecGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="fixed inset-0 bg-ink/40" onClick={() => setShowSpecGuide(false)} />
          <div className="relative bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 p-6 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-serif text-charcoal">{t('specs.guideTitle')}</h3>
              <button
                onClick={() => setShowSpecGuide(false)}
                className="p-1.5 text-warm-gray hover:text-charcoal hover:bg-sand/30
                           rounded-full transition-all"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Flow diagram */}
            <div className="bg-paper rounded-lg p-5 border border-sand/30 mb-4">
              <div className="flex flex-col items-center gap-3">
                {/* Excel file */}
                <div className="flex items-center gap-4 w-full">
                  <div className="flex-1 border-2 border-forest/30 rounded-lg p-3 bg-white">
                    <div className="text-xs font-medium text-forest mb-2 text-center">{t('specs.guideExcelFile')}</div>
                    <div className="flex gap-2 justify-center">
                      <div className="border border-sand rounded px-2 py-1 text-[10px] text-charcoal bg-cream/50">WCBA-0001</div>
                      <div className="border border-sand rounded px-2 py-1 text-[10px] text-charcoal bg-cream/50">WCBA-0002</div>
                      <div className="border border-sand rounded px-2 py-1 text-[10px] text-charcoal bg-cream/50">...</div>
                      <div className="border-2 border-terracotta/60 rounded px-2 py-1 text-[10px] text-terracotta font-bold bg-terracotta/5">{t('specs.guideSummaryTab')}</div>
                    </div>
                  </div>
                </div>

                {/* Arrow down with labels */}
                <div className="flex items-start gap-8 w-full">
                  {/* Left: with summary */}
                  <div className="flex-1 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-1 text-[10px] text-forest font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                      {t('specs.guideHasSummary')}
                    </div>
                    <svg className="w-5 h-8 text-forest" fill="none" viewBox="0 0 20 32" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 2v24m0 0l-6-6m6 6l6-6" />
                    </svg>
                    <div className="border-2 border-forest/40 rounded-lg p-3 bg-forest/5 w-full text-center">
                      <div className="text-xs font-medium text-forest mb-1">{t('specs.guideAutoImport')}</div>
                      <div className="text-[10px] text-forest/70">{t('specs.guideAutoImportDesc')}</div>
                    </div>
                  </div>

                  {/* Divider */}
                  <div className="flex flex-col items-center pt-6">
                    <div className="w-px h-20 bg-sand/60" />
                  </div>

                  {/* Right: without summary */}
                  <div className="flex-1 flex flex-col items-center gap-2">
                    <div className="flex items-center gap-1 text-[10px] text-rust font-medium">
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                      {t('specs.guideNoSummary')}
                    </div>
                    <svg className="w-5 h-8 text-rust" fill="none" viewBox="0 0 20 32" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 2v24m0 0l-6-6m6 6l6-6" />
                    </svg>
                    <div className="border-2 border-rust/30 rounded-lg p-3 bg-rust/5 w-full text-center">
                      <div className="text-xs font-medium text-rust mb-1">{t('specs.guideManualSetup')}</div>
                      <div className="text-[10px] text-rust/70">{t('specs.guideManualSetupDesc')}</div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Steps explanation */}
            <div className="space-y-3">
              <div className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-forest text-cream flex items-center justify-center text-xs font-bold shrink-0">1</span>
                <div>
                  <p className="text-sm font-medium text-charcoal">{t('specs.guideStep1')}</p>
                  <p className="text-xs text-warm-gray">{t('specs.guideStep1Desc')}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-forest text-cream flex items-center justify-center text-xs font-bold shrink-0">2</span>
                <div>
                  <p className="text-sm font-medium text-charcoal">{t('specs.guideStep2')}</p>
                  <p className="text-xs text-warm-gray">{t('specs.guideStep2Desc')}</p>
                </div>
              </div>
              <div className="flex gap-3 items-start">
                <span className="w-6 h-6 rounded-full bg-forest text-cream flex items-center justify-center text-xs font-bold shrink-0">3</span>
                <div>
                  <p className="text-sm font-medium text-charcoal">{t('specs.guideStep3')}</p>
                  <p className="text-xs text-warm-gray">{t('specs.guideStep3Desc')}</p>
                </div>
              </div>
            </div>

            <div className="flex justify-end mt-6">
              <button
                onClick={() => setShowSpecGuide(false)}
                className="px-5 py-2 text-sm bg-charcoal text-cream rounded
                           hover:bg-ink hover:shadow-md active:scale-95 transition-all"
              >
                {t('specs.guideGotIt')}
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
