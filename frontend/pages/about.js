import AACLink from '../components/AACLink';
import { useLocale } from "../context/LocaleContext";
import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import styles from '../styles/about.module.css';
export default function About() {
  const {
    t
  } = useLocale();
  return <div className={styles.page}><Head><title>{t("About Speation \xB7 A place for every voice")}</title></Head><Navbar />
    <main className={styles.main}>
      <section className={styles.hero}>
        <div><p className={styles.eyebrow}>{t("WHY WE\u2019RE HERE")}</p><h1>{t("A little practice.")}<br />{t("More ways to connect.")}</h1><p className={styles.lead}>{t("Everyday conversations matter. Speation brings speech practice, playful learning and human support into one welcoming place.")}</p><div className={styles.actions}><Link href="/companion">{t("Meet Maya \u2192")}</Link><Link href="/register">{t("Find your place")}</Link></div></div>
        <div className={styles.art} aria-label={t("A connected circle of speaking, listening and human support")} role="img"><div className={styles.orbitOne} /><div className={styles.orbitTwo} /><div className={styles.center}>{t("Every")}<br /><strong>{t("voice.")}</strong></div><span className={styles.bubbleOne}>{t("hello")}</span><span className={styles.bubbleTwo}>നമസ്കാരം</span><span className={styles.bubbleThree}>नमस्ते</span><span className={styles.spark}>✦</span></div>
      </section>
      <section className={styles.mission}><p className={styles.eyebrow}>{t("BUILT AROUND YOUR EVERYDAY")}</p><h2>{t("Support that fits the person.")}</h2><p>{t("For children and young people aged 4\u201321, alongside their families and clinicians. Choose English, Hindi or Malayalam, practise at your own pace, and use speech, typing or communication phrases to take part.")}</p></section>
      <section className={styles.cards} aria-label={t("How Speation helps")}>
        {[['01', 'Someone to talk with', 'Maya makes space for a conversation, a story or a small moment from your day. Voice and text offer different ways to join in.', '/companion', 'Meet your companion'], ['02', 'Practice worth coming back to', 'Listen, build words and tell stories in interactive worlds. Activities connect to language practice and your reviewed goals.', '/arcade', 'Explore speech adventures'], ['03', 'People who know your progress', 'Families manage sharing. Assigned clinicians review recordings, author practice goals and follow participation over time.', '/clinician', 'Clinician workspace']].map(([number, title, copy, url, label]) => <article key={number}><span>{number}</span><h3>{t(title)}</h3><p>{t(copy)}</p><Link href={url}>{t(label)} ↗</Link></article>)}
      </section>
      <section className={styles.values}><div><p className={styles.eyebrow}>{t("YOUR VOICE. YOUR CHOICE.")}</p><h2>{t("Small steps count.")}</h2></div><div><p>{t("Pauses, different ways of speaking and different ways of participating belong here. Communication tools stay available independently of game rewards.")}</p><p>{t("AI can help with practice and propose observations. Your clinician reviews sound-level feedback and makes clinical decisions.")}</p><AACLink href="/quick-words">{t("Try communication phrases \u2192")}</AACLink></div></section>
    </main><Footer /></div>;
}
