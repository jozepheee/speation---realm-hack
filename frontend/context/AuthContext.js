import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import axios from 'axios';
import { supabase, isSupabaseConfigured } from '../lib/supabaseClient';

const AuthContext = createContext(null);
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || '/api';

let pendingVerification;
function verifiedProfile(token) {
  if (pendingVerification?.token === token) return pendingVerification.promise;
  const promise = (async () => {
    const options = { timeout: 25000, headers: { Authorization: `Bearer ${token}` } };
    for(let attempt=0;attempt<2;attempt++){
      try{return (await axios.get(`${BACKEND}/auth/me`,options)).data;}
      catch(error){if(attempt||error.response&&![502,503,504].includes(error.response.status))throw error;await new Promise(resolve=>setTimeout(resolve,1500));}
    }
  })().finally(() => { if (pendingVerification?.promise === promise) pendingVerification = null; });
  pendingVerification = { token, promise };
  return promise;
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null), [loading, setLoading] = useState(true), [authError, setAuthError] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    let active = true, subscription;
    async function accept(token) {
      const current = ++generation.current;
      setAuthError('');
      if (!token) { localStorage.removeItem('neuronudge_token'); setUser(null); setLoading(false); return; }
      try {
        const profile = await verifiedProfile(token);
        if (!active || current !== generation.current) return;
        localStorage.setItem('neuronudge_token', token); setUser(profile);
      } catch (error) {
        if (!active || current !== generation.current) return;
        setUser(null);
        if (error.response?.status === 401) localStorage.removeItem('neuronudge_token');
        else setAuthError('Your session could not be verified. Check the connection and retry.');
      } finally { if (active && current === generation.current) setLoading(false); }
    }
    if (isSupabaseConfigured()) {
      // Keep the SDK callback synchronous; profile verification uses the protected API.
      const { data } = supabase.auth.onAuthStateChange((event, session) => { void accept(session?.access_token); });
      subscription = data.subscription;
    } else void accept(localStorage.getItem('neuronudge_token'));
    return () => { active = false; generation.current += 1; subscription?.unsubscribe(); };
  }, []);

  async function login(email, password) {
    try {
      let token;
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        token = data.session.access_token;
      } else token = (await axios.post(`${BACKEND}/auth/login`, { email, password }, { timeout: 20000 })).data.access_token;
      const profile = await verifiedProfile(token);
      localStorage.setItem('neuronudge_token', token); setUser(profile); setAuthError('');
      return { success: true, user: profile };
    } catch (error) { return { success: false, error: typeof error.response?.data?.detail === 'string' ? error.response.data.detail : error.message || 'Sign-in failed.' }; }
  }
  async function register(name, email, password, personality = 'auditory', registration = {}) {
    if (password.length < 12 || password.length > 128) return { success: false, error: 'Use a password between 12 and 128 characters.' };
    try {
      if (isSupabaseConfigured()) {
        const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { name, personality, ...registration }, emailRedirectTo: `${window.location.origin}/${registration.account_type === 'clinician' ? 'clinician-application' : 'family'}` } });
        if (error) throw error;
        if (!data.session) return { success: true, message: 'Check your email to confirm your account before signing in.' };
        const profile = await verifiedProfile(data.session.access_token);
        localStorage.setItem('neuronudge_token', data.session.access_token); setUser(profile);
        return { success: true, user: profile };
      }
      const { data } = await axios.post(`${BACKEND}/auth/register`, { name, email, password, personality, ...registration }, { timeout: 20000 });
      if (data.requires_email_verification) return { success: true, message: data.message };
      localStorage.setItem('neuronudge_token', data.access_token); setUser(data.user);
      return { success: true, user: data.user };
    } catch (error) { return { success: false, error: typeof error.response?.data?.detail === 'string' ? error.response.data.detail : error.message || 'Registration failed.' }; }
  }
  async function logout() {
    generation.current += 1;
    if (isSupabaseConfigured()) {
      const { error } = await supabase.auth.signOut();
      if (error) { setAuthError('Sign-out could not be completed. Please retry.'); return false; }
    }
    localStorage.removeItem('neuronudge_token'); setUser(null); setAuthError('');
    return true;
  }
  return <AuthContext.Provider value={{ user, loading, authError, login, register, logout, isAuthenticated: !!user }}>{children}</AuthContext.Provider>;
}
export function useAuth() { const context = useContext(AuthContext); if (!context) throw new Error('useAuth requires AuthProvider'); return context; }
