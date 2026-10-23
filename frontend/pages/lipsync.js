import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function LipsyncRedirect() {
  const router = useRouter();
  useEffect(() => { router.replace('/avatar'); }, [router]);
  return null;
}
