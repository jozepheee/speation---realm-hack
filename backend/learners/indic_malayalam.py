"""Target-independent IndicWav2Vec character evidence, not IPA or a phone score."""
import hashlib,json,time,unicodedata,re
from functools import lru_cache
from pathlib import Path
from threading import Lock

_lock=Lock()
CHAR_PHONES={'ഴ':'ɻ','ല':'l','ള':'ɭ','മ':'m','പ':'p','ഫ':'f','സ':'s','ശ':'ʃ',
    'ക':'k','ഗ':'ɡ','വ':'ʋ','ബ':'b','ത':'t̪','ട':'ʈ','ദ':'d̪','ഡ':'ɖ','ന':'n','ണ':'ɳ','ര':'ɾ','റ':'r',
    'ാ':'aː','ി':'i','ീ':'iː','ു':'u','ൂ':'uː'}

@lru_cache(maxsize=1)
def load(directory):
    import torch
    from transformers import Wav2Vec2ForCTC
    root=Path(directory).resolve();manifest=json.loads((root/'speation-model.json').read_text(encoding='utf8'))
    if manifest.get('checkpoint_sha256')!='6659d58c848ff69a4e58084b47250fe23d9f0996dadb3b463ce42de912e7785a' or manifest.get('blank_id')!=0:
        raise ValueError('Unverified IndicWav2Vec Malayalam checkpoint')
    for filename in ['config.json','model.safetensors','symbols.json']:
        with (root/filename).open('rb') as source:
            if hashlib.file_digest(source,'sha256').hexdigest()!=manifest['sha256'][filename]:raise ValueError('IndicWav2Vec artifact changed')
    model=Wav2Vec2ForCTC.from_pretrained(root,local_files_only=True,use_safetensors=True).eval()
    symbols=json.loads((root/'symbols.json').read_text(encoding='utf8'))
    if len(symbols)!=model.config.vocab_size or symbols[0]!='<s>':raise ValueError('IndicWav2Vec dictionary mismatch')
    torch.set_num_threads(4)
    return model,symbols,manifest

def observe(clip,directory):
    import torch
    from fluency.audio import decode_audio
    audio=decode_audio(clip)
    if len(audio)>20*16000:raise ValueError('Use a twenty-second assessment window')
    if not _lock.acquire(blocking=False):raise RuntimeError('Malayalam acoustic assessment is busy')
    started=time.monotonic()
    try:
        model,symbols,manifest=load(directory);tensor=torch.from_numpy(audio)
        if manifest['normalize']:tensor=torch.nn.functional.layer_norm(tensor,tensor.shape)
        with torch.inference_mode():logits=model(tensor.unsqueeze(0)).logits[0]
        probabilities=logits.softmax(-1);indices=logits.argmax(-1).tolist();emissions=[];last=None
        step=model.config.inputs_to_logits_ratio/16000
        for index,token in enumerate(indices):
            if token!=last and token>=4:
                top=probabilities[index].topk(5)
                emissions.append({'symbol':symbols[token],'start_seconds':round(index*step,3),
                    'end_seconds':min(len(audio)/16000,round((index+1)*step,3)),
                    'peak_posterior':round(float(probabilities[index,token]),5),
                    'alternatives':[{'symbol':symbols[i],'posterior':round(float(p),5)} for p,i in zip(top.values.tolist(),top.indices.tolist())]})
            elif token==last and token>=4 and emissions:
                emissions[-1]['peak_posterior']=max(emissions[-1]['peak_posterior'],round(float(probabilities[index,token]),5))
                emissions[-1]['end_seconds']=min(len(audio)/16000,round((index+1)*step,3))
            last=token
    finally:_lock.release()
    return {'source':'AI4Bharat/IndicWav2Vec-Malayalam-Kathbath','checkpoint_sha256':manifest['checkpoint_sha256'],
        'state':'acoustic_character_evidence','text':''.join(item['symbol'] for item in emissions).replace('|',' ').strip(),
        'emissions':emissions,'output_kind':'Malayalam_ASR_characters_not_IPA','reference_text_supplied':False,
        'pronunciation_score':None,'latency_seconds':round(time.monotonic()-started,3)}

