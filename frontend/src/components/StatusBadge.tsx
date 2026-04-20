import { useTranslation } from 'react-i18next';

interface Props {
  status: string;
  size?: 'sm' | 'md';
}

const STATUS_STYLES: Record<string, string> = {
  OK: 'bg-sage/20 text-forest border-sage/40',
  NG: 'bg-rose/20 text-rust border-rose/40',
  NO_SPEC: 'bg-gold/15 text-gold border-gold/30',
  ERROR: 'bg-rose/20 text-rust border-rose/40',
  SKIP: 'bg-sand/30 text-warm-gray border-sand/40',
};

const STATUS_KEYS: Record<string, string> = {
  OK: 'status.OK',
  NG: 'status.NG',
  NO_SPEC: 'status.NO_SPEC',
  ERROR: 'status.ERROR',
  SKIP: 'status.SKIP',
};

export default function StatusBadge({ status, size = 'sm' }: Props) {
  const { t } = useTranslation();
  const style = STATUS_STYLES[status] || STATUS_STYLES.SKIP;
  const labelKey = STATUS_KEYS[status];
  const label = labelKey ? t(labelKey) : status;
  const sizeClass = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-3 py-1 text-sm';

  return (
    <span className={`inline-flex items-center rounded border font-medium tracking-wide ${style} ${sizeClass}`}>
      {label}
    </span>
  );
}
