"""Fetch the authors' small public L2-ARCTIC example, never learner audio.

CC BY-NC 4.0, research evaluation only. This is an importer smoke sample,
not a held-out accuracy benchmark and not dysarthric/child validation.
"""
import argparse, hashlib, json, re, urllib.request, wave
from pathlib import Path

BASE='https://psi.engr.tamu.edu/wp-content/uploads/2018/03/'
SOURCE='https://psi.engr.tamu.edu/l2-arctic-corpus/'

def intervals(text, tier):
    sections=re.split(r'\n\s*item \[\d+\]:',text)
    section=next((part for part in sections if f'name = "{tier}"' in part),'')
    return [{'start':float(start),'end':float(end),'label':label.replace('""','"')}
        for start,end,label in re.findall(r'intervals \[\d+\]:\s*xmin = ([\d.]+)\s*xmax = ([\d.]+)\s*text = "((?:""|[^"])*)"',section)]

def fetch(name, output):
    request=urllib.request.Request(BASE+name,headers={'User-Agent':'Speation-research-evaluation/1.0'})
    with urllib.request.urlopen(request,timeout=30) as response:
        data=response.read(5*1024*1024+1)
    if len(data)>5*1024*1024:raise ValueError('Public sample exceeded 5 MB limit')
    output.write_bytes(data)
    return hashlib.sha256(data).hexdigest()

def main():
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output',type=Path,required=True)
    args=parser.parse_args();args.output.mkdir(parents=True,exist_ok=True)
    hashes={suffix:fetch('lxc_arctic_a0018.'+suffix,args.output/('lxc_arctic_a0018.'+suffix)) for suffix in ['wav','txt']}
    annotation=(args.output/'lxc_arctic_a0018.txt').read_text(encoding='utf-8-sig')
    words=intervals(annotation,'words');phones=intervals(annotation,'phones')
    if not words or not phones:raise ValueError('Author annotation format not recognised')
    differences=[]
    for phone in phones:
        parts=phone['label'].split(',')
        if len(parts)==3 and parts[-1] in ['s','a','d']:
            word=next((word['label'] for word in words if word['start']<=phone['start'] and word['end']>=phone['end']-1e-6),'')
            differences.append({**phone,'expected_phone':parts[0],'observed_phone':parts[1],'operation':parts[2],'word':word})
    with wave.open(str(args.output/'lxc_arctic_a0018.wav')) as audio:
        audio_info={'sample_rate':audio.getframerate(),'channels':audio.getnchannels(),'duration_seconds':audio.getnframes()/audio.getframerate()}
    manifest={'dataset':'L2-ARCTIC author demonstration','id':'LXC_arctic_a0018','speaker':'LXC','language':'en',
        'population':'adult non-native English; Mandarin L1','source':SOURCE,'license':'CC BY-NC 4.0',
        'citation':'Zhao et al. (2018), L2-ARCTIC: A Non-native English Speech Corpus, Interspeech, doi:10.21437/Interspeech.2018-1110',
        'audio':str((args.output/'lxc_arctic_a0018.wav').resolve()),'text':' '.join(word['label'] for word in words if word['label']),
        'words':words,'phones':phones,'manual_sound_differences':differences,'sha256':hashes,'audio_info':audio_info,
        'use':'importer smoke test only; exclude from held-out benchmark','child_validation':False,'dysarthric_validation':False}
    (args.output/'manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False),encoding='utf-8')
    print(json.dumps({'downloaded':True,'manual_sound_differences':len(differences),'audio_info':audio_info,'accuracy_claim':False}))

if __name__=='__main__':main()
