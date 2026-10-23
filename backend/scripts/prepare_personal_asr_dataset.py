"""Prepare a PRIVATE English export for the Project Euphonia audiofolder workflow.

No download, training, cloud transfer or model activation occurs here. Grouping
identical phrases together prevents those phrases leaking across evaluation sets.
"""
import argparse,csv,hashlib,io,json,re,zipfile
from pathlib import Path,PurePosixPath


def prepare(source,destination):
    destination=Path(destination)
    if destination.exists():raise ValueError('Choose a new private output directory')
    groups={};audio_seen=set();total=0
    with zipfile.ZipFile(source) as archive:
        if archive.getinfo('manifest.jsonl').file_size>256*1024:raise ValueError('Manifest is too large')
        rows=[json.loads(line) for line in archive.read('manifest.jsonl').splitlines() if line.strip()]
        if not 1<=len(rows)<=1000:raise ValueError('Invalid number of examples')
        for row in rows:
            name=PurePosixPath(row['audio'])
            if name.is_absolute() or '..' in name.parts or not re.fullmatch(r'audio/[a-zA-Z0-9_-]+\.wav',str(name)):raise ValueError('Unsafe audio path')
            text=row['text'].strip()
            if row['language']!='en' or not text or len(text)>1000:raise ValueError('Invalid English label')
            info=archive.getinfo(str(name));total+=info.file_size
            if info.file_size>2*1024*1024 or total>25*1024*1024:raise ValueError('Audio size limit exceeded')
            data=archive.read(str(name))
            if not data.startswith(b'RIFF') or data[8:12]!=b'WAVE':raise ValueError('Expected WAV audio')
            digest=hashlib.sha256(data).hexdigest()
            if digest in audio_seen:continue
            audio_seen.add(digest)
            group=' '.join(re.findall(r"[a-z0-9']+",text.casefold()))
            groups.setdefault(group,[]).append((digest+'.wav',text,data))
    if len(groups)<10:raise ValueError('Collect at least ten different confirmed phrases before preparing held-out sets')
    ordered=sorted(groups,key=lambda value:hashlib.sha256(value.encode()).hexdigest())
    held=max(1,len(ordered)//10);counts={}
    # All validation happens before writing any private files.
    destination.mkdir(parents=True)
    for split,keys in [('test',ordered[:held]),('dev',ordered[held:held*2]),('train',ordered[held*2:])]:
        folder=destination/split;folder.mkdir();count=0;indexed=[]
        with (folder/'metadata.csv').open('w',encoding='utf-8',newline='') as output:
            writer=csv.writer(output);writer.writerow(['file_name','transcription'])
            for key in keys:
                for name,text,data in groups[key]:
                    (folder/name).write_bytes(data);writer.writerow([name,text]);count+=1
                    indexed.append({'id':Path(name).stem,'audio':str((folder/name).resolve()),'text':text,'sha256':Path(name).stem,'speaker_id':'owner-confirmed-speaker','language':'en'})
        (destination/f'{split}.jsonl').write_text('\n'.join(json.dumps(row) for row in indexed)+'\n',encoding='utf-8')
        counts[split]=count
    (destination/'dataset_info.json').write_text(json.dumps({'language':'en','split_policy':'identical_normalized_phrase_grouped','counts':counts,'model_trained':False,'labels':'owner-confirmed meaning, not phoneme ground truth'},indent=2),encoding='utf-8')
    return counts


if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('private_export');parser.add_argument('new_private_directory');args=parser.parse_args()
    print(json.dumps(prepare(args.private_export,args.new_private_directory)))
