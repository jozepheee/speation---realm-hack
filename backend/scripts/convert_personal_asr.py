"""Convert local merged Whisper weights for CPU serving; never activate them."""
import argparse,json
from pathlib import Path

def convert(source,destination):
    from transformers import WhisperTokenizerFast
    from ctranslate2.converters import TransformersConverter
    source=Path(source).resolve();destination=Path(destination).resolve()
    if not source.is_dir() or destination.exists():raise ValueError('Use an existing local model and a new output directory')
    WhisperTokenizerFast.from_pretrained(source,local_files_only=True).backend_tokenizer.save(str(source/'tokenizer.json'))
    class CompatibleConverter(TransformersConverter):
        def load_model(self,model_class,model_name_or_path,**kwargs):
            # Installed CTranslate2 uses the newer dtype keyword; the installed
            # Transformers build expects torch_dtype. No global monkey patch.
            if 'dtype' in kwargs:kwargs['torch_dtype']=kwargs.pop('dtype')
            kwargs.update(local_files_only=True,use_safetensors=True)
            return model_class.from_pretrained(model_name_or_path,**kwargs)
    CompatibleConverter(str(source),copy_files=['tokenizer.json','preprocessor_config.json']).convert(str(destination),quantization='int8')
    return {'converted':True,'quantization':'int8','activated':False}

if __name__=='__main__':
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('local_merged_model');parser.add_argument('new_output');args=parser.parse_args();print(json.dumps(convert(args.local_merged_model,args.new_output)))
