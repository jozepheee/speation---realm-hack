import { useLocale } from "../context/LocaleContext";
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import ProtectedRoute from '../components/ProtectedRoute';
import CarePanel from '../components/CarePanel';
import useLearners from '../hooks/useLearners';
import styles from '../styles/workspace.module.css';
export default function Progress() {
  const {
    t
  } = useLocale();
  const {
    learners,
    learner,
    selected,
    setSelected,
    error
  } = useLearners();
  return <ProtectedRoute><Head><title>{t("Recorded Progress \xB7 Speation")}</title></Head><Navbar />
    <main className={styles.main}><header className={styles.hero}><p className={styles.eyebrow}>{t("EVIDENCE OVER ESTIMATES")}</p><h1>{t("Your practice, over time.")}</h1><p>{t("Recordings and clinician-reviewed observations show what happened and what needs support.")}</p></header>
      {error && <p className={styles.error} role="alert">{t(error)}</p>}
      <label className={styles.form}>{t("Learner")}<select value={selected} onChange={event => setSelected(event.target.value)}>{learners.map(item => <option key={item.id} value={item.id}>{item.display_name}</option>)}</select></label>
      {learner ? <CarePanel key={learner.id} learner={learner} /> : <p>{t("Create a profile or receive a clinician assignment in the")} <Link href="/family">{t("family hub")}</Link> {t("to view recorded progress.")}</p>}
    </main></ProtectedRoute>;
}
