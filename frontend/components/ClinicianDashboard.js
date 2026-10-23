import IntakeSummary from './IntakeSummary';
import { useEffect, useState } from 'react';
import Head from 'next/head';
import Link from 'next/link';
import { useRouter } from 'next/router';
import Navbar from './Navbar';
import ProtectedRoute from './ProtectedRoute';
import CarePanel from './CarePanel';
import AICareReportQueue from './AICareReportQueue';
import ClinicalWorkload from './ClinicalWorkload';
import WeeklyRoutine from './WeeklyRoutine';
import ClinicalActivity from './ClinicalActivity';
import { useAuth } from '../context/AuthContext';
import { useLocale } from '../context/LocaleContext';
import { portalApi } from '../lib/portalApi';
import styles from '../styles/workspace.module.css';

export default function ClinicianDashboard() {
  const { user, loading: authLoading } = useAuth();
  const { t } = useLocale();
  const router = useRouter();
  const [patients, setPatients] = useState([]), [selected, setSelected] = useState('');
  const [query, setQuery] = useState(''), [loading, setLoading] = useState(true), [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const clinical = user?.workspace_role === 'clinician';
  const view = ['reviews', 'tasks'].includes(router.query.view) ? router.query.view : 'overview';
  const patient = patients.find(item => item.id === selected);
  useEffect(() => {
    if (authLoading || !clinical) return;
    const controller = new AbortController();
    setLoading(true); setError('');
    portalApi('/clinical/learners', { signal: controller.signal }).then(rows => {
      if (controller.signal.aborted) return;
      setPatients(rows);
      setSelected(current => rows.some(row => row.id === router.query.patient) ? router.query.patient : rows.some(row => row.id === current) ? current : rows[0]?.id || '');
    }).catch(err => { if (!controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [authLoading, clinical, retry]);
  useEffect(() => {
    if (patients.some(item => item.id === router.query.patient)) setSelected(router.query.patient);
  }, [router.query.patient, patients]);
  function choose(id) {
    if (!patients.some(item => item.id === id)) return;
    setSelected(id);
    void router.replace({ pathname: '/clinician', query: { ...router.query, patient: id } }, undefined, { shallow: true, scroll: false });
  }
  const tabs = [['overview', 'Patient performance'], ['reviews', 'Recording reviews'], ['tasks', 'Treatment tasks']];
  return <ProtectedRoute>
    <Head><title>{t('Clinician Workspace')} {t('· Speation')}</title></Head>
    <Navbar />
    <main className={styles.main}>
      <header className={styles.clinicalHeader}>
        <p className={styles.eyebrow}>{t('CLINICIAN WORKSPACE')}</p>
        <h1>{t('Your patients, in focus.')}</h1>
        <p>{t('Select a patient to review evidence, track practice and plan their next tasks.')}</p>
      </header>
      {!authLoading && !clinical ? <section className={styles.panel}><h2>{t('Clinician access')}</h2><p>{t('Submit your professional details to request clinician access, or check the status of your application.')}</p><Link className={styles.linkButton} href="/clinician-application">{t('Your clinician application →')}</Link></section> : <>
        <section className={styles.patientToolbar} aria-label={t('Patient selection')}>
          <label className={styles.form}>{t('Find a patient')}<input type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder={t('Search by name')} /></label>
          <label className={styles.form}>{t('Selected patient')}<select value={selected} disabled={loading || !patients.length} onChange={event => choose(event.target.value)}>
            {!patients.length && <option value="">{loading ? t('Loading patients…') : t('No assigned patients')}</option>}
            {patients.filter(item => item.id === selected || item.display_name.toLowerCase().includes(query.toLowerCase())).map(item => <option key={item.id} value={item.id}>{item.display_name} · {t('Age')} {item.age} · {item.language.toUpperCase()}</option>)}
          </select></label>
          <button className={styles.linkButton} disabled={loading} onClick={() => setRetry(value => value + 1)}>{t('Refresh patients')}</button>
        </section>
        {error && <p className={styles.error} role="alert">{t(error)}</p>}
        {!loading && !error && !patients.length && <section className={styles.panel}><h2>{t('Connect your first patient')}</h2><p>{t('No learners are assigned yet. A guardian or self-managed participant can grant access using your registered email.')}</p><p>{t('Ask the family to open Family Hub, select their profile, then grant Clinician access to your registered email.')}</p><p>{user?.email}</p><p>{t('Patient records, graphs and tasks appear after access is granted. No sample patient is added to your account.')}</p></section>}
        {patient && <>
          <div className={styles.patientHeading}><div><h2>{patient.display_name}</h2><p>{t('Age')} {patient.age} · {t('Practice language')}: {t({en:'English',hi:'Hindi',ml:'Malayalam'}[patient.language])}</p></div><Link className={styles.linkButton} href={`/knowledge-graph?learner=${patient.id}`}>{t('Patient knowledge graph')} →</Link></div>
          <nav className={styles.patientTabs} aria-label={t('Patient workspace')}>
            {tabs.map(([key, label]) => <Link key={key} aria-current={view === key ? 'page' : undefined} href={{pathname:'/clinician',query:{patient:patient.id,...(key === 'overview' ? {} : {view:key})}}} shallow scroll={false}>{t(label)}</Link>)}
          </nav>
          {view === 'overview' && <IntakeSummary key={`intake-${patient.id}`} learner={patient} clinical />}
          <CarePanel key={patient.id} learner={patient} clinical view={view} />
          {view === 'overview' && <ClinicalActivity key={patient.id} learner={patient} />}
          {view === 'overview' && <WeeklyRoutine key={patient.id} learner={patient} clinical />}
        </>}
        <AICareReportQueue onSelect={choose}/>
        <details className={styles.caseload}><summary>{t('All-patient review workload')}</summary>{!loading && <ClinicalWorkload onSelect={choose} />}</details>
      </>}
    </main>
  </ProtectedRoute>;
}
