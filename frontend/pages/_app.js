import '../styles/global.css';
import '../styles/bakery.css';
import Head from 'next/head';
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { workspaceDestination } from '../lib/workspaceRoutes';
import { Livvic } from 'next/font/google';
import { LocaleProvider, useLocale } from '../context/LocaleContext';
import { AuthProvider, useAuth } from '../context/AuthContext';

const livvic = Livvic({
  subsets: ['latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-livvic',
});

function AppMetadata() { const { t } = useLocale(); return (<Head>
        <title>{t('Speation — Guided Speech Practice')}</title>
        <meta name="description" content={t('Language-aware speech practice, a 3D companion, creative games and clinician-reviewed goals for children and young people.')} />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="icon" href="/speation-icon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.webmanifest" />
        <meta name="application-name" content="Speation" />
        <meta name="apple-mobile-web-app-title" content="Speation" />
        <meta name="theme-color" content="#173f38" />
      </Head>); }

function OpeningWorkspace() { const { t } = useLocale(); return <p role="status">{t('Opening your workspace…')}</p>; }

function WorkspaceRoute({ Component, pageProps }) {
  const router = useRouter();
  const { user } = useAuth();
  const destination = workspaceDestination(router.pathname, user?.workspace_role);
  useEffect(() => { if (destination) router.replace(destination); }, [destination, router]);
  return destination ? <OpeningWorkspace /> : <Component {...pageProps} />;
}

export default function MyApp({ Component, pageProps }) {
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {}); }, []);
  return (
    <div className={livvic.className}>

      <LocaleProvider><AppMetadata /><AuthProvider>
        <WorkspaceRoute Component={Component} pageProps={pageProps} />
      </AuthProvider></LocaleProvider>
    </div>
  );
}
