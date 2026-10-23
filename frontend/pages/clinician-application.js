import { useLocale } from "../context/LocaleContext";
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import ClinicianDetailsFields from '../components/ClinicianDetailsFields';
import { useAuth } from '../context/AuthContext';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/auth.module.css';
export default function ClinicianApplication() {
  const {
    t
  } = useLocale();
  const {
    isAuthenticated,
    loading: authLoading,
    user
  } = useAuth();
  const [data, setData] = useState(null),
    [details, setDetails] = useState({}),
    [error, setError] = useState('');
  const [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  async function load(signal) {
    const result = await portalApi('/auth/clinician-application', {
      signal
    });
    setData(result);
    setDetails(result.details || {});
  }
  useEffect(() => {
    if (authLoading) return;
    setData(null);
    setDetails({});
    setError('');
    setNotice('');
    if (!isAuthenticated) return;
    const controller = new AbortController();
    load(controller.signal).catch(err => {
      if (err.name !== 'AbortError') setError(err.message);
    });
    return () => controller.abort();
  }, [authLoading, isAuthenticated, user?.id]);
  async function save(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      setData(await portalApi('/auth/clinician-application', {
        method: 'PUT',
        body: details
      }));
      setNotice('Your professional details were submitted for review.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <ProtectedRoute><Head><title>{t("Clinician Application \xB7 Speation")}</title></Head><Navbar />
    <main className={styles.mainContent}><section className={styles.authCard}>
      <div className={styles.cardHeader}><h1>{data?.status === 'approved' ? t("Welcome to your workspace") : t("Your clinician application")}</h1><p>{data?.status === 'approved' ? t("Your clinician access is active. Families choose which learner records to share with you.") : t("Professional details are reviewed before clinician access is activated.")}</p></div>
      {error && <div role="alert" className={styles.errorMessage}>{t(error)}<button type="button" className={styles.submitBtn} onClick={() => {
            setError('');
            load().catch(err => setError(err.message));
          }}>{t("Retry")}</button></div>}
      {!data && !error && <p role="status">{t("Loading your application\u2026")}</p>}
      {notice && <p role="status" className={styles.successMessage}>{t(notice)}</p>}
      {data?.status === 'approved' ? <Link className={styles.primaryLink} href="/clinician">{t("Open clinician workspace \u2192")}</Link> : data && <>
        {data.status === 'pending' && <div className={styles.statusCard}><strong>{t("Submitted \xB7 awaiting review")}</strong><p>{t("Your application is saved. Approval is completed by the service administrator after professional verification.")}</p></div>}
        <form className={styles.form} onSubmit={save}><ClinicianDetailsFields value={details} onChange={setDetails} disabled={busy} /><button className={styles.submitBtn} disabled={busy}>{busy ? t("Saving\u2026") : data.status === 'pending' ? t("Update professional details") : t("Submit clinician application \u2192")}</button></form>
      </>}
      <p className={styles.switchText}><Link className={styles.switchLink} href="/family">{t("Family & participant hub")}</Link></p>
    </section></main>
  </ProtectedRoute>;
}
