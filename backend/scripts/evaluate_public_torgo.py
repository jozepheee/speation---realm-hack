"""Local out-of-corpus recognition smoke check; not sound-error validation.

Uses only the author-hosted academic TORGO sample and cached model weights.
No network, training, activation or learner recordings.
"""
import argparse,copy,hashlib,json,time
from pathlib import Path

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--sample',type=Path,required=True);parser.add_argument('--adapted',type=Path,required=True);parser.add_argument('--output',type=Path,required=True)
 args=parser.parse_args()
 import torch
 from transformers import WhisperProcessor,WhisperForConditionalGeneration
 from fluency.audio import decode_audio
 from learners.asr_evaluation import report
 torch.set_num_threads(4);manifest=json.loads((args.sample/'manifest.json').read_text());samples=[]
 for identity,item in manifest['utterances'].items():
  if '.wav' not in item or '.txt' not in item:continue
  text=(args.sample/item['.txt']).read_text(encoding='utf-8',errors='replace').strip()
  if not text or text.lower()=='xxx' or '.jpg' in text.lower():continue
  samples.append((identity,text,decode_audio((args.sample/item['.wav']).read_bytes())))
 if not samples:raise ValueError('No paired audio/prompts acquired')
 results={};started=time.perf_counter();decoding=None
 for label,path in [('baseline','openai/whisper-tiny.en'),('adapted',str(args.adapted.resolve()))]:
  processor=WhisperProcessor.from_pretrained(path,local_files_only=True)
  model=WhisperForConditionalGeneration.from_pretrained(path,local_files_only=True,use_safetensors=True);model.eval();rows=[]
  if decoding is None:
   decoding=copy.deepcopy(model.generation_config)
   # Explicit empty lists prevent model-specific fallback filling a None value.
   for name in ['suppress_tokens','begin_suppress_tokens','forced_decoder_ids']:
    if getattr(decoding,name,None) is None:setattr(decoding,name,[])
  with torch.inference_mode():
   for identifier,text,audio in samples:
    encoded=processor.feature_extractor(audio,sampling_rate=16000,return_tensors='pt',return_attention_mask=True)
    value=model.generate(input_features=encoded.input_features,attention_mask=encoded.attention_mask,generation_config=copy.deepcopy(decoding),max_new_tokens=30,num_beams=1,do_sample=False,use_cache=True)
    rows.append({'id':identifier,'reference_prompt':text,'hypothesis':processor.batch_decode(value,skip_special_tokens=True)[0]})
  results[label]={'recognition':report([(row['reference_prompt'],row['hypothesis']) for row in rows]),'utterances':rows};del model
  print(json.dumps({'completed_model':label,'utterances':len(rows)}),flush=True)
 result={'source':manifest['source'],'population':'TORGO F01 sample, separate corpus from IEdysarthria adaptation','models':results,'seconds':round(time.perf_counter()-started,2),
  'protocol':'Shared baseline generation configuration for both models; greedy decode, cached weights, no expected-text prompt. WER against intended prompts only; actual produced-phoneme truth unavailable.',
  'shared_generation_config_sha256':hashlib.sha256(decoding.to_json_string().encode()).hexdigest(),
  'decoder_parity_verified':False,'runtime_limitation':'Shared requested generation settings are not proof of identical effective decoder configuration; inspect runtime warnings before making controlled comparisons.','representative_validation':False,'child_validation':False,'sound_error_validation':False,'production_activation':False,'license_scope':manifest['license_scope']}
 args.output.parent.mkdir(parents=True,exist_ok=True);args.output.write_text(json.dumps(result,indent=2),encoding='utf-8')

if __name__=='__main__':main()
