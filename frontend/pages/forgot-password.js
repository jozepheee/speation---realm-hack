import { useLocale } from "../context/LocaleContext";
import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';
import styles from '../styles/auth.module.css';
export default function ForgotPassword() {
  const {
    t
  } = useLocale();
  const [email, setEmail] = useState(''),
    [notice, setNotice] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (!isSupabaseConfigured()) throw new Error('Password recovery requires the configured hosted identity provider.');
      const {
        error
      } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`
      });
      if (error) throw error;
      setNotice('If this address has an account, a recovery email will arrive. Open its link on this device.');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  }
  return <><Head><title>{t("Recover Your Account \xB7 Speation")}</title></Head><Navbar /><main className={styles.mainContent}><section className={styles.authCard}><h1>{t("Recover your account")}</h1><p>{t("Enter your account email to request a recovery link.")}</p><form className={styles.form} onSubmit={submit}><label className={styles.inputGroup}>{t("Email address")}<input className={styles.inputField} type="email" autoComplete="email" required value={email} onChange={event => setEmail(event.target.value)} /></label><button className={styles.submitBtn} disabled={busy}>{busy ? t("Requesting\u2026") : t("Send recovery link")}</button></form>{error && <p role="alert">{t(error)}</p>}{notice && <p role="status">{t(notice)}</p>}<Link href="/login">{t("Back to sign in")}</Link></section></main></>;
}
