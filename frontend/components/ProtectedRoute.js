import { useLocale } from "../context/LocaleContext";
import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../context/AuthContext';
export default function ProtectedRoute({
  children
}) {
  const {
    t
  } = useLocale();
  const {
    isAuthenticated,
    loading,
    authError
  } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !isAuthenticated && !authError) {
      router.replace(`/login?redirect=${encodeURIComponent(router.asPath)}`);
    }
  }, [isAuthenticated, loading, authError, router]);
  if (loading) {
    return <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: "'Livvic', sans-serif",
      background: '#FAF8F5'
    }}>
        <div style={{
        width: '42px',
        height: '42px',
        border: '4px solid #FFEFC2',
        borderTop: '4px solid #FF6225',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite'
      }} />
        <p style={{
        marginTop: '16px',
        color: '#6C757D',
        fontWeight: 600,
        fontSize: '0.95rem'
      }}>{t("Verifying session...")}</p>
        <style jsx>{`
          @keyframes spin {
            0% { transform: rotate(0deg); }
            100% { transform: rotate(360deg); }
          }
        `}</style>
      </div>;
  }
  if (authError) return <main style={{
    padding: 40
  }}><p role="alert">{t(authError)}</p><button onClick={() => router.reload()}>{t("Retry session verification")}</button></main>;
  if (!isAuthenticated) {
    return null;
  }
  return children;
}
