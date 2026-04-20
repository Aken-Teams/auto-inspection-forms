import { useTranslation } from 'react-i18next';

const LANGUAGES = [
  { code: 'zh-TW', label: '繁' },
  { code: 'zh-CN', label: '简' },
  { code: 'en', label: 'EN' },
];

export default function LanguageSwitcher() {
  const { i18n } = useTranslation();

  return (
    <div className="flex gap-0.5 bg-sand/30 rounded p-0.5">
      {LANGUAGES.map(lang => (
        <button
          key={lang.code}
          onClick={() => i18n.changeLanguage(lang.code)}
          className={`px-2 py-1 text-xs rounded transition-all tracking-wide
            ${i18n.language === lang.code
              ? 'bg-charcoal text-cream'
              : 'text-warm-gray hover:text-charcoal'
            }`}
        >
          {lang.label}
        </button>
      ))}
    </div>
  );
}
