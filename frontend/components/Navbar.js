import { useLocale } from "../context/LocaleContext";
import Link from 'next/link';
import LanguageSelector from './LanguageSelector';
import Image from 'next/image';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
import useLearners from '../hooks/useLearners';
import useAAC from '../hooks/useAAC';
import styles from '../styles/Navbar.module.css';
export default function Navbar() {
  const {
    t
  } = useLocale();
  const router = useRouter();
  const {
    user,
    logout,
    isAuthenticated
  } = useAuth();
  const {learner}=useLearners();
  const {enabled:aacEnabled}=useAAC();

  // Fluention navigation items
  const publicNavItems = [{
    label: 'What is Language Disorder?',
    href: '/explanation'
  }, {
    label: 'About Us',
    href: '/about'
  }];
  const authenticatedNavItems = [{
    label: 'Practice',
    href: '/practice-hub'
  }, {
    label: 'Companion',
    href: '/companion'
  }, {
    label: 'AAC',
    href: '/communication'
  }, {
    label: 'Progress',
    href: '/care-progress'
  }, {
    label: 'Arcade',
    href: '/arcade'
  }, {
    label: 'Family Hub',
    href: '/family'
  }];
  const clinician = user?.workspace_role === 'clinician';
  const patientQuery = router.query.patient || (router.pathname === '/knowledge-graph' ? router.query.learner : null);
  const selectedPatient = typeof patientQuery === 'string' ? patientQuery : null;
  const clinicalNavItems = [
    {label: 'Patient dashboard', href: '/clinician'},
    {label: 'Recording reviews', href: '/clinician?view=reviews'},
    {label: 'Treatment tasks', href: '/clinician?view=tasks'}
  ].map(item => ({...item, href: item.href + (selectedPatient ? `${item.href.includes('?') ? '&' : '?'}patient=${encodeURIComponent(selectedPatient)}` : '')}));
  const participantNav=learner?.age>=16?authenticatedNavItems.map(item=>item.href==='/arcade'?{label:'Study & career',href:'/speaking-lab'}:item.href==='/family'?{...item,label:'My support'}:item):authenticatedNavItems;
  const navItems = isAuthenticated ? (clinician ? clinicalNavItems : participantNav.filter(item=>item.href!=='/communication'||aacEnabled)) : publicNavItems;
  return <nav className={styles.navbar}>
      <Link href={clinician ? "/clinician" : "/"} className={styles.brand}>
        <Image src="/speation-icon.svg" alt={t("Speation Logo")} width={38} height={38} className={styles.brandLogo} priority />
        <span className={styles.brandText}>{t("Speation")}</span>
      </Link>

      <ul className={styles.navLinks}>
        {navItems.map(item => {
        const isActive = router.asPath.split('#')[0] === item.href;
        return <li key={item.href}>
              <Link href={item.href} className={isActive ? styles.activeLink : ''}>
                {t(item.label)}
              </Link>
            </li>;
      })}
      </ul>

      <details className={styles.mobileMenu}>
        <summary aria-label={t("Explore")}><span aria-hidden="true">☰</span><span className={styles.menuLabel}>{t("Explore")}</span></summary>
        <div>{navItems.map(item => <Link key={item.href} href={item.href}>{t(item.label)}</Link>)}
          
        </div>
      </details>

      <LanguageSelector />{isAuthenticated&&<Link href="/settings" aria-label={t('Settings')} title={t('Settings')}>⚙</Link>}<div className={styles.authSection}>
        {isAuthenticated && user ? <div className={styles.userBadge}>
            <div className={styles.userAvatar}>
              {(user.name || user.email || 'U').charAt(0).toUpperCase()}
            </div>
            <span className={styles.userName}>{user.name || t("Learner")}</span>
            <button className={styles.logoutBtn} onClick={async () => {
          if (await logout()) router.push('/login');
        }} title={t("Sign out")}>{t("Sign Out")}</button>
          </div> : <Link href="/login" className={styles.loginBtn}>{t("Login / Sign Up")}</Link>}
      </div>
    </nav>;
}
