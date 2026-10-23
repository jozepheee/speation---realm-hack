import Head from 'next/head';
import Link from 'next/link';
import Navbar from '../components/Navbar';
import Footer from '../components/Footer';
import ProtectedRoute from '../components/ProtectedRoute';
import styles from '../styles/firststep.module.css';

export default function FirstStep() {
  return (
    <ProtectedRoute>
      <div className={styles.container}>
        <Head>
          <title>Oral & Breath Control Training — Speation</title>
        </Head>

        <Navbar />

        <div style={{ marginTop: '140px', textAlign: 'center' }}>
          <h2 className={styles.title}>Oral & Breath Control Training</h2>
          <p style={{ color: '#6C757D', maxWidth: '600px', margin: '10px auto 40px', fontSize: '1.05rem' }}>
            Strengthen your articulatory muscles and fine-tune vowel formant stability with video-guided oral biomechanics.
          </p>
        </div>

        <div className={styles.boxContainer}>
          <Link href="/firststep/mouth-analyze">
            <div className={styles.analysisBox}>
              <h3>Mouth Analyzer</h3>
              <p>Analyze your mouth movements and vowel opening ratio for better speech.</p>
            </div>
          </Link>

          <Link href="/firststep/tongue-analyze">
            <div className={styles.analysisBox}>
              <h3>Tongue Analyzer</h3>
              <p>Track and improve your lateral and vertical tongue placement movements.</p>
            </div>
          </Link>
        </div>

        <Footer />
      </div>
    </ProtectedRoute>
  );
}
