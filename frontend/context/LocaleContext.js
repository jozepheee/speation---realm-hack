import { createContext, useContext, useEffect, useMemo } from 'react';
import { useRouter } from 'next/router';
import { LANGUAGES, translate } from '../lib/localization';
const LocaleContext = createContext(null);
const STORAGE = 'speation_ui_language';
export function LocaleProvider({ children }) {
  const router = useRouter();
  const locale = LANGUAGES.includes(router.locale) ? router.locale : 'en';
  useEffect(() => {
    if (!router.isReady) return;
    let preferred;
    try { preferred = localStorage.getItem(STORAGE); } catch { /* Browser storage can be unavailable. */ }
    if (locale === 'en' && LANGUAGES.includes(preferred) && preferred !== locale)
      void router.replace({ pathname: router.pathname, query: router.query }, router.asPath, { locale: preferred, scroll: false });
  }, [router.isReady]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => {
    const sync = event => { if (event.key === STORAGE && LANGUAGES.includes(event.newValue) && event.newValue !== locale)
      void router.replace({ pathname: router.pathname, query: router.query }, router.asPath, { locale: event.newValue, scroll: false }); };
    window.addEventListener('storage', sync); return () => window.removeEventListener('storage', sync);
  }, [locale, router]);
  const value = useMemo(() => ({ locale, t: (text, values) => translate(locale, text, values),
    setLocale: next => {
      if (!LANGUAGES.includes(next) || next === locale) return;
      try { localStorage.setItem(STORAGE, next); } catch { /* Cookie still preserves the preference. */ }
      document.cookie = `NEXT_LOCALE=${next}; Path=/; Max-Age=31536000; SameSite=Lax`;
      void router.push({ pathname: router.pathname, query: router.query }, router.asPath, { locale: next, scroll: false });
    }
  }), [locale, router]);
  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}
export function useLocale() {
  const value = useContext(LocaleContext);
  if (!value) throw new Error('LocaleProvider is required');
  return value;
}
