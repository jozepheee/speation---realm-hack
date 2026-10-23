import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';
import styles from '../styles/speechassistant.module.css';

export default function SpeechAssistant() {
  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <Head>
          <title>Speech Assistant — Speation</title>
        </Head>

        <Navbar />

        {/* Hero Geometric Circles */}
        <div className={styles.hero}>
          <div className={styles.yellowCircle}></div>
          <div className={styles.orangeCircle}></div>
          <div className={styles.whiteCover1}></div>
          <div className={styles.whiteCover2}></div>
        </div>

        {/* Speech Assistant 4 Pillars */}
        <section className={styles.speechAssistant}>
          <div className={styles.titleContainer}>
            <h1 className={styles.title}>Speech Assistant</h1>
          </div>

          <div className={styles.boxContainer}>
            <Link href="/firststep" className={styles.box}>
              <span>Oral & Breath Control Training</span>
            </Link>
            <Link href="/secondstep" className={styles.box}>
              <span>Receptive & Expressive Language Development</span>
            </Link>
            <Link href="/thirdstep" className={styles.box}>
              <span>Vocabulary Enhancement</span>
            </Link>
            <Link href="/avatar" className={styles.box}>
              <span>Contextual Communication (3D AI Partner)</span>
            </Link>
          </div>
        </section>

        <Footer />
      </div>
    </ProtectedRoute>
  );
}
