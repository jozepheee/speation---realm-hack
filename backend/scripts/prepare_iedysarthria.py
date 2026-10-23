"""Index the supplied IITM corpus locally; do not redistribute its data."""
import argparse,hashlib,json,re,wave
from pathlib import Path

def prepare(root,destination):
    root=Path(root).resolve();destination=Path(destination)
    if destination.exists():raise ValueError('Use a new manifest directory')
    labels=root/'txt.done.data';rows=[];seen=set()
    for line in labels.read_text(encoding='utf-8').splitlines():
        match=re.fullmatch(r'\(\s*([\w-]+)\s+"(.*)"\s*\)',line.strip())
        if not match:raise ValueError('Invalid corpus transcript format')
        identifier,text=match.groups();audio=root/'wav'/f'{identifier}.wav'
        with wave.open(str(audio),'rb') as source:
            duration=source.getnframes()/source.getframerate()
            if source.getframerate()!=16000 or source.getnchannels()!=1 or not .1<=duration<=30:raise ValueError('Unsupported corpus audio')
        digest=hashlib.sha256(audio.read_bytes()).hexdigest()
        if digest in seen:raise ValueError('Duplicate audio must be resolved before splitting')
        seen.add(digest)
        rows.append({'id':identifier,'audio':str(audio),'text':text,'sha256':digest,'speaker_id':'iitm_single_adult_male','language':'en','duration_seconds':duration})
    if len(rows)<20:raise ValueError('Insufficient corpus for this pilot split')
    # Corpus IDs define a frozen split; no model-dependent selection.
    rows.sort(key=lambda row:hashlib.sha256(row['id'].encode()).hexdigest())
    held=max(5,len(rows)//10);splits={'test':rows[:held],'dev':rows[held:held*2],'train':rows[held*2:]}
    if len({row['text'].casefold() for row in rows})!=len(rows):raise ValueError('Duplicate transcript groups need a grouped split')
    destination.mkdir(parents=True)
    for name,items in splits.items():(destination/f'{name}.jsonl').write_text('\n'.join(json.dumps(item) for item in items)+'\n',encoding='utf-8')
    info={'source':'IITM Indian English Dysarthric Speech Data','speakers':1,'population':'single adult male','split_policy':'held_out_utterances_same_speaker','counts':{name:len(items) for name,items in splits.items()},'total_seconds':sum(row['duration_seconds'] for row in rows),'cross_speaker_validation':False,'child_validation':False,'license_path':str(root/'License.pdf'),'distribution':'internal_use_only','citation':'Prakash, Reddy and Murthy, Improvement of Continuous Dysarthric Speech Quality, SLPAT 2016'}
    (destination/'dataset_info.json').write_text(json.dumps(info,indent=2),encoding='utf-8')
    return info

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('corpus_root');parser.add_argument('new_private_directory');args=parser.parse_args();print(json.dumps(prepare(args.corpus_root,args.new_private_directory)))
