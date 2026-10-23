import { useLocale } from "../context/LocaleContext";
import Head from 'next/head';
import Image from 'next/image';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import styles from '../styles/explanation.module.css';
export default function Explanation() {
  const {
    t
  } = useLocale();
  return <div className={styles.container}>
      <Head>
        <title>{t("What is Language Disorder? \u2014 Speation")}</title>
      </Head>

      <Navbar />

      <div className={styles.hero}>
        <div className={styles.yellowCircle}></div>
        <div className={styles.orangeCircle}></div>
        <div className={styles.whiteCover1}></div>
        <div className={styles.whiteCover2}></div>
        <div className={styles.lowerOrangeCircle}></div>
        <div className={styles.lowerWhiteCircle}></div>
        
        <h1 className={styles.heroText}>
          <span className={styles.line1}>{t("What is Language Disorder?")}</span>
        </h1>
      </div>

      {/* Understanding Language Disorders Section */}
      <section className={styles.languageDisorderSection}>
        <h2 className={styles.sectionTitle}>{t("Understanding Language Disorders")}</h2>
        <div className={styles.descriptionBox}>
          <p>{t("Language disorder refers to difficulties in understanding, processing, or expressing language. It is not simply about mispronouncing words or having a speech delay\u2014it involves challenges in comprehension, sentence structure, vocabulary use, and the ability to convey thoughts meaningfully.")}</p>
          <p>{t("Language disorders can affect both spoken and written communication and may persist from childhood into adulthood. Without appropriate support, individuals with language disorders often struggle with learning, social interactions, and daily communication.")}</p>
          <p>{t("Language disorders can be classified into receptive, expressive, and mixed language disorders, each affecting different aspects of communication.")}</p>
        </div>
      </section>

      {/* Types of Language Disorders */}
      <section className={styles.languageDisorders}>
        <h2 className={styles.sectionTitle}>{t("Types of Language Disorders")}</h2>

        <div className={styles.disorder}>
          <h3 className={styles.disorderTitle}>{t("Receptive Language Disorder (Difficulty Understanding Language)")}</h3>
          <p>{t("People with receptive language disorder struggle to understand spoken or written language. They may:")}</p>
          <ul>
            <li>{t("Have difficulty following instructions or processing what is being said.")}</li>
            <li>{t("Struggle with understanding complex sentences or figurative language.")}</li>
            <li>{t("Frequently ask for repetition or clarification.")}</li>
            <li>{t("Misinterpret words or conversations, leading to confusion in social situations.")}</li>
          </ul>
        </div>

        <div className={styles.disorder}>
          <h3 className={styles.disorderTitle}>{t("Expressive Language Disorder (Difficulty Using Language)")}</h3>
          <p>{t("Individuals with expressive language disorder have trouble forming sentences, choosing the right words, or structuring their thoughts into clear communication. They may:")}</p>
          <ul>
            <li>{t("Speak in short, incomplete sentences or struggle with proper grammar.")}</li>
            <li>{t("Have limited vocabulary and repeat simple words instead of using varied expressions.")}</li>
            <li>{t("Find it hard to describe events, share ideas, or hold a conversation.")}</li>
            <li>{t("Struggle with naming objects or recalling words, even when they recognize them.")}</li>
          </ul>
        </div>

        <div className={styles.disorder}>
          <h3 className={styles.disorderTitle}>{t("Mixed Receptive-Expressive Language Disorder")}</h3>
          <p>{t("Some individuals experience both receptive and expressive difficulties, meaning they struggle to understand language and express themselves effectively. This can significantly impact learning, social interactions, and overall communication ability.")}</p>
        </div>
      </section>

      {/* Causes Section */}
      <section className={styles.causesSection}>
        <h2 className={styles.sectionTitle}>{t("Causes of Language Disorders")}</h2>

        <div className={styles.causesContainer}>
          <div className={`${styles.circle} ${styles.orangeBorder}`}>
            <h3 className={styles.causesTitle}>{t("Neurological Injuries or Conditions")}</h3>
            <ul>
              <li>{t("Traumatic brain injuries (TBI)")}</li>
              <li>{t("Aphasia due to stroke")}</li>
              <li>{t("Brain tumors or degenerative conditions")}</li>
            </ul>
          </div>

          <div className={`${styles.circle} ${styles.yellowBorder}`}>
            <h3 className={styles.causesTitle}>{t("Neurodevelopmental Conditions")}</h3>
            <ul>
              <li>{t("Autism Spectrum Disorder (ASD)")}</li>
              <li>{t("Attention-Deficit Hyperactivity Disorder (ADHD)")}</li>
              <li>{t("Developmental Language Disorder (DLD)")}</li>
            </ul>
          </div>

          <div className={`${styles.circle} ${styles.orangeBorder}`}>
            <h3 className={styles.causesTitle}>{t("Auditory Processing")}</h3>
            <ul>
              <li>{t("Difficulty distinguishing speech phonemes in noisy rooms")}</li>
              <li>{t("Auditory processing and discrimination delays")}</li>
            </ul>
          </div>

          <div className={`${styles.circle} ${styles.yellowBorder}`}>
            <h3 className={styles.causesTitle}>{t("Genetic & Environmental")}</h3>
            <ul>
              <li>{t("Family history of speech-language disorders")}</li>
              <li>{t("Limited language immersion in developmental milestones")}</li>
            </ul>
          </div>
        </div>
      </section>

      {/* Impact Section */}
      <section className={styles.impactSection}>
        <h2 className={styles.sectionTitle}>{t("How Language Disorders Impact Daily Life")}</h2>
        <p className={styles.impactDescription}>{t("Language disorders are not just about speech difficulties\u2014they affect education, social interactions, emotional well-being, and daily independence.")}</p>

        <div className={styles.impactContainer}>
          <div className={`${styles.impactBox} ${styles.leftBox}`}>
            <h3 className={styles.impactTitle}>{t("Children & Students")}</h3>
            <ul>
              <li>{t("Struggles with reading, writing, and classroom instruction.")}</li>
              <li>{t("Frustration expressing complex thoughts to teachers.")}</li>
              <li>{t("Social hesitation or isolation during peer play.")}</li>
            </ul>
          </div>

          <div className={`${styles.impactBox} ${styles.rightBox}`}>
            <h3 className={styles.impactTitle}>{t("Adults")}</h3>
            <ul>
              <li>{t("Workplace communication friction in team discussions.")}</li>
              <li>{t("Anxiety before presentations or spontaneous conversations.")}</li>
              <li>{t("Fatigue from compensatory motor control efforts.")}</li>
            </ul>
          </div>
        </div>
      </section>

      <Footer />
    </div>;
}
