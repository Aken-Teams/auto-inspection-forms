import { BrowserRouter as Router, Routes, Route, NavLink, Navigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import Upload from './pages/Upload';
import Results from './pages/Results';
import ResultDetail from './pages/ResultDetail';
import SpecManagement from './pages/SpecManagement';
import SpecDetail from './pages/SpecDetail';
import LanguageSwitcher from './components/LanguageSwitcher';
import './index.css';

function App() {
  const { t } = useTranslation();

  const navItems = [
    { to: '/', label: t('nav.upload') },
    { to: '/history', label: t('nav.history') },
    { to: '/specs', label: t('nav.specs') },
  ];

  return (
    <Router>
      <div className="min-h-screen bg-cream flex flex-col">
        {/* Header */}
        <header className="bg-charcoal text-cream border-b border-sand/20">
          <div className="max-w-7xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 bg-gold/90 rounded flex items-center justify-center">
                <span className="text-charcoal font-serif font-semibold text-base">検</span>
              </div>
              <div>
                <h1 className="text-lg font-serif tracking-wider text-cream/95 !m-0 !text-lg">
                  {t('app.title')}
                </h1>
                <p className="text-[10px] text-warm-gray tracking-[0.2em] uppercase m-0">
                  {t('app.subtitle')}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4">
              <nav className="flex gap-1">
                {navItems.map(item => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.to === '/'}
                    className={({ isActive }) =>
                      `px-4 py-2 text-sm tracking-wide transition-all duration-200 rounded
                      ${isActive
                        ? 'bg-gold/15 text-gold border-b-2 border-gold font-medium'
                        : 'text-sand/80 hover:text-cream hover:bg-white/5'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </nav>
              <LanguageSwitcher />
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="max-w-7xl mx-auto px-6 py-8 w-full flex-1">
          <Routes>
            <Route path="/" element={<Upload />} />
            <Route path="/history" element={<Results />} />
            <Route path="/history/:id" element={<ResultDetail />} />
            <Route path="/specs" element={<SpecManagement />} />
            <Route path="/specs/:formCode/:specId" element={<SpecDetail />} />
            {/* Redirects for old URLs */}
            <Route path="/results" element={<Navigate to="/history" replace />} />
            <Route path="/results/:id" element={<Navigate to="/history/:id" replace />} />
          </Routes>
        </main>

        {/* Footer */}
        <footer className="border-t border-sand/40 py-5 text-center text-warm-gray text-xs tracking-wider">
          <p className="m-0">{t('common.footer')}</p>
        </footer>
      </div>
    </Router>
  );
}

export default App;
