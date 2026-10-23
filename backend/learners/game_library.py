"""Built-in educational play content; no clinician approval or speech score implied."""
import uuid
from types import SimpleNamespace
WORDS={'en':{'water':'water','apple':'apple','home':'home','car':'car','tree':'tree','sun':'sun','cat':'cat','ball':'ball'},
'hi':{'water':'पानी','apple':'सेब','home':'घर','car':'कार','tree':'पेड़','sun':'सूरज','cat':'बिल्ली','ball':'गेंद'},
'ml':{'water':'വെള്ളം','apple':'ആപ്പിൾ','home':'വീട്','car':'കാർ','tree':'മരം','sun':'സൂര്യൻ','cat':'പൂച്ച','ball':'പന്ത്'}}
PARTS={'en':[['rain','bow'],['wa','ter'],['sun','shine']],
'hi':[['पा','नी'],['कि','ताब'],['बा','दल']],
'ml':[['മ','രം'],['മ','ഴ'],['മാ','ല']]}
LONG_PARTS={'en':{'growing':[['but','ter','fly'],['el','e','phant'],['to','ma','to']],
 'challenge':[['com','mu','ni','ca','tion'],['im','ag','i','na','tion'],['cel','e','bra','tion']]},
 'hi':{'growing':[['क','हा','नी'],['ति','त','ली'],['खि','लौ','ना']],
 'challenge':[['जि','म्मे','दा','री'],['पु','स्त','का','लय'],['स','मा','चा','र']]},
 'ml':{'growing':[['പൂ','മ്പാ','റ്റ'],['വി','ദ്യാ','ല','യം'],['മ','ല','യാ','ളം']],
 'challenge':[['ആ','ശ','യ','വി','നി','മ','യം'],['പ','രി','സ്ഥി','തി'],['അ','നു','ഭ','വ','ങ്ങൾ']]}}
PHRASES={'en':{'growing':['a red ball','a tall tree','a yellow sun','a small cat','cold water','a green apple'],
 'challenge':['The butterfly is near the tree','I would like a glass of water','The little cat is sleeping at home','We can play with the red ball','The sun is shining over the trees']},
 'hi':{'growing':['लाल गेंद','ऊँचा पेड़','ठंडा पानी','छोटी बिल्ली','हरा सेब','पीला सूरज'],
 'challenge':['मुझे एक गिलास पानी चाहिए','छोटी बिल्ली घर में सो रही है','हम लाल गेंद से खेल सकते हैं','पेड़ के पास एक तितली है','आज सूरज चमक रहा है']},
 'ml':{'growing':['ചുവന്ന പന്ത്','വലിയ മരം','തണുത്ത വെള്ളം','ചെറിയ പൂച്ച','പച്ച ആപ്പിൾ','മഞ്ഞ പൂവ്'],
 'challenge':['എനിക്ക് ഒരു ഗ്ലാസ് വെള്ളം വേണം','ചെറിയ പൂച്ച വീട്ടിൽ ഉറങ്ങുന്നു','മരത്തിനടുത്ത് ഒരു പൂമ്പാറ്റയുണ്ട്','നമുക്ക് ചുവന്ന പന്ത് കൊണ്ട് കളിക്കാം','ഇന്ന് നല്ല വെയിലാണ്']}}
INSTRUCTIONS={'en':'Listen to the word, then say it aloud to build the bridge. Say skip to move on.',
'hi':'शब्द सुनें, फिर बोलकर पुल बनाएं। आगे बढ़ने के लिए अगला कहें।',
'ml':'വാക്ക് കേട്ടിട്ട് പറഞ്ഞ് പാലം നിർമ്മിക്കൂ. തുടരാൻ അടുത്തത് എന്ന് പറയാം.'}

def activities(language,kind,difficulty):
 parts=PARTS[language] if difficulty=='starter' else LONG_PARTS[language][difficulty]
 items=list(WORDS[language].items()) if kind=='picture' else list(enumerate(parts)) if kind=='syllable' else list(enumerate([[.8,.8],[.7,.7,1.1],[1,.6,.6,1]]))
 result=[]
 for key,value in items:
  content={'difficulty':difficulty,'units':'word_parts'}
  if kind=='picture':word=value;content['picture']=key
  elif kind=='syllable':word=''.join(value);content['syllables']=value
  else:
   word={'en':'Listen and tap','hi':'सुनें और ताल दें','ml':'കേട്ട് താളം കൊടുക്കൂ'}[language]
   speed={'starter':1.25,'growing':1,'challenge':.8}[difficulty];content['beat_intervals']=[round(v*speed,2) for v in value]
  result.append(SimpleNamespace(id=uuid.uuid5(uuid.NAMESPACE_URL,f'speation:play:v1:{language}:{kind}:{difficulty}:{key}'),word=word,content=content,goal_id=None,source='built_in_learning_activity',instruction=INSTRUCTIONS[language]))
 return result
