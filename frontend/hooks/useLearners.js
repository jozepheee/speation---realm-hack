import { useEffect, useState } from 'react';
import { portalApi } from '../lib/portalApi';
import { useAuth } from '../context/AuthContext';

export default function useLearners() {
  const { isAuthenticated, loading, user } = useAuth();
  const [learners, setLearners] = useState([]), [selected, setSelected] = useState(''), [error, setError] = useState('');
  const [queryLoading, setQueryLoading] = useState(true);
  useEffect(() => { if (loading) return;
    setLearners([]); setSelected(''); setError('');
    if (!isAuthenticated) { setQueryLoading(false); return; }
    setQueryLoading(true);
    const controller = new AbortController();
    (async () => {
      const [own, assigned] = await Promise.all([
        portalApi('/learners', { signal: controller.signal }),
        user?.workspace_role === 'clinician' ? portalApi('/clinical/learners', { signal: controller.signal }) : Promise.resolve([]),
      ]);
      if (controller.signal.aborted) return;
      const roster = [...new Map([...own, ...assigned].map(item => [item.id, item])).values()];
      const remembered=localStorage.getItem(`speation-active-learner:${user?.id}`);
      setLearners(roster); setSelected(roster.some(item=>item.id===remembered)?remembered:roster[0]?.id || '');
    })().catch(err => { if (err.name !== 'AbortError' && !controller.signal.aborted) setError(err.message); })
      .finally(() => { if (!controller.signal.aborted) setQueryLoading(false); });
    return () => controller.abort();
  }, [loading, isAuthenticated, user?.id, user?.workspace_role]);
  useEffect(()=>{if(!selected||!user?.id)return;localStorage.setItem(`speation-active-learner:${user.id}`,selected);window.dispatchEvent(new CustomEvent('speation-learner',{detail:{user:user.id,id:selected}}));},[selected,user?.id]);
  useEffect(()=>{const change=event=>{if(event.detail.user===user?.id&&learners.some(item=>item.id===event.detail.id))setSelected(event.detail.id);};window.addEventListener('speation-learner',change);return()=>window.removeEventListener('speation-learner',change);},[learners,user?.id]);
  return { learners, selected, setSelected, learner: learners.find(item => item.id === selected), error, loading: loading || queryLoading };
}
