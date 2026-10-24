"""Versioned authored teaching plans. Never infer a sound from word spelling."""
import hashlib,json,unicodedata

VERSION=1
SOURCES=[
 'https://www.asha.org/practice-portal/clinical-topics/articulation-and-phonology/',
 'https://www.nsw.gov.au/sites/default/files/2023-01/Back-sounds-sounds-made-at-the-back-of-your-mouth-k-g-ng.pdf',
 'https://phoible.org/inventories/view/1762',
]
# A schematic teaching model, not a reconstruction or a unique articulatory solution.
# (movement, English cue, Malayalam cue, illustration label)
CATALOG={
 'k':('back','Watch the back of the tongue rise, then release gently.','നാവിന്റെ പിൻഭാഗം ഉയർന്ന് താഴുന്നത് കാണൂ. ഇനി വാക്ക് കേൾക്കാം.','Back of tongue rises and releases'),
 'ɡ':('back','Watch the back of the tongue rise. Add your voice as it releases.','നാവിന്റെ പിൻഭാഗം ഉയരുന്നത് കാണൂ. ശബ്ദത്തോടെ വാക്ക് പറയാം.','Voiced release at the back'),
 'ŋ':('back_hold','Watch the back of the tongue stay up as you hum through your nose.','നാവിന്റെ പിൻഭാഗം ഉയർന്ന് നിൽക്കുന്നത് കാണൂ. മൂക്കിലൂടെ ശബ്ദം വിടാം.','Back contact with nasal airflow'),
 'p':('closure','Watch the lips meet, then open with a small puff.','ചുണ്ടുകൾ ചേർന്ന് തുറക്കുന്നത് കാണൂ. പതുക്കെ ശ്രമിക്കാം.','Lips meet and release'),
 'b':('closure','Watch the lips meet, then open with your voice.','ചുണ്ടുകൾ ചേർത്ത ശേഷം ശബ്ദത്തോടെ തുറക്കാം.','Voiced lip closure and release'),
 'm':('closure_hold','Keep the lips together and hum gently.','ചുണ്ടുകൾ ചേർത്തുവെച്ച് പതുക്കെ മൂളാം.','Lips stay together for a hum'),
 'f':('teeth','Watch the top teeth touch the bottom lip gently. Let air flow.','മുകളിലെ പല്ലുകൾ താഴത്തെ ചുണ്ടിൽ മെല്ലെ തൊടുന്നത് കാണൂ. വായു വിടാം.','Upper teeth and lower lip'),
 'v':('teeth','Watch the top teeth touch the bottom lip gently. Add your voice.','മുകളിലെ പല്ലുകൾ താഴത്തെ ചുണ്ടിൽ മെല്ലെ തൊട്ട് ശബ്ദം പറയാം.','Voiced lower-lip contact'),
 'ʋ':('approach','Watch the bottom lip move close to the top teeth. Listen to the word.','താഴത്തെ ചുണ്ട് മുകളിലെ പല്ലുകൾക്ക് അടുത്തുവരുന്നത് കാണൂ. വാക്ക് കേൾക്കാം.','Lower lip approaches upper teeth'),
 'w':('round','Watch the lips round, then open into the word.','ചുണ്ടുകൾ വട്ടമാക്കി പിന്നെ തുറക്കുന്നത് കാണൂ.','Rounded lips open into the word'),
 'u':('round','Watch the lips make a small, comfortable round shape.','ചുണ്ടുകൾ ചെറുതായി വട്ടമാക്കുന്നത് കാണൂ.','Comfortably rounded lips'),
 'uː':('round','Watch the lips make a small, comfortable round shape.','ചുണ്ടുകൾ ചെറുതായി വട്ടമാക്കുന്നത് കാണൂ.','Comfortably rounded lips'),
 'i':('spread','Watch the lips spread gently. Listen and copy.','ചുണ്ടുകൾ ചെറുതായി വിടരുന്നത് കാണൂ. കേട്ട് പറയാം.','Gently spread lips'),
 'iː':('spread','Watch the lips spread gently. Listen and copy.','ചുണ്ടുകൾ ചെറുതായി വിടരുന്നത് കാണൂ. കേട്ട് പറയാം.','Gently spread lips'),
 'ɪ':('spread_short','Keep the mouth relaxed. Listen to the short vowel in the word.','വായ അയച്ചുവെക്കൂ. വാക്കിലെ ചെറിയ സ്വരം കേൾക്കാം.','Relaxed opening for a short vowel'),
 'eɪ':('glide_spread','Watch the mouth move from a small opening to gently spread lips.','വായ ചെറുതായി തുറന്ന ശേഷം ചുണ്ടുകൾ വിടരുന്നത് കാണൂ.','Vowel movement towards spread lips'),
 'aɪ':('glide_spread','Watch the mouth start open, then move towards gently spread lips.','വായ തുറന്ന് പിന്നെ ചുണ്ടുകൾ ചെറുതായി വിടരുന്നത് കാണൂ.','Open-to-spread vowel movement'),
 'aʊ':('glide_round','Watch the mouth start open, then the lips become round.','വായ തുറന്ന ശേഷം ചുണ്ടുകൾ വട്ടമാകുന്നത് കാണൂ.','Open-to-round vowel movement'),
 'oʊ':('glide_round','Watch the lips become rounder as the vowel moves.','സ്വരം പറയുമ്പോൾ ചുണ്ടുകൾ കൂടുതൽ വട്ടമാകുന്നത് കാണൂ.','Rounding vowel movement'),
 'ʌ':('open','Let the lips relax and the mouth open comfortably. Listen to the word.','ചുണ്ടുകൾ അയച്ച് വായ സുഖമായി തുറക്കൂ. വാക്ക് കേൾക്കാം.','Relaxed, unrounded opening'),
 'ə':('open','Let the mouth relax. Listen to the short vowel in the word.','വായ അയച്ചുവെച്ച് വാക്കിലെ സ്വരം കേൾക്കാം.','Relaxed central vowel'),
 'æ':('open_wide','Watch the mouth open comfortably. Keep the lips relaxed.','ചുണ്ടുകൾ അയച്ച് വായ സുഖമായി തുറക്കുന്നത് കാണൂ.','Comfortable open vowel'),
 'ɛ':('open','Watch the mouth open comfortably, then listen to the word.','വായ സുഖമായി തുറക്കുന്നത് കാണൂ. ഇനി വാക്ക് കേൾക്കാം.','Comfortable vowel opening'),
 'ɑ':('open_wide','Watch the mouth open comfortably. Listen and copy.','വായ സുഖമായി തുറക്കുന്നത് കാണൂ. കേട്ട് പറയാം.','Open vowel'),
 'ɑː':('open_wide','Watch the mouth open comfortably. Listen and copy.','വായ സുഖമായി തുറക്കുന്നത് കാണൂ. കേട്ട് പറയാം.','Open vowel'),
 'θ':('dental','Watch the tongue come lightly between the teeth. Blow gently.','നാവ് പല്ലുകൾക്കിടയിൽ മെല്ലെ വരുന്നത് കാണൂ. പതുക്കെ വായു വിടാം.','Light tongue-to-teeth contact'),
 'ð':('dental','Watch the tongue come lightly between the teeth. Add your voice.','നാവ് പല്ലുകൾക്കിടയിൽ മെല്ലെ വെച്ച് ശബ്ദം പറയാം.','Voiced tongue-to-teeth contact'),
 't':('front','Watch the tongue touch the ridge behind the top teeth, then release.','നാവ് മുകളിലെ പല്ലുകൾക്കു പിന്നിൽ തൊട്ട് താഴുന്നത് കാണൂ.','Front tongue contact and release'),
 'd':('front','Watch the tongue touch behind the top teeth. Release with your voice.','നാവ് മുകളിലെ പല്ലുകൾക്കു പിന്നിൽ തൊട്ട് ശബ്ദത്തോടെ താഴുന്നത് കാണൂ.','Voiced front tongue release'),
 'n':('front_hold','Watch the tongue touch behind the top teeth as you hum through the nose.','നാവ് മുകളിലെ പല്ലുകൾക്കു പിന്നിൽ വെച്ച് മൂക്കിലൂടെ ശബ്ദം വിടാം.','Front contact with nasal airflow'),
 'l':('front_hold','Watch the tongue touch behind the top teeth. Let the voice flow.','നാവ് മുകളിലെ പല്ലുകൾക്കു പിന്നിൽ വെച്ച് ശബ്ദം പറയാം.','Tongue-tip contact with lateral airflow'),
 's':('air','Bring the teeth close. Let a gentle stream of air flow.','പല്ലുകൾ അടുത്തുവെച്ച് പതുക്കെ വായു വിടാം.','Narrow air stream behind the teeth'),
 'z':('air','Bring the teeth close. Let air flow and add your voice.','പല്ലുകൾ അടുത്തുവെച്ച് വായുവിനൊപ്പം ശബ്ദം പറയാം.','Voiced narrow air stream'),
 'ʃ':('round_air','Watch the lips round a little as a soft stream of air flows.','ചുണ്ടുകൾ ചെറുതായി വട്ടമാക്കി പതുക്കെ വായു വിടാം.','Slight rounding with flowing air'),
 'ɹ':('bunched','Watch this example of the tongue drawing back. Keep it comfortable.','നാവ് അല്പം പിന്നിലേക്ക് വരുന്നതിന്റെ മാതൃക കാണൂ. വാക്ക് കേൾക്കാം.','One illustrative English R tongue shape'),
 'ɻ':('retroflex_gap','Watch the tongue tip curl back without touching the roof. Listen to the word.','നാവിന്റെ അറ്റം അല്പം പിന്നിലേക്ക് വളയുന്നത് കാണൂ. മുകളിൽ തൊടാതെ വാക്ക് കേട്ട് പറയാം.','Curled tongue tip with a gap'),
 'ɭ':('retroflex_contact','Watch the tongue tip curl back and touch lightly. Listen to the word.','നാവിന്റെ അറ്റം അല്പം പിന്നിലേക്ക് വളച്ച് മെല്ലെ തൊടുന്നത് കാണൂ. വാക്ക് കേൾക്കാം.','Curled tongue tip with light contact'),
}
MALAYALAM={'ഴ':'ɻ','ള':'ɭ','വ':'ʋ','ക':'k','ഗ':'ɡ','ങ':'ŋ','പ':'p','ബ':'b','മ':'m','ഫ':'f','സ':'s','ശ':'ʃ','ല':'l'}

