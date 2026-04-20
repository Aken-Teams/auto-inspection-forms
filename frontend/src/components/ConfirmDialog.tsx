import { useTranslation } from 'react-i18next';

interface Props {
  open: boolean;
  title: string;
  message: string;
  onConfirm: () => void;
  onCancel: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

export default function ConfirmDialog({
  open,
  title,
  message,
  onConfirm,
  onCancel,
  confirmLabel,
  cancelLabel,
  danger = false,
}: Props) {
  const { t } = useTranslation();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="fixed inset-0 bg-ink/40" onClick={onCancel} />
      <div className="relative bg-white rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
        <h3 className="text-base font-serif text-charcoal mb-2">{title}</h3>
        <p className="text-sm text-warm-gray mb-6 leading-relaxed">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-warm-gray border border-sand/50 rounded
                       hover:bg-paper transition-colors tracking-wide"
          >
            {cancelLabel || t('specs.cancel')}
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 text-sm text-cream rounded transition-colors tracking-wide
              ${danger ? 'bg-rust hover:bg-rust/90' : 'bg-charcoal hover:bg-ink'}`}
          >
            {confirmLabel || t('specs.confirm')}
          </button>
        </div>
      </div>
    </div>
  );
}
