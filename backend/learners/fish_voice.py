"""Stateless Fish cloning through OpenRouter, with encrypted local references."""
import base64
import time
import httpx
from fastapi import HTTPException
from config import settings

_capability=(0,None,False)


async def available():
 global _capability
 if not settings.OPENROUTER_KEY:return False
 if _capability[1]==settings.OPENROUTER_CLONE_MODEL and time.monotonic()-_capability[0]<300:return _capability[2]
 try:
  async with httpx.AsyncClient(timeout=15) as client:
   response=await client.get(f'https://openrouter.ai/api/v1/models/{settings.OPENROUTER_CLONE_MODEL}/endpoints')
   response.raise_for_status();endpoints=response.json()['data']['endpoints']
  supported=any(item.get('supports_voice_cloning') is True for item in endpoints)
  _capability=(time.monotonic(),settings.OPENROUTER_CLONE_MODEL,supported)
  return supported
 except (httpx.HTTPError,ValueError,KeyError,TypeError):return False


async def synthesize_reference(text,language,reference):
 if not settings.OPENROUTER_KEY:raise HTTPException(503,'OpenRouter voice cloning is not configured')
 try:
  async with httpx.AsyncClient(timeout=60) as client:
   response=await client.post('https://openrouter.ai/api/v1/audio/speech',headers={'Authorization':f'Bearer {settings.OPENROUTER_KEY}'},json={
    'model':settings.OPENROUTER_CLONE_MODEL,'input':text,'response_format':'mp3',
    'instructions':{'en':'Speak in English, clearly and naturally.','hi':'हिन्दी में स्पष्ट और स्वाभाविक रूप से बोलें।','ml':'മലയാളത്തിൽ വ്യക്തമായും സ്വാഭാവികമായും സംസാരിക്കൂ.'}[language],
    'input_references':[{'type':'input_audio','input_audio':{'data':'data:audio/wav;base64,'+base64.b64encode(reference).decode()}}],
    'provider':{'data_collection':'deny'}})
   response.raise_for_status()
  if not response.content or 'audio' not in response.headers.get('content-type','').lower():raise ValueError('No audio response')
  return {'audio_base64':base64.b64encode(response.content).decode(),'alignment':None,'model':settings.OPENROUTER_CLONE_MODEL,'language':language,'synthetic':True,'cloned':True,'provider':'openrouter_fish'}
 except (httpx.HTTPError,ValueError,KeyError,TypeError) as error:
  raise HTTPException(503,'Fish voice cloning is unavailable. Check OpenRouter credits, privacy routing and model access. Your reference remains private; no stock voice was substituted.') from error