def differences(context,evidence):
    """Align acoustic characters to known task text; never manufacture a heard IPA phone."""
    target=unicodedata.normalize('NFC',context.get('expected_text',''))
    expected=[(c,word) for word in re.findall(r'[\u0d00-\u0d7f]+',target) for c in word]
    actual=[item for item in evidence.get('emissions',[]) if item['symbol']!='|' and item.get('peak_posterior',0)>=.35]
    if not expected or not actual or len(expected)>300 or len(actual)>600:return []
    matrix=[[0]*(len(actual)+1) for _ in range(len(expected)+1)]
    for i in range(len(expected)+1):matrix[i][0]=i*10
    for j in range(len(actual)+1):matrix[0][j]=j*10
    vowels=set('അആഇഈഉഊഋഌഎഏഐഒഓഔാിീുൂൃെേൈൊോൗൌ')
    def substitution(left,right):
        if left==right:return 0
        # Do not align a consonant to an inserted vowel sign just because
        # edit-distance ties happen to favour the final character in a word.
        return 10 if (left in vowels)==(right in vowels) else 20
    independent={'ാ':'ആ','ി':'ഇ','ീ':'ഈ','ു':'ഉ','ൂ':'ഊ','െ':'എ','േ':'ഏ','ൈ':'ഐ','ൊ':'ഒ','ോ':'ഓ','ൗ':'ഔ'}
    def deletion(index,count):
        # A joined spelling can have a y-glide before a vowel that the decoder
        # writes as a separate vowel: മഴയായിരുന്നു versus മസ ആയിരുന്നു.
        # Resolve the edit tie without shifting the sound difference onto യ.
        if expected[index][0]=='യ' and index+1<len(expected) and count<len(actual):
            vowel=independent.get(expected[index+1][0])
            if vowel and actual[count]['symbol']==vowel:return 5
        return 10
    for i,(char,_) in enumerate(expected,1):
        for j,item in enumerate(actual,1):matrix[i][j]=min(matrix[i-1][j]+deletion(i-1,j),matrix[i][j-1]+10,matrix[i-1][j-1]+substitution(char,item['symbol']))
    # Substantial unrelated speech does not establish which intended word was attempted.
    if matrix[-1][-1]>max(3,len(expected)*.6)*10:return []
    i,j=len(expected),len(actual);changes=[]
    while i or j:
        if i and j and matrix[i][j]==matrix[i-1][j-1]+substitution(expected[i-1][0],actual[j-1]['symbol']):
            char,word=expected[i-1];item=actual[j-1]
            if char!=item['symbol'] and char in CHAR_PHONES and item['symbol'] in CHAR_PHONES:
                target_p=max((x['posterior'] for x in item.get('alternatives',[]) if x['symbol']==char),default=0)
                if item['peak_posterior']>=.45 and item['peak_posterior']-target_p>=.2:
                    changes.append({'word':word,'expected_character':char,'observed_character':item['symbol'],
                        'expected_phone':CHAR_PHONES[char],'start_seconds':item['start_seconds'],'end_seconds':item['end_seconds']})
            i-=1;j-=1
        elif i and matrix[i][j]==matrix[i-1][j]+deletion(i-1,j):i-=1
        else:j-=1
    return list(reversed(changes))[:3]

def coaching(context,evidence):
    changes=differences(context,evidence);concerns=[]
    for item in changes:
        word=item['word'];wanted=item['expected_character'];heard=item['observed_character']
        concerns.append({'word':word,'expected_phone':item['expected_phone'],'produced_phone':None,'category':'distortion',
            'observation':f'“{word}” എന്ന വാക്കിലെ {wanted} പരിശോധിക്കാം. ശബ്ദ മോഡൽ {heard} പോലുള്ള അക്ഷരമാണ് നിർദ്ദേശിച്ചത്.',
            'uncertainty':'IndicWav2Vec acoustic character hypothesis, not a verified produced phoneme. Confirm by replaying the audio.',
            'practice_tip':f'കേൾക്കൂ: {word}. നമുക്ക് ഒരുമിച്ച് പതുക്കെ പറയാം: {word}.',
            'start_seconds':item['start_seconds'],'end_seconds':item['end_seconds']})
    return {'state':'tentative_observation' if concerns else 'insufficient_evidence',
        'summary':concerns[0]['observation'] if concerns else 'വാക്ക് കേൾക്കാം. എല്ലാ ശബ്ദങ്ങളും ശരിയാണെന്ന് ഈ പരിശോധനയിൽ ഉറപ്പിക്കാനായില്ല. മാതൃക കേട്ട് വീണ്ടും ശ്രമിക്കാം.',
        'concerns':concerns},changes
