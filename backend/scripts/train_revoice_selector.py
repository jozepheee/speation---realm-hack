"""Calibrate the reused constrained ranker on local ASR candidates, not new text."""
import argparse,json,time,random,hashlib
from pathlib import Path
import numpy as np
from learners.revoice.nbest import build_hybrid_list
from learners.revoice.selector import extract_features,EXPECTED_FEATURES
from learners.asr_evaluation import errors

def train(dataset,model_directory,output,epochs=60):
    import torch
    from fluency.asr import transcribe_recording,get_asr_model
    from fluency.audio import decode_audio
    torch.set_num_threads(4);torch.manual_seed(20261022);random.seed(20261022)
    dataset=Path(dataset);output=Path(output)
    if output.exists():raise ValueError('Use a new selector output directory')
    output.mkdir(parents=True);rows={}
    model=get_asr_model(str(Path(model_directory).resolve()),True,None)
    for split in ['train','dev','test']:
        cache=output/f'{split}-features.npz';entries=[]
        for index,line in enumerate((dataset/f'{split}.jsonl').read_text(encoding='utf-8').splitlines()):
            row=json.loads(line);audio=decode_audio(Path(row['audio']).read_bytes())
            text,words=transcribe_recording(audio,'en',model_name=str(Path(model_directory).resolve()),local_only=True)
            candidates=build_hybrid_list(model,audio,text)
            if not candidates:continue
            scores=[errors(row['text'],item.display)['errors'] for item in candidates]
            label=min(range(len(scores)),key=lambda i:(scores[i],i))
            confidence=np.mean([word['model_probability'] for word in words if word.get('model_probability') is not None]) if words else None
            entries.append({'features':extract_features(candidates,confidence),'losses':scores,'label':label,'words':errors(row['text'],text)['reference_words']})
            if index%10==0:print(json.dumps({'stage':'selector_features','split':split,'processed':index+1}),flush=True)
        rows[split]=entries
    if min(len(items) for items in rows.values())<5:raise ValueError('Insufficient real candidate groups')
    features=np.concatenate([item['features'] for item in rows['train']]);mu=features.mean(axis=0);sd=features.std(axis=0);sd[sd<1e-6]=1
    network=torch.nn.Sequential(torch.nn.Linear(21,16),torch.nn.Tanh(),torch.nn.Linear(16,1));optimizer=torch.optim.AdamW(network.parameters(),lr=.005)
    def evaluate(split):
        baseline=chosen=helpful=harmful=suggestions=0;total_words=0
        network.eval()
        with torch.no_grad():
            for item in rows[split]:
                tensor=torch.tensor((item['features']-mu)/sd,dtype=torch.float32)
                selected=int(network(tensor).flatten().argmax());base=item['losses'][0];value=item['losses'][selected]
                baseline+=base;chosen+=value;total_words+=item['words'];suggestions+=selected!=0;helpful+=value<base;harmful+=value>base
        return {'utterances':len(rows[split]),'reference_words':total_words,'baseline_wer':baseline/total_words,'selected_candidate_wer':chosen/total_words,'helpful_suggestions':helpful,'harmful_suggestions':harmful,'suggestions':suggestions,'auto_switch':False,'interpretation':'candidate ranking, requires user confirmation; not automatic recognition accuracy'}
    best=float('inf');history=[]
    for epoch in range(epochs):
        network.train();order=list(rows['train']);random.shuffle(order)
        for item in order:
            tensor=torch.tensor((item['features']-mu)/sd,dtype=torch.float32);optimizer.zero_grad(set_to_none=True)
            loss=torch.nn.functional.cross_entropy(network(tensor).flatten()[None],torch.tensor([item['label']]));loss.backward();optimizer.step()
        dev=evaluate('dev');history.append(dev)
        if dev['selected_candidate_wer']<best:
            best=dev['selected_candidate_wer'];torch.save(network.state_dict(),output/'best.pt')
    network.load_state_dict(torch.load(output/'best.pt',weights_only=True));test=evaluate('test');state=network.state_dict()
    artifact={'model_version':'revoice_selector_v1','feature_version':'d3-21f-v1','features':EXPECTED_FEATURES,'scaler_mean':mu.tolist(),'scaler_std':sd.tolist(),'W1':state['0.weight'].tolist(),'b1':state['0.bias'].tolist(),'W2':state['2.weight'][0].tolist(),'b2':float(state['2.bias'][0]),'policy':{'auto_switch_enabled':False,'suggestion_tau':.35},'whisper_model':'local-english-adult-pilot-v1','base_model_sha256':hashlib.sha256((Path(model_directory)/'model.bin').read_bytes()).hexdigest(),'data_scope':'single adult speaker, internal research only'}
    (output/'selector.json').write_text(json.dumps(artifact),encoding='utf-8')
    (output/'evaluation.json').write_text(json.dumps({'test':test,'dev_selection':'minimum dev candidate WER','epochs':epochs,'population':'single adult male','production_ready':False},indent=2),encoding='utf-8');print(json.dumps({'stage':'selector_complete',**test}),flush=True)

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('dataset');parser.add_argument('local_ct2_model');parser.add_argument('new_output');args=parser.parse_args();train(args.dataset,args.local_ct2_model,args.new_output)
