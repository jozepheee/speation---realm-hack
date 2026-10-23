import { useLocale } from "../context/LocaleContext";
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import styles from '../styles/auth.module.css';
export default function Login() {
  const {
    t
  } = useLocale();
  const router = useRouter();
  const {
    login, user, isAuthenticated
  } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!isAuthenticated) return;
    const destination = typeof router.query.redirect === 'string' && /^\/(?!\/)[^:]*$/.test(router.query.redirect) ? router.query.redirect : user?.workspace_role === 'clinician' ? '/clinician' : '/family';
    void router.replace(destination);
  }, [isAuthenticated, user?.workspace_role, router.isReady]);
  const handleSubmit = async e => {
    e.preventDefault();
    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    setError('');
    setLoading(true);
    const res = await login(email, password);
    if (res.success) {
      const destination = typeof router.query.redirect === 'string' && /^\/(?!\/)[^:]*$/.test(router.query.redirect) ? router.query.redirect : res.user?.workspace_role === 'clinician' ? '/clinician' : '/family';
      router.push(destination);
    } else {
      setError(res.error || 'Invalid credentials. Please verify your email and password.');
      setLoading(false);
    }
  };
  return <div className={styles.container}>
      <Head>
        <title>{t("Login \u2014 Speation Speech Therapy")}</title>
      </Head>

      <Navbar />

      <div className={styles.yellowCircle}></div>
      <div className={styles.orangeCircle}></div>
      <div className={styles.whiteCover1}></div>

      <main className={styles.mainContent}>
        <div className={styles.authCard}>
          <div className={styles.cardHeader}>
            <h1>{t("Welcome Back")}</h1>
            <p>{t("Log in to access your adaptive speech therapy sessions")}</p>
          </div>

          {error && <div className={styles.errorMessage}>{t(error)}</div>}

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.inputGroup}>
              <label htmlFor="email">{t("Email Address")}</label>
              <input id="email" type="email" className={styles.inputField} placeholder={t("name@example.com")} value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="password">{t("Password")}</label>
              <input id="password" type="password" className={styles.inputField} placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} required />
            </div>

            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? t("Signing In...") : t("Sign In")}
            </button>
          </form>
          <p className={styles.switchText}><Link href="/forgot-password">{t("Forgot your password?")}</Link></p>

          <p className={styles.switchText}>{t("Don't have an account?")}{' '}
            <Link href="/register" className={styles.switchLink}>{t("Sign up here")}</Link>
          </p>
        </div>
      </main>

      <Footer />
    </div>;
}
