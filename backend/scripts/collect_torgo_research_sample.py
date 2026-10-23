"""Bounded academic/non-profit TORGO archive sample; never production training.

Only public author-hosted data. Cap transfer/time and copy flat WAV/prompt/phone
files, never extract archive paths. A small sample is not representative validation.
"""
import argparse,hashlib,json,tarfile,time,urllib.request
from pathlib import Path,PurePosixPath

SOURCE='https://www.cs.toronto.edu/~complingweb/data/TORGO/torgo.html'
BASE='https://www.cs.toronto.edu/~complingweb/data/TORGO/'

class BoundedReader:
 def __init__(self,response,maximum,deadline):self.response=response;self.maximum=maximum;self.deadline=deadline;self.count=0
 def read(self,size=-1):
  if self.count>=self.maximum or time.monotonic()>self.deadline:raise RuntimeError('Research transfer/time cap reached')
  value=self.response.read(min(size if size>=0 else 65536,self.maximum-self.count));self.count+=len(value);return value

def main():
 parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--output',type=Path,required=True)
 parser.add_argument('--archive',choices=['F','M','FC','MC'],default='F');parser.add_argument('--max-mb',type=int,default=64);parser.add_argument('--seconds',type=int,default=90)
 args=parser.parse_args()
 if not 1<=args.max_mb<=256 or not 10<=args.seconds<=300:raise ValueError('Use a bounded research sample')
 args.output.mkdir(parents=True,exist_ok=True);files=[];reason='complete';reader=None;utterances={}
 try:
  with urllib.request.urlopen(BASE+args.archive+'.tar.bz2',timeout=15) as response:
   reader=BoundedReader(response,args.max_mb*1024*1024,time.monotonic()+args.seconds)
   with tarfile.open(fileobj=reader,mode='r|bz2') as archive:
    for member in archive:
     path=PurePosixPath(member.name)
     if not member.isfile() or member.size>3*1024*1024 or member.size<1:continue
     if path.suffix.lower() not in ['.wav','.txt','.phn']:continue
     parts=path.parts
     if not any(part in ['prompts','wav_headMic','phn_headMic'] for part in parts):continue
     if path.stem.lower() in ['alignment']:continue
     source=archive.extractfile(member)
     if not source:continue
     data=source.read(member.size);digest=hashlib.sha256(data).hexdigest();name=digest+path.suffix.lower()
     (args.output/name).write_bytes(data);files.append({'archive_path':member.name,'file':name,'sha256':digest,'bytes':len(data)})
     prefix=next((i for i,part in enumerate(parts) if part in ['prompts','wav_headMic','phn_headMic']),None)
     identity='/'.join(parts[:prefix])+'/'+path.stem;utterances.setdefault(identity,{})[path.suffix.lower()]=name
     if len([item for item in utterances.values() if '.wav' in item and '.txt' in item])>=12:reason='sample_limit';break
 except Exception as error:reason=f'{type(error).__name__}: {error}'
 manifest={'source':SOURCE,'archive':args.archive,'license_scope':'academic non-profit only; cite Rudzicz, Namasivayam and Wolff (2012), The TORGO database of acoustic and articulatory speech from speakers with dysarthria',
  'files':files,'utterances':utterances,'downloaded_bytes':reader.count if reader else 0,'stop_reason':reason,
  'production_training':False,'representative_validation':False,'child_validation':False,
  'warning':'Prompts are intended speech, not independently labelled sound-error truth. Review phone annotation provenance before scoring.'}
 (args.output/'manifest.json').write_text(json.dumps(manifest,indent=2),encoding='utf-8')
 print(json.dumps({'files':len(files),'paired_audio_prompts':sum('.wav' in item and '.txt' in item for item in utterances.values()),'downloaded_bytes':manifest['downloaded_bytes'],'stop_reason':reason}))

if __name__=='__main__':main()
