import { useLocale } from "../context/LocaleContext";
import { useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import { useAuth } from '../context/AuthContext';
import styles from '../styles/auth.module.css';
import ClinicianDetailsFields from '../components/ClinicianDetailsFields';
export default function Register() {
  const {
    t
  } = useLocale();
  const router = useRouter();
  const {
    register
  } = useAuth();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const personality = 'auditory';
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [accountType, setAccountType] = useState('family');
  const [details, setDetails] = useState({});
  const [notice, setNotice] = useState('');
  const clinical = accountType === 'clinician';
  const handleSubmit = async e => {
    e.preventDefault();
    if (!name || !email || !password) {
      setError('Please fill out all fields.');
      return;
    }
    setError('');
    setNotice('');
    setLoading(true);
    try {
      const res = await register(name.trim(), email.trim(), password, personality, {
        account_type: accountType,
        ...(clinical ? {
          clinician_application: details
        } : {})
      });
      if (res.success) {
        if (res.message) {
          setNotice(clinical ? 'Check your email to verify your account, then sign in to view your application. Clinician access requires professional approval.' : res.message);
          return;
        }
        router.push(clinical ? '/clinician-application' : '/family');
      } else {
        setError(res.error || 'Registration failed. Please try again.');
      }
    } catch (err) {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };
  return <div className={styles.container}>
      <Head>
        <title>{clinical ? t("Clinician Registration") : t("Create Account")} {t("\xB7 Speation")}</title>
      </Head>

      <Navbar />

      <main className={styles.registrationMain}>
        <section className={styles.registrationIntro}>
          <Link href="/" className={styles.wordmark}>{t("speation")}<span>✦</span></Link>
          <p className={styles.eyebrow}>{t("MORE WAYS TO CONNECT")}</p>
          <h1>{clinical ? t("Care that continues beyond the clinic.") : t("Every voice deserves a way forward.")}</h1>
          <p>{clinical ? t("Bring practice, family participation and reviewed evidence into one connected workspace.") : t("A companion to practise with. Worlds to explore. People to support you.")}</p>
          <ol className={styles.journey}>{(clinical ? [['01', 'Create your professional account', 'Tell us about your practice and registration.'], ['02', 'Complete verification', 'Verify your email and have your professional details reviewed.'], ['03', 'Connect with your learners', 'Families choose which learner records to share.']] : [['01', 'Make it yours', 'Create profiles for ages 4–21 and choose your practice language.'], ['02', 'Find your rhythm', 'Talk with Maya, play and practise at your own pace.'], ['03', 'Stay connected', 'Choose who supports you and what you share.']]).map(([step, title, description]) => <li key={step}><span>{step}</span><div><strong>{t(title)}</strong><p>{t(description)}</p></div></li>)}</ol>
          <div className={styles.languageNote}>{t("ENGLISH")} <span>·</span> हिन्दी <span>·</span> മലയാളം</div>
        </section>
        <div className={`${styles.authCard} ${styles.registrationCard}`}>
          <div className={styles.accountChoices} aria-label={t("Account type")}>
            <button type="button" aria-pressed={!clinical} disabled={loading} onClick={() => {
            setAccountType('family');
            setNotice('');
            setError('');
          }}>{t("For families")}<small>{t("Parents & participants")}</small></button>
            <button type="button" aria-pressed={clinical} disabled={loading} onClick={() => {
            setAccountType('clinician');
            setNotice('');
            setError('');
          }}>{t("For clinicians")}<small>{t("Speech & language care")}</small></button>
          </div>
          <div className={styles.cardHeader}>
            <h2>{clinical ? t("Join as a clinician") : t("Start your journey")}</h2>
            <p>{clinical ? t("Create your account and submit your professional details.") : t("A little courage. A place to begin.")}</p>
          </div>

          {error && <div role="alert" className={styles.errorMessage}>{t(error)}</div>}
          {notice && <div role="status" className={styles.successMessage}>{t(notice)}<Link href={`/login?redirect=${clinical ? '/clinician-application' : '/family'}`}>{t("Continue to sign in \u2192")}</Link></div>}

          {!notice && <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.inputGroup}>
              <label htmlFor="name">{t("Full Name")}</label>
              <input id="name" type="text" autoComplete="name" maxLength={80} className={styles.inputField} placeholder={t("e.g. Jordan Lee")} value={name} onChange={e => setName(e.target.value)} required />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="email">{t("Email Address")}</label>
              <input id="email" type="email" autoComplete="email" className={styles.inputField} placeholder={t("name@example.com")} value={email} onChange={e => setEmail(e.target.value)} required />
            </div>

            <div className={styles.inputGroup}>
              <label htmlFor="password">{t("Password")}</label>
              <input id="password" type="password" minLength={12} maxLength={128} className={styles.inputField} autoComplete="new-password" placeholder={t("At least 12 characters")} value={password} onChange={e => setPassword(e.target.value)} required />
            </div>
            {clinical && <ClinicianDetailsFields value={details} onChange={setDetails} disabled={loading} />}
            <button type="submit" className={styles.submitBtn} disabled={loading}>
              {loading ? t("Creating your account\u2026") : clinical ? t("Create clinician account \u2192") : t("Create my account \u2192")}
            </button>
          </form>}

          <p className={styles.switchText}>{t("Already have an account?")}{' '}
            <Link href={`/login?redirect=${clinical ? '/clinician-application' : '/family'}`} className={styles.switchLink}>{t("Sign in here")}</Link>
          </p>
        </div>
      </main>

      <Footer />
    </div>;
}
