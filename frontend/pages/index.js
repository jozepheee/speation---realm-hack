import {AACVisibility} from '../components/AACLink';
import { useLocale } from '../context/LocaleContext';
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import styles from '../styles/home.module.css';

function ActivityIcon({kind}) {
  return <svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{kind==='voice'?<><path d="M7 6h18a3 3 0 0 1 3 3v11a3 3 0 0 1-3 3H14l-7 5v-5H6a3 3 0 0 1-3-3V9a3 3 0 0 1 4-3Z"/><path d="M10 12v5m6-8v11m6-8v5"/></>:kind==='play'?<><path d="m16 3 4 9 10 1-7 7 2 10-9-5-9 5 2-10-7-7 10-1Z"/><path d="m13 15 7 1-5 5"/></>:<><path d="M5 7h22v18H5zM12 7v18M20 7v18M5 16h22"/><path d="m8 11 1 1m7 0h1m7 0h1m-9 8h1m7 0h1"/></>}</svg>;
}

export default function Home() {
  const {t}=useLocale();
  return <><Head><title>{t('Speation · A place for every voice')}</title><meta name="description" content="Multilingual guided speech practice, a warm AI companion, playful adventures, communication tools, and human review." /></Head><Navbar />
    <main className={styles.main}>
      <section className={styles.hero}>
        <div className={styles.copy}>
          <span className={styles.eyebrow}><i aria-hidden="true" />{t('SMALL MOMENTS. MEANINGFUL CONNECTIONS.')}</span>
          <h1>{t('A place for')}<br /><em>{t('every voice.')}</em><svg className={styles.underline} viewBox="0 0 340 18" aria-hidden="true"><path d="M5 12Q150-5 332 9" /></svg></h1>
          <p>{t('Meet Maya. Explore beautiful worlds. Find the words that matter to you, with support from your family and clinician.')}</p>
          <div className={styles.actions}><Link className={styles.primary} href="/companion">{t('Meet Maya')}<span aria-hidden="true">↗</span></Link><Link className={styles.secondary} href="/practice-hub">{t('Practice')}<span aria-hidden="true">→</span></Link></div>
          <div className={styles.languages}><span aria-hidden="true">◎</span><div><strong>{t('English · हिन्दी · മലയാളം')}</strong><small>{t('Profiles for ages 4–21')}</small></div></div>
        </div>
        <div className={styles.art}>
          <img src="/games/sky-gardens.png" alt={t('Illustrated floating garden islands above soft clouds')} fetchPriority="high" />
          <div className={styles.artTag}><span aria-hidden="true">✦</span>{t('A WORLD TO EXPLORE')}</div>
          <div className={styles.artLabel}><div className={styles.soundMark} aria-hidden="true"><i/><i/><i/><i/><i/></div><div><small>{t('Your companion')}</small><strong>{t('At your own pace.')}</strong></div><Link href="/companion" aria-label={t('Meet Maya')}>↗</Link></div>
          <span className={styles.sparkle} aria-hidden="true">✧</span>
        </div>
      </section>
      <section className={styles.features}>
        <Link href="/companion" className={styles.connect}><div className={styles.cardTop}><div className={styles.icon}><ActivityIcon kind="voice" /></div><span>{t('01 / CONNECT')}</span><b aria-hidden="true">↗</b></div><h2>{t('A companion who makes room for you.')}</h2><p>{t('Conversation, personal stories, reviewed practice goals, and time to express yourself.')}</p><span className={styles.cardAction}>{t('Companion')} <span aria-hidden="true">→</span></span></Link>
        <Link href="/arcade" className={styles.explore}><div className={styles.cardTop}><div className={styles.icon}><ActivityIcon kind="play" /></div><span>{t('02 / EXPLORE')}</span><b aria-hidden="true">↗</b></div><h2>{t('Play with a little purpose.')}</h2><p>{t('Memory, listening, and storytelling adventures. Participation lights the way.')}</p><span className={styles.cardAction}>{t('Arcade')} <span aria-hidden="true">→</span></span></Link>
        <AACVisibility><Link href="/communication" className={styles.express}><div className={styles.cardTop}><div className={styles.icon}><ActivityIcon kind="words" /></div><span>{t('03 / EXPRESS')}</span><b aria-hidden="true">↗</b></div><h2>{t('Your meaning comes first.')}</h2><p>{t('Personal phrases and a communication board, with optional synthetic voice output.')}</p><span className={styles.cardAction}>{t('AAC')} <span aria-hidden="true">→</span></span></Link></AACVisibility>
      </section>
      <section className={styles.care}><div><p className={styles.eyebrow}>{t('HUMAN GUIDANCE, CONNECTED')}</p><h2>{t('Every learner has their own path.')}</h2><p className={styles.careDescription}>{t('Clinicians review recorded attempts and author goals. Families bring practice into everyday routines. A speech knowledge graph connects the evidence.')}</p><div className={styles.careActions}><Link className={styles.primary} href="/family">{t('Family Hub')} <span aria-hidden="true">↗</span></Link><Link className={styles.secondary} href="/clinician">{t('Clinician workspace →')}</Link></div></div><div className={styles.path}><strong>{t('Every observation has a source.')}</strong>{['Practice','Recording reviews','Progress'].map((key,index)=><div key={key}><span aria-hidden="true">0{index+1}</span><b>{t(key)}</b><span aria-hidden="true">{index===2?'✦':'↓'}</span></div>)}</div></section>
      <footer><Link href="/" className={styles.footerBrand}><img src="/speation-icon.svg" alt="" />{t('Speation')}</Link><span>{t('Speation · Guided speech practice with human review.')}</span><Link href="/about">{t('About Us')} <span aria-hidden="true">↗</span></Link></footer>
    </main></>;
}
