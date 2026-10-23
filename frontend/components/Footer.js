import AACLink from './AACLink';
import { useLocale } from "../context/LocaleContext";
import Link from 'next/link';
import Image from 'next/image';
import { useAuth } from '../context/AuthContext';
import styles from '../styles/Footer.module.css';
export default function Footer() {
  const {
    t
  } = useLocale();
  const { user } = useAuth();
  if (user?.workspace_role === 'clinician') return <footer className={styles.footer}>
    <div className={styles.footerLogo}><Image src="/speation-icon.svg" alt={t('Speation Logo')} width={42} height={42}/><span className={styles.brandText}>{t('Speation')}</span></div>
    <div className={styles.footerLinks}><div className={styles.footerColumn}><h4>{t('Clinician Workspace')}</h4><ul>
      <li><Link href="/clinician">{t('Patient dashboard')}</Link></li>
      <li><Link href="/clinician?view=reviews">{t('Recording reviews')}</Link></li>
      <li><Link href="/clinician?view=tasks">{t('Treatment tasks')}</Link></li>
    </ul></div></div>
    <div className={styles.footerCopyright}><p>{t('© 2026 Speation. Guided speech practice with human review.')}</p></div>
  </footer>;
  return <footer className={styles.footer}>
      <div className={styles.footerLogo}>
        <Image src="/speation-icon.svg" alt={t("Speation Logo")} width={42} height={42} style={{
        objectFit: 'contain'
      }} />
        <span className={styles.brandText}>{t("Speation")}</span>
      </div>

      <div className={styles.footerLinks}>
        <div className={styles.footerColumn}>
          <h4>{t("Speech Assistant")}</h4>
          <ul>
            <li><Link href="/practice-studio">{t("Recording & Practice")}</Link></li>
            <li><AACLink href="/communication">{t("AAC")}</AACLink></li>
            <li><Link href="/companion">{t("Meet Maya")}</Link></li>
            <li><Link href="/arcade">{t("Speech Arcade")}</Link></li>
          </ul>
        </div>

        <div className={styles.footerColumn}>
          <h4>{t("Your Support")}</h4>
          <ul>
            <li><Link href="/practice-hub">{t("Four Steps of Practice")}</Link></li>
            <li><Link href="/missions">{t("Family Missions")}</Link></li>
            <li><Link href="/knowledge-graph">{t("Reviewed Speech Knowledge")}</Link></li>
            <li><Link href="/clinician">{t("Clinician Workspace")}</Link></li>
          </ul>
        </div>

        <div className={styles.footerColumn}>
          <h4>{t("Platform & Account")}</h4>
          <ul>
            <li><Link href="/family">{t("Family & Participant Hub")}</Link></li>
            <li><Link href="/login">{t("Sign In / Register")}</Link></li>
            <li><Link href="/care-progress">{t("Recorded Progress")}</Link></li>
            <li><Link href="/family">{t("Consent & Support Access")}</Link></li>
          </ul>
        </div>
      </div>

      <div className={styles.footerCopyright}>
        <p>{t("\xA9 2026 Speation. Guided speech practice with human review.")}</p>
      </div>
    </footer>;
}
