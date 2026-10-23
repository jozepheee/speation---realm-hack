import { supabase, isSupabaseConfigured } from './supabaseClient';
import {requestTransport} from './requestTransport';
const BACKEND = process.env.NEXT_PUBLIC_BACKEND_URL || '/api';

async function accessToken() {
  if (isSupabaseConfigured()) {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session) throw new Error('Please sign in again.');
    return data.session.access_token;
  }
  const token = localStorage.getItem('neuronudge_token');
  if (!token) throw new Error('Please sign in again.');
  return token;
}

export async function privateAudio(path,{signal,method='GET',body}={}) {
  const token = await accessToken();
  const {response,data}=await requestTransport(`${BACKEND}${path}`, {method,headers: { Authorization: `Bearer ${token}`,...(body?{'Content-Type':'application/json'}:{}) },...(body?{body:JSON.stringify(body)}:{}), cache: 'no-store',signal },'blob');
  if (!response.ok) throw new Error('This recording is not retained or you do not have access.');
  return data;
}

export async function portalApi(path, { method = 'GET', body, signal, timeoutMs } = {}) {
  const multipart = body instanceof FormData;
  const token = await accessToken();
  const {response,data}=await requestTransport(`${BACKEND}${path}`, {
    method, signal, cache: 'no-store',
    headers: { Authorization: `Bearer ${token}`, ...(body && !multipart ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: multipart ? body : JSON.stringify(body) } : {}),
  },'json',timeoutMs??(method==='GET'?45000:180000));
  if (!response.ok) {
    const detail = data.detail;
    throw new Error(typeof detail === 'string' ? detail : Array.isArray(detail)
      ? detail.map(item => item.msg).join('. ') : 'The request could not be completed.');
  }
  return data;
}
