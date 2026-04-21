import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import ConfirmDialog from '../components/ConfirmDialog';
import ImportPreviewDialog from '../components/ImportPreviewDialog';
import { useToast } from '../components/Toast';
import {
  getFormTypes, getFormSpecs, deleteSpec, renameSpec, createSpec,
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

interface DuplicateSpecFile {
  form_code: string;
  filename: string;
  file_hash: string;
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
  duplicate_spec_file: DuplicateSpecFile | null;
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

  // Form type dialogs - batch upload
  interface BatchItem {
    file: File;
    status: 'analyzing' | 'done' | 'error';
    analysis: AnalysisResult | null;
    error: string | null;
    formCode: string;
    formName: string;
  }
  const [showAddFormType, setShowAddFormType] = useState(false);
  const [addFtStep, setAddFtStep] = useState<1 | 2>(1);
  const [addFtItems, setAddFtItems] = useState<BatchItem[]>([]);
  const [addFtCreating, setAddFtCreating] = useState(false);
  const [addFtCreateDone, setAddFtCreateDone] = useState(0);
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

  // Import preview flow
  const [importFile, setImportFile] = useState<File | null>(null);
  const [showImportPreview, setShowImportPreview] = useState(false);

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFile(file);
    setShowImportPreview(true);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleImportSuccess = () => {
    setShowImportPreview(false);
    setImportFile(null);
    loadSpecs(activeType);
  };

  const handleImportCancel = () => {
    setShowImportPreview(false);
    setImportFile(null);
  };

  // Form type CRUD
  const resetAddFormType = () => {
    setShowAddFormType(false);
    setAddFtStep(1);
    setAddFtItems([]);
    setAddFtCreating(false);
    setAddFtCreateDone(0);
  };

  const handleAnalyzeFiles = async (files: File[]) => {
    const newItems: BatchItem[] = files.map(f => ({
      file: f, status: 'analyzing' as const, analysis: null, error: null, formCode: '', formName: '',
    }));
    setAddFtItems(prev => [...prev, ...newItems]);
    const startIdx = addFtItems.length;

    await Promise.allSettled(files.map(async (file, i) => {
      const idx = startIdx + i;
      try {
        const res = await analyzeFile(file);
        const analysis = res.data as AnalysisResult;
        const baseName = file.name.replace(/\.[^.]+$/, '');
        // Prefer matched_form_code (existing type detection) over raw extracted code
        const code = analysis.matched_form_code || analysis.extracted_form_code || baseName.substring(0, 20);
        setAddFtItems(prev => prev.map((it, j) => j === idx
          ? { ...it, status: 'done', analysis, formCode: code, formName: baseName } : it));
      } catch (err: any) {
        setAddFtItems(prev => prev.map((it, j) => j === idx
          ? { ...it, status: 'error', error: err.response?.data?.detail || t('specs.analyzeFailed') } : it));
      }
    }));
  };

  const updateBatchItem = (idx: number, field: 'formCode' | 'formName', value: string) => {
    setAddFtItems(prev => prev.map((it, i) => i === idx ? { ...it, [field]: value } : it));
  };

  const removeBatchItem = (idx: number) => {
    setAddFtItems(prev => prev.filter((_, i) => i !== idx));
  };

  const handleBatchCreate = async () => {
    const valid = addFtItems.filter(it => it.status === 'done' && it.formCode.trim() && it.formName.trim());
    if (valid.length === 0) return;
    setAddFtCreating(true);
    setAddFtCreateDone(0);
    let lastCode = '';
    let successCount = 0;
    for (const item of valid) {
      try {
        await createFromFile(item.formCode.trim(), item.formName.trim(), item.file);
        lastCode = item.formCode.trim();
        successCount++;
        setAddFtCreateDone(prev => prev + 1);
      } catch (err: any) {
        toast(`${item.formCode}: ${err.response?.data?.detail || t('specs.saveFailed')}`, 'error');
      }
    }
    if (successCount > 0) {
      toast(t('specs.batchCreateSuccess', { count: successCount }), 'success');
      resetAddFormType();
      await loadFormTypes();
      if (lastCode) setActiveType(lastCode);
    } else {
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
                title={t('specs.addGroupDesc')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
                <div className="text-left">
                  <div>{t('specs.addGroup')}</div>
                  <div className="text-[10px] opacity-75 font-normal">{t('specs.addGroupDesc')}</div>
                </div>
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 text-sm border border-terracotta/40 text-terracotta rounded
                           hover:bg-terracotta/10 hover:border-terracotta/60 hover:shadow-sm active:scale-95
                           transition-all tracking-wide flex items-center gap-2"
                title={t('specs.importExcelDesc')}
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                    d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
                <div className="text-left">
                  <div>{t('specs.importExcel')}</div>
                  <div className="text-[10px] opacity-60 font-normal">{t('specs.importExcelDesc')}</div>
                </div>
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

      {/* Import Preview Dialog */}
      <ImportPreviewDialog
        open={showImportPreview}
        formCode={activeType}
        file={importFile}
        onSuccess={handleImportSuccess}
        onCancel={handleImportCancel}
        toast={toast}
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

      {/* Add Form Type Dialog - Batch Upload Wizard */}
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

            {/* Step 1: Upload files */}
            {addFtStep === 1 && (
              <div className="space-y-4">
                <div
                  className="border-2 border-dashed border-sand rounded-lg p-10 text-center
                             hover:border-terracotta/40 hover:bg-terracotta/5 transition-all cursor-pointer"
                  onClick={() => addFtFileRef.current?.click()}
                  onDragOver={e => { e.preventDefault(); e.stopPropagation(); }}
                  onDrop={e => {
                    e.preventDefault();
                    e.stopPropagation();
                    const files = Array.from(e.dataTransfer.files).filter(f => /\.xlsx?$/i.test(f.name));
                    if (files.length > 0) handleAnalyzeFiles(files);
                  }}
                >
                  <svg className="mx-auto w-10 h-10 text-sand mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                  <p className="text-sm text-charcoal mb-1">{t('specs.uploadSampleFile')}</p>
                  <p className="text-xs text-warm-gray">{t('specs.batchUploadHint')}</p>
                  <input
                    ref={addFtFileRef}
                    type="file"
                    accept=".xlsx,.xls"
                    multiple
                    className="hidden"
                    onChange={e => {
                      const files = Array.from(e.target.files || []);
                      if (files.length > 0) handleAnalyzeFiles(files);
                      if (addFtFileRef.current) addFtFileRef.current.value = '';
                    }}
                  />
                </div>

                {/* File list with status */}
                {addFtItems.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-xs text-charcoal font-medium">
                        {t('specs.filesSelected', { count: addFtItems.length })}
                      </span>
                      {addFtItems.some(it => it.status === 'analyzing') && (
                        <span className="text-xs text-warm-gray">
                          {t('specs.analyzeProgress', {
                            done: addFtItems.filter(it => it.status !== 'analyzing').length,
                            total: addFtItems.length,
                          })}
                        </span>
                      )}
                    </div>
                    {addFtItems.map((item, idx) => (
                      <div key={idx} className={`flex items-center gap-3 px-3 py-2 rounded-lg border text-sm
                        ${item.status === 'error' ? 'border-rust/30 bg-rust/5' : 'border-sand/50 bg-paper'}`}>
                        {item.status === 'analyzing' && (
                          <div className="w-4 h-4 border-2 border-forest/30 border-t-forest rounded-full animate-spin shrink-0" />
                        )}
                        {item.status === 'done' && (
                          <svg className="w-4 h-4 text-forest shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                        {item.status === 'error' && (
                          <svg className="w-4 h-4 text-rust shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        )}
                        <span className="flex-1 truncate text-charcoal">{item.file.name}</span>
                        {item.status === 'done' && item.analysis && (
                          <span className="text-xs text-warm-gray shrink-0">
                            {item.analysis.total_sheets} sheets
                            {item.analysis.duplicate_spec_file && (
                              <span className="text-rust ml-1" title={t('specs.fileDuplicateShort')}>⚠</span>
                            )}
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-xs text-rust shrink-0 max-w-[150px] truncate">{item.error}</span>
                        )}
                        <button onClick={() => removeBatchItem(idx)}
                          className="text-warm-gray hover:text-rust shrink-0">
                          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Step 2: Review all files + confirm */}
            {addFtStep === 2 && (() => {
              const doneItems = addFtItems.filter(it => it.status === 'done' && it.analysis);
              const allCodes = doneItems.map(it => it.formCode.trim());
              return (
                <div className="space-y-3 max-h-[50vh] overflow-y-auto pr-1">
                  {doneItems.map((item, idx) => {
                    const realIdx = addFtItems.indexOf(item);
                    const trimmedCode = item.formCode.trim();
                    const isDupExisting = formTypes.some(ft => ft.form_code === trimmedCode);
                    // Also check prefix similarity: F-QA10212 should flag F-QA1021
                    const isSimilarExisting = !isDupExisting && trimmedCode.length > 0 && formTypes.some(ft =>
                      (trimmedCode.startsWith(ft.form_code) && trimmedCode.length > ft.form_code.length) ||
                      (ft.form_code.startsWith(trimmedCode) && ft.form_code.length > trimmedCode.length)
                    );
                    const similarCode = isSimilarExisting
                      ? formTypes.find(ft =>
                          trimmedCode.startsWith(ft.form_code) || ft.form_code.startsWith(trimmedCode)
                        )?.form_code
                      : null;
                    const isDupBatch = trimmedCode !== '' &&
                      allCodes.filter(c => c === trimmedCode).length > 1;
                    const isFileDup = !!item.analysis?.duplicate_spec_file;
                    const hasDup = isDupExisting || isDupBatch || isSimilarExisting || isFileDup;
                    return (
                      <div key={realIdx} className="border border-sand/50 rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-charcoal truncate" title={item.file.name}>
                            {item.file.name}
                          </span>
                          <div className="flex items-center gap-2 text-xs text-warm-gray shrink-0">
                            <span>{item.analysis!.total_sheets} sheets</span>
                            {item.analysis!.has_summary && (
                              <span className="text-forest">+ {t('specs.hasSummary')}</span>
                            )}
                          </div>
                        </div>
                        {item.analysis!.matched_form_code && (
                          <p className="text-[11px] text-rust">
                            {t('specs.fileMatchesExistingDesc', { code: item.analysis!.matched_form_code })}
                          </p>
                        )}
                        {isFileDup && (
                          <p className="text-[11px] text-rust font-medium">
                            {t('specs.fileDuplicate', {
                              code: item.analysis!.duplicate_spec_file!.form_code,
                              filename: item.analysis!.duplicate_spec_file!.filename,
                            })}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="text-[10px] text-warm-gray block mb-0.5">{t('specs.formCode')}</label>
                            <input
                              type="text"
                              value={item.formCode}
                              onChange={e => updateBatchItem(realIdx, 'formCode', e.target.value)}
                              placeholder={t('specs.formCodePlaceholder')}
                              className={`w-full border rounded px-2 py-1.5 text-sm focus:outline-none
                                ${hasDup ? 'border-rust focus:border-rust' : 'border-sand focus:border-terracotta'}`}
                            />
                            {isDupExisting && <p className="text-[10px] text-rust mt-0.5">{t('specs.formCodeDuplicate')}</p>}
                            {isSimilarExisting && <p className="text-[10px] text-rust mt-0.5">{t('specs.formCodeSimilar', { code: similarCode })}</p>}
                            {isDupBatch && !isDupExisting && <p className="text-[10px] text-rust mt-0.5">{t('specs.formCodeBatchDuplicate')}</p>}
                          </div>
                          <div>
                            <label className="text-[10px] text-warm-gray block mb-0.5">{t('specs.formNameLabel')}</label>
                            <input
                              type="text"
                              value={item.formName}
                              onChange={e => updateBatchItem(realIdx, 'formName', e.target.value)}
                              placeholder={t('specs.formNamePlaceholder')}
                              className="w-full border border-sand rounded px-2 py-1.5 text-sm focus:outline-none focus:border-terracotta"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })()}

            {/* Footer buttons */}
            <div className="flex justify-between mt-6">
              <div>
                {addFtStep === 2 && (
                  <button
                    onClick={() => { setAddFtStep(1); }}
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
                {addFtStep === 1 && addFtItems.some(it => it.status === 'done') && !addFtItems.some(it => it.status === 'analyzing') && (
                  <button
                    onClick={() => setAddFtStep(2)}
                    className="px-4 py-2 text-sm bg-forest text-cream rounded
                               hover:bg-forest/90 hover:shadow-md active:scale-95 transition-all"
                  >
                    {t('specs.next')}
                  </button>
                )}
                {addFtStep === 2 && (() => {
                  const doneItems = addFtItems.filter(it => it.status === 'done');
                  const allCodes = doneItems.map(it => it.formCode.trim());
                  const hasEmpty = doneItems.some(it => !it.formCode.trim() || !it.formName.trim());
                  const hasDupExisting = doneItems.some(it => formTypes.some(ft => ft.form_code === it.formCode.trim()));
                  const hasSimilarExisting = doneItems.some(it => {
                    const c = it.formCode.trim();
                    return c && !formTypes.some(ft => ft.form_code === c) &&
                      formTypes.some(ft =>
                        (c.startsWith(ft.form_code) && c.length > ft.form_code.length) ||
                        (ft.form_code.startsWith(c) && ft.form_code.length > c.length)
                      );
                  });
                  const hasDupBatch = new Set(allCodes).size !== allCodes.length;
                  const hasFileDup = doneItems.some(it => !!it.analysis?.duplicate_spec_file);
                  const disabled = hasEmpty || hasDupExisting || hasSimilarExisting || hasDupBatch || hasFileDup || addFtCreating;
                  return (
                    <button
                      onClick={handleBatchCreate}
                      disabled={disabled}
                      className="px-4 py-2 text-sm bg-forest text-cream rounded
                                 hover:bg-forest/90 hover:shadow-md active:scale-95 transition-all
                                 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                    >
                      {addFtCreating && (
                        <>
                          <div className="w-3.5 h-3.5 border-2 border-cream/30 border-t-cream rounded-full animate-spin" />
                          <span>{t('specs.createProgress', { done: addFtCreateDone, total: doneItems.length })}</span>
                        </>
                      )}
                      {!addFtCreating && t('specs.createFormType')}
                    </button>
                  );
                })()}
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
