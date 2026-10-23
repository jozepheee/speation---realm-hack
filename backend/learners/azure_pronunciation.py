"""Dedicated provider adapter; inactive without explicit Azure credentials.

Provider scores are educational model outputs, not clinical outcomes. Hindi phone
labels are not assumed to be IPA. No prosody add-on is requested.
"""
import base64
import io
import json
import math
import re
import wave
import httpx
from learners.provider_http import client as provider_client
from config import settings


async def assess(clip, text, language):
    if language not in ['en','hi'] or not settings.AZURE_SPEECH_KEY or not settings.AZURE_SPEECH_REGION:
        return None
    region=settings.AZURE_SPEECH_REGION
    if not re.fullmatch(r'[a-z0-9-]{2,40}',region):
        raise ValueError('Invalid Azure Speech region')
    if not text.strip() or len(text)>300:raise ValueError('Provide a bounded practice target')
    with wave.open(io.BytesIO(clip),'rb') as audio:
        if audio.getframerate()!=16000 or audio.getnchannels()!=1 or audio.getsampwidth()!=2 or audio.getnframes()>20*16000:
            raise ValueError('Pronunciation assessment requires at most twenty seconds of 16 kHz mono PCM')
    config={'ReferenceText':text,'GradingSystem':'HundredMark','Granularity':'Phoneme',
            'Dimension':'Comprehensive','EnableMiscue':True}
    if language=='en':config.update(PhonemeAlphabet='IPA',NBestPhonemeCount=5)
    header=base64.b64encode(json.dumps(config,ensure_ascii=False).encode()).decode()
    async with provider_client(timeout=5 if language=='en' else 15) as client:
        response=await client.post(f'https://{region}.stt.speech.microsoft.com/speech/recognition/conversation/cognitiveservices/v1',
            params={'language':{'en':'en-US','hi':'hi-IN'}[language],'format':'detailed'},
            headers={'Ocp-Apim-Subscription-Key':settings.AZURE_SPEECH_KEY,'Pronunciation-Assessment':header,
                     'Content-Type':'audio/wav; codecs=audio/pcm; samplerate=16000'},content=clip)
        response.raise_for_status()
        body=response.json()
    if not isinstance(body,dict) or body.get('RecognitionStatus')!='Success':
        return {'source':'azure_pronunciation_assessment','state':'insufficient_evidence','words':[],'clinical_assessment':False}
    best=body.get('NBest')
    if not isinstance(best,list) or not best or not isinstance(best[0],dict):raise ValueError('Missing provider assessment')
    words=best[0].get('Words',[])
    if not isinstance(words,list) or not words or len(words)>200:raise ValueError('Invalid provider word assessment')
    normalized=[]
    for word in words:
        if not isinstance(word,dict):raise ValueError('Invalid provider word')
        assessment=word.get('PronunciationAssessment')
        # REST places scores on the word/phone; SDK-shaped responses nest them.
        if assessment is None and ('AccuracyScore' in word or 'ErrorType' in word):assessment=word
        if not isinstance(assessment,dict):raise ValueError('Provider returned transcription without pronunciation assessment')
        accuracy=assessment.get('AccuracyScore')
        if accuracy is not None and (isinstance(accuracy,bool) or not isinstance(accuracy,(int,float)) or not math.isfinite(accuracy) or not 0<=accuracy<=100):
            raise ValueError('Invalid provider accuracy score')
        phones=word.get('Phonemes',[])
        if not isinstance(phones,list) or len(phones)>100:raise ValueError('Invalid provider phones')
        normalized_phones=[]
        for phone in phones:
            if not isinstance(phone,dict):raise ValueError('Invalid provider phone')
            phone_assessment=phone.get('PronunciationAssessment') or phone
            if not isinstance(phone_assessment,dict):raise ValueError('Invalid provider phone assessment')
            score=phone_assessment.get('AccuracyScore')
            if score is not None and (isinstance(score,bool) or not isinstance(score,(int,float)) or not math.isfinite(score) or not 0<=score<=100):
                raise ValueError('Invalid provider phone score')
            alternatives=phone_assessment.get('NBestPhonemes',[])
            if not isinstance(alternatives,list) or len(alternatives)>10:raise ValueError('Invalid provider phone alternatives')
            normalized_alternatives=[]
            for item in alternatives:
                value=item.get('Score') if isinstance(item,dict) else None
                if isinstance(value,bool) or not isinstance(value,(int,float)) or not math.isfinite(value) or not 0<=value<=100:raise ValueError('Invalid provider alternative score')
                normalized_alternatives.append({'phone':str(item.get('Phoneme',''))[:50],'provider_score':value})
            normalized_phones.append({'provider_phone':str(phone.get('Phoneme',''))[:50], 'provider_accuracy_score':score,
                'provider_alternatives':normalized_alternatives})
        normalized.append({'word':str(word.get('Word',''))[:100], 'provider_accuracy_score':accuracy,
            'provider_error_type':str(assessment.get('ErrorType','Unknown'))[:50], 'provider_phones':normalized_phones})
    return {'source':'azure_pronunciation_assessment','state':'provider_assessment','language':language,
        'phone_alphabet':'IPA' if language=='en' else 'provider_default_not_assumed_IPA',
        'words':normalized,'phone_detail_available':any(phone['provider_phone'] for word in normalized for phone in word['provider_phones']),
        'phone_scores_available':any(phone['provider_accuracy_score'] is not None for word in normalized for phone in word['provider_phones']),'clinical_assessment':False,
        'instruction':'These are dedicated-provider educational scores, not diagnoses or verified mastery. '
                      'Hindi provider phone labels must not be reinterpreted as IPA. Do not invent produced sounds.'}
