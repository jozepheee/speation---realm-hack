"""Real provider/audio requests on hash-verified adult synthetic controls only."""
import asyncio
import hashlib
import json
import time
from pathlib import Path

from fluency.audio import decode_audio
from learners.pronunciation_reference import target_reference
from learners.speech_coaching import CoachingResponse, dedicated_provider_context, listen, validate_feedback
from learners.sound_teaching import provider_concerns, teaching_plan

ROOT=Path(__file__).resolve().parents[2]


async def main():
    rows=[]
    sources=[('ml','malayalam-combined-coaching-20261017.json','ml-contrast-audio'),
             ('regional','en-hi-combined-coaching-20261017.json','en-hi-contrast-audio')]
    for group,filename,cache in sources:
        baseline=json.loads((ROOT/'docs/validation'/filename).read_text(encoding='utf-8'))['results']
        manifest=json.loads((ROOT/'tmp/provider-check'/cache/'manifest.json').read_text(encoding='utf-8'))
        for row in baseline:
            language=row.get('language','ml')
            # Four Malayalam controls and one matching/contrasting pair per Azure language.
            if group=='regional' and row['target'] not in ['ship','ताल']:continue
            started=time.monotonic()
            key=next(key for key,item in manifest.items() if item['sha256']==row['audio_sha256'])
            clip=(ROOT/'tmp/provider-check'/cache/(key+'.wav')).read_bytes()
            assert hashlib.sha256(clip).hexdigest()==row['audio_sha256']
            context={'language':language,'mode':'practice','expected_text':row['target'],'target_sound':'',
                'duration_seconds':len(decode_audio(clip))/16000,'previous_audio_proposals':[],
                'pronunciation_reference':target_reference(row['target'],language),
                # Recognizer unchanged; these exact hash-matched audio hypotheses are cached.
                'independent_phone_observation':row.get('observation',row.get('independent_phone_observation'))}
            try:
                azure=await dedicated_provider_context(clip,context)
                if azure:context['dedicated_provider_assessment']=azure
                if provider_concerns(context):
                    result=CoachingResponse(state='insufficient_evidence',summary='Dedicated provider teaching',concerns=[])
                    model='azure_pronunciation_assessment'
                else:result,model=await listen(clip,context)
                raw=result.model_dump()
                result=validate_feedback(result,context)
                plan=teaching_plan(context,result.concerns)
                context['previous_audio_proposals']=[{'recording_id':'benchmark-prior-attempt','concerns':[c.model_dump() for c in result.concerns]}]
                repeated=teaching_plan(context,result.concerns)
                output={'language':language,'target':row['target'],'synthetic_spoken_text':row['synthetic_spoken_text'],
                    'audio_sha256':row['audio_sha256'],'model':model,'raw_response':raw,'content':result.model_dump(),
                    'teaching_plan':plan,'repeat_teaching_simulation':repeated,'dedicated_provider_assessment':azure,
                    'cached_acoustic_hypotheses':context['independent_phone_observation'],
                    'elapsed_seconds':round(time.monotonic()-started,2)}
            except Exception as error:
                output={'language':language,'target':row['target'],'error_type':type(error).__name__}
            rows.append(output)
            (ROOT/'docs/validation/first-attempt-teaching-20261017.json').write_text(json.dumps({
                'scope':'adult_synthetic_engineering_controls_not_gold_pronunciation',
                'clinical_validation':False,'microphone_test':False,'results':rows},ensure_ascii=False,indent=2),encoding='utf-8')
            print(json.dumps({'language':language,'target':row['target'],'spoken':row['synthetic_spoken_text'],
                'state':output.get('content',{}).get('state'),'concerns':len(output.get('content',{}).get('concerns',[])),
                'error_type':output.get('error_type'),'seconds':output.get('elapsed_seconds')},ensure_ascii=True),flush=True)


if __name__=='__main__':asyncio.run(main())
