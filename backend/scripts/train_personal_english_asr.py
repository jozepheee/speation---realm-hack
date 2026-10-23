"""Local encoder-LoRA Whisper training and frozen held-out recognition evaluation.

Inspired by Project Euphonia's paired-data workflow and VoiceBridge's encoder
adaptation. Never uploads recordings or automatically activates trained weights.
"""
import argparse,json,math,random,time
from pathlib import Path

def train(dataset,output,base='openai/whisper-tiny.en',epochs=5,seed=20261022):
    import numpy as np,torch
    from transformers import WhisperProcessor,WhisperForConditionalGeneration
    from peft import LoraConfig,get_peft_model
    from fluency.audio import decode_audio
    from learners.asr_evaluation import report
    dataset=Path(dataset);output=Path(output)
    if output.exists():raise ValueError('Training output must be a new directory')
    rows={split:[json.loads(line) for line in (dataset/f'{split}.jsonl').read_text(encoding='utf-8').splitlines() if line] for split in ['train','dev','test']}
    if len(rows['train'])<10 or min(len(rows['dev']),len(rows['test']))<5:raise ValueError('Insufficient independent train/dev/test examples')
    identities=[{row['sha256'] for row in rows[split]} for split in rows]
    if any(identities[i]&identities[j] for i in range(3) for j in range(i+1,3)):raise ValueError('Audio leakage across dataset splits')
    random.seed(seed);np.random.seed(seed);torch.manual_seed(seed);torch.set_num_threads(4)
    output.mkdir(parents=True)
    def save(name,value):(output/name).write_text(json.dumps(value,indent=2),encoding='utf-8')
    metadata=json.loads((dataset/'dataset_info.json').read_text())
    save('run.json',{'state':'loading_base','base':base,'seed':seed,'dataset':metadata,'activation':'disabled_until_evaluated'})
    processor=WhisperProcessor.from_pretrained(base)
    model=WhisperForConditionalGeneration.from_pretrained(base,attn_implementation='sdpa',use_safetensors=True)
    model.config.use_cache=False
    # Encoder-only adaptation keeps language/meaning generation frozen.
    model=get_peft_model(model,LoraConfig(r=8,lora_alpha=16,lora_dropout=.05,target_modules=r'model.encoder.layers.\d+.self_attn.(q_proj|v_proj)',bias='none'))
    print(json.dumps({'stage':'base_loaded','trainable_parameters':sum(p.numel() for p in model.parameters() if p.requires_grad)}),flush=True)
    features={}
    for split,items in rows.items():
        for row in items:
            audio=decode_audio(Path(row['audio']).read_bytes())
            encoded=processor.feature_extractor(audio,sampling_rate=16000,return_tensors='pt',return_attention_mask=True)
            feature=encoded.input_features
            labels=processor.tokenizer(row['text'],return_tensors='pt').input_ids
            if labels[0,0]==model.config.decoder_start_token_id:labels=labels[:,1:]
            features[row['id']]=(feature,labels,encoded.attention_mask)
    def evaluate(split):
        model.eval();pairs=[];started=time.perf_counter()
        with torch.inference_mode():
            for row in rows[split]:
                value=model.generate(input_features=features[row['id']][0],attention_mask=features[row['id']][2],max_new_tokens=120,num_beams=1,do_sample=False,use_cache=True)
                hypothesis=processor.batch_decode(value,skip_special_tokens=True)[0]
                pairs.append((row['text'],hypothesis))
        return {**report(pairs),'elapsed_seconds':round(time.perf_counter()-started,2)}
    baseline_dev=evaluate('dev');baseline_test=evaluate('test')
    save('baseline.json',{'dev':baseline_dev,'test':baseline_test});print(json.dumps({'stage':'baseline','dev':baseline_dev,'test':baseline_test}),flush=True)
    optimizer=torch.optim.AdamW([p for p in model.parameters() if p.requires_grad],lr=1e-3)
    best=math.inf;history=[]
    for epoch in range(epochs):
        model.train();order=list(rows['train']);random.shuffle(order);losses=[];started=time.perf_counter()
        for index,row in enumerate(order):
            feature,labels,mask=features[row['id']];optimizer.zero_grad(set_to_none=True)
            loss=model(input_features=feature,labels=labels).loss
            if not torch.isfinite(loss):raise ValueError('Non-finite training loss')
            loss.backward();torch.nn.utils.clip_grad_norm_([p for p in model.parameters() if p.requires_grad],1.0);optimizer.step();losses.append(float(loss.detach()))
            if index%10==0:print(json.dumps({'stage':'training','epoch':epoch+1,'step':index+1,'total_steps':len(order),'loss':round(losses[-1],4)}),flush=True)
        dev=evaluate('dev');entry={'epoch':epoch+1,'loss':sum(losses)/len(losses),'dev':dev,'seconds':round(time.perf_counter()-started,2)};history.append(entry);save('history.json',history)
        if dev['wer']<best:
            best=dev['wer'];model.save_pretrained(output/'best_adapter',safe_serialization=True);processor.save_pretrained(output/'best_adapter')
        print(json.dumps({'stage':'epoch_complete',**entry}),flush=True)
    from peft import PeftModel
    del model
    model=PeftModel.from_pretrained(WhisperForConditionalGeneration.from_pretrained(base,attn_implementation='sdpa',use_safetensors=True),output/'best_adapter')
    tuned=evaluate('test')
    improved=tuned['wer']<baseline_test['wer']
    final={'state':'trained_and_evaluated','base':base,'dataset':metadata,'seed':seed,'epochs':epochs,'selected_on':'dev_wer_only','baseline_test':baseline_test,'adapted_test':tuned,'relative_wer_reduction':(baseline_test['wer']-tuned['wer'])/baseline_test['wer'] if baseline_test['wer'] else None,'pilot_improved':improved,'production_activation_eligible':False,'activated':False,'population_limit':'same adult speaker; not cross-speaker, child or spontaneous-conversation validation','recognition_not_pronunciation':True}
    save('evaluation.json',final)
    merged=model.merge_and_unload();merged.save_pretrained(output/'merged',safe_serialization=True);processor.save_pretrained(output/'merged')
    save('run.json',final);print(json.dumps({'stage':'complete',**final}),flush=True)
    return final

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('dataset');parser.add_argument('new_output');parser.add_argument('--base',default='openai/whisper-tiny.en');parser.add_argument('--epochs',type=int,default=5);args=parser.parse_args()
    if not 1<=args.epochs<=30:parser.error('Use 1–30 epochs')
    train(args.dataset,args.new_output,args.base,args.epochs)
