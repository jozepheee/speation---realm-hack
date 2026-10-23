import { useLocale } from "../context/LocaleContext";
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import styles from '../styles/auth.module.css';
export default function ResetPassword() {
  const {
    t
  } = useLocale();
  const [ready, setReady] = useState(false),
    [password, setPassword] = useState(''),
    [confirmation, setConfirmation] = useState(''),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!isSupabaseConfigured()) return;
    const {
      data
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) setReady(true);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  async function submit(event) {
    event.preventDefault();
    setError('');
    if (password !== confirmation) {
      setError('The passwords must match.');
      return;
    }
    setBusy(true);
    try {
      const {
        error
      } = await supabase.auth.updateUser({
        password
      });
      if (error) throw error;
      await supabase.auth.signOut();
      setReady(false);
      setPassword('');
      setConfirmation('');
      setNotice('Password updated. Sign in with your new password.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <><Head><title>{t("Set a New Password \xB7 Speation")}</title></Head><Navbar /><main className={styles.mainContent}><section className={styles.authCard}><h1>{t("Set a new password")}</h1>{ready ? <form className={styles.form} onSubmit={submit}><label className={styles.inputGroup}>{t("New password")}<input className={styles.inputField} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={password} onChange={event => setPassword(event.target.value)} /></label><label className={styles.inputGroup}>{t("Confirm password")}<input className={styles.inputField} type="password" autoComplete="new-password" minLength={12} maxLength={128} required value={confirmation} onChange={event => setConfirmation(event.target.value)} /></label><button className={styles.submitBtn} disabled={busy}>{t("Update password")}</button></form> : <p>{notice || t("Open the recovery link from your email to enable this form. Expired links require a new request.")}</p>}{error && <p role="alert">{t(error)}</p>}<Link href="/login">{t("Sign in")}</Link> · <Link href="/forgot-password">{t("Request another link")}</Link></section></main></>;
}