def normalize_sound(value,language):
 value=unicodedata.normalize('NFC',str(value or '')).strip().strip('/[]')
 if language=='ml':return MALAYALAM.get(value,value)
 if language=='en':return {'g':'ɡ','r':'ɹ','ei':'eɪ','ey':'eɪ'}.get(value,value)
 return ''

def lesson(word,language,target):
 ml=language=='ml';target=target or {};raw=target.get('sound') or target.get('expected_phone') or ''
 if not raw and ml:
  diff=next((d for d in target.get('character_differences',[]) if d.get('word')==word),{})
  raw=diff.get('expected_character','')
 sound=normalize_sound(raw,language);entry=CATALOG.get(sound)
 key=hashlib.sha256(json.dumps([VERSION,language,word,sound],ensure_ascii=False).encode()).hexdigest()[:24]
 base={'version':VERSION,'cache_key':key,'word':word,'language':language,'sound':sound,'supported':bool(entry),
  'source':'authored_articulation_catalog','illustrative':True,'exact_phoneme_lip_sync':False,'pronunciation_grade':False,
  'evidence_basis':'acoustic_character_hypothesis' if language=='ml' and target.get('source')!='assigned_clinician_goal' else target.get('source','saved_target'),
  'sources':SOURCES}
 intro='കാണാം, കേൾക്കാം, പിന്നെ പറയാം.' if ml else 'Watch, listen, then your turn.'
 stages=[{'id':'ready','label':'തയ്യാറാകാം' if ml else 'Get ready','speech':intro,'kind':'cue','seconds':2}]
 if entry:
  motion,en,mal,caption=entry;base.update(movement=motion,caption=caption,cue=mal if ml else en)
  stages.append({'id':'movement','label':'ചലനം കാണാം' if ml else 'Watch the movement','speech':base['cue'],'kind':'movement','seconds':4})
 else:base.update(movement=None,caption=None,cue='ഈ ശബ്ദത്തിന് ചലന മാതൃക ഇതുവരെ ലഭ്യമല്ല. വാക്ക് കേട്ട് പരിശീലിക്കാം.' if ml else 'A movement lesson is not available for this sound yet. Listen to the complete word instead.')
 stages.extend([{'id':'natural','label':'വാക്ക് കേൾക്കാം' if ml else 'Listen to the word','speech':word,'kind':'word','slow':False,'seconds':3},
  {'id':'slow','label':'പതുക്കെ കേൾക്കാം' if ml else 'Listen slowly','speech':word,'kind':'word','slow':True,'seconds':4},
  {'id':'your_turn','label':'ഇനി നിങ്ങളുടെ ഊഴം' if ml else 'Your turn','speech':'ഇനി നിങ്ങൾ പറയൂ.' if ml else 'Now you try.','kind':'cue','seconds':2}])
 base['stages']=stages
 return base
