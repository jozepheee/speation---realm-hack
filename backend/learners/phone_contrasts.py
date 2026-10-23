"""Conservative focal-word teaching hypotheses from acoustic phone substitutions.

No transcript matching or scores. Only one known contrast, with all other phones
matching a reference variant, can produce a suggestion. This is not validated MDD.
"""
import unicodedata


def phone_key(phone):
    return unicodedata.normalize('NFC',phone or '').strip().strip('/[]').replace(':','ː').replace('͡','').replace('͜','').replace('g','ɡ')


def contrast_hypothesis(context):
    language=context.get('language')
    rules={
        'en':{('ʌ','uː'),('uː','ʌ'),('ʌ','u'),('ɪ','iː'),('iː','ɪ'),('θ','t'),('θ','ð'),('ð','d'),('ɹ','l'),('l','ɹ'),
            ('ɡ','b'),('k','t'),('s','ʃ'),('ʃ','s'),('f','p'),('p','f'),('ɹ','w')},
        'hi':{('k','kʰ'),('kʰ','k'),('p','pʰ'),('pʰ','p'),('t̪','d̪'),('d̪','t̪'),
              ('t̪','ʈ'),('ʈ','t̪'),('d̪','ɖ'),('ɖ','d̪')},
        'ml':{('ɻ','l'),('ɻ','z'),('ɻ','ʒ'),('ɻ','ɭ'),('ɭ','l'),('l','ɭ'),('aː','a'),('a','aː'),('p','f')}}
    evidence=context.get('independent_phone_observation') or {}
    reference=context.get('pronunciation_reference') or {}
    target=context.get('expected_text','')
    focus=context.get('focus_word') or target
    word=next((item for item in reference.get('words',[]) if item['word'].casefold()==focus.casefold()),None)
    actual=[phone_key(phone) for phone in evidence.get('phones',[])]
    emissions=evidence.get('emissions',[])
    if not word or not 1<=len(actual)<=200 or len(emissions)!=len(actual) or context['duration_seconds']>20:return None
    sentence=word['word'].casefold()!=target.casefold()
    candidates=set()
    for variant in word['variants']:
        expected=[phone_key(phone) for phone in variant]
        if not 3<=len(expected)<=8:continue
        offsets=range(len(actual)-len(expected)+1) if sentence else [0]
        for offset in offsets:
            window=actual[offset:offset+len(expected)]
            if expected==window:return None  # A matching occurrence makes a claimed contrast ambiguous.
            if len(window)!=len(expected) or (not sentence and len(actual)!=len(expected)):continue
            differences=[i for i,(left,right) in enumerate(zip(expected,window)) if left!=right]
            if len(differences)!=1:continue
            index=differences[0];pair=(expected[index],window[index])
            frame=emissions[offset+index]
            def posterior(item):return item.get('peak_posterior',item.get('alternatives',[{}])[0].get('posterior',0))
            if pair not in rules.get(language,set()) or posterior(frame)<.85:continue
            if context.get('target_sound') and phone_key(context['target_sound'])!=pair[0]:continue
            # In a sentence, corroborate the whole focal word, not an arbitrary sound anywhere.
            if sentence and any(posterior(emissions[offset+i])<.65 for i in range(len(expected)) if i!=index):continue
            candidates.add((*pair,offset,len(expected)))
    if len(candidates)!=1:return None
    expected,produced,offset,length=candidates.pop()
    start=emissions[offset]['emission_seconds'] if sentence else 0
    end=min(context['duration_seconds'],emissions[offset+length]['emission_seconds'] if offset+length<len(emissions) else context['duration_seconds'])
    if not 0<=start<end<=context['duration_seconds']:return None
    return {'word':word['word'],'expected_phone':expected,'produced_phone':produced,
        'source':'unvalidated_focal_phone_contrast','category':'substitution',
        'start_seconds':start,'end_seconds':end}


def teaching_text(language,word,expected,produced):
    from learners.sound_teaching import cue
    if language=='ml':
        return f'“{word}” എന്ന വാക്കിൽ /{expected}/ എന്നതിന് പകരം /{produced}/ പോലൊരു ശബ്ദം കേട്ടതായി മോഡൽ സൂചിപ്പിക്കുന്നു.', cue(language,expected,word) or f'“{word}” പതുക്കെ കേട്ടിട്ട് പറഞ്ഞുനോക്കാം.'
    if language=='en':
        cues={'ʌ':'Listen to the short vowel in “cup”. Relax your lips; try “cup” with me.',
            'uː':'Listen to the long vowel in “moon”. Gently round your lips, then try the word.',
            'ɪ':'Use the short, relaxed vowel in “sit”, rather than the long “ee” in “see”.',
            'iː':'Use the longer “ee” sound in “see”, rather than the short vowel in “sit”.',
            'θ':'Rest the tongue tip lightly near the front teeth and let air flow gently; keep the voice quiet.',
            'ð':'Rest the tongue tip lightly near the front teeth and let air flow gently with your voice.',
            'ɹ':'Listen to the initial sound in “red”, then try the sound and the word slowly.',
            'l':'Touch the tongue tip gently behind the upper front teeth, then try the word slowly.'}
        observation=f'An acoustic model suggests /{produced}/ where /{expected}/ is expected in “{word}”.'
        return observation, (cues.get(expected) or cue(language,expected,word) or f'Watch the mouth picture and listen to “{word}” slowly.')+f' Listen, then try “{word}” once more.'
    if language=='hi':
        cues={'k':'क में ख जैसा हवा का तेज़ झोंका न दें। धीरे कहें: क, फिर पूरा शब्द।',
            'kʰ':'ख में क के साथ हल्का हवा का झोंका दें। धीरे कहें: ख, फिर पूरा शब्द।',
            'p':'प में फ जैसा हवा का तेज़ झोंका न दें। धीरे कहें: प, फिर पूरा शब्द।',
            'pʰ':'फ में प के साथ हल्का हवा का झोंका दें। धीरे कहें: फ, फिर पूरा शब्द।',
            't̪':'त के लिए जीभ की नोक ऊपर के दाँतों के पास हल्के से रखें; फिर धीरे पूरा शब्द कहें।',
            'd̪':'द के लिए जीभ की नोक ऊपर के दाँतों के पास हल्के से रखें और आवाज़ जोड़ें।',
            'ʈ':'ट के लिए जीभ की नोक दाँतों से थोड़ा पीछे रखें; ज़ोर लगाए बिना धीरे शब्द कहें।',
            'ɖ':'ड के लिए जीभ की नोक दाँतों से थोड़ा पीछे रखें और आवाज़ जोड़ें।'}
        return f'ध्वनि मॉडल को “{word}” में /{expected}/ की जगह /{produced}/ जैसी ध्वनि सुनाई दी; यह सुझाव निश्चित नहीं है।', cues[expected]+f' अब “{word}” कहकर देखें।'
    return f'“{word}” എന്ന വാക്കിൽ /{expected}/ എന്നതിന് പകരം /{produced}/ പോലൊരു ശബ്ദം മോഡൽ കണ്ടെത്തി; ഇത് ഉറപ്പായ വിലയിരുത്തലല്ല।', f'ആദ്യം /{expected}/ കേൾക്കാം. പിന്നെ “{word}” പതുക്കെ പറഞ്ഞുനോക്കാം.'


def contrast_hypotheses(context):
    """Scan confirmed sentence words with the same acoustic anchors as a selected word."""
    if context.get('confirmed_intended_message') is False or len(context.get('expected_text','').split())<=1:
        result=contrast_hypothesis(context)
        return [result] if result else []
    results=[]
    for word in (context.get('pronunciation_reference') or {}).get('words',[]):
        result=contrast_hypothesis({**context,'focus_word':word['word']})
        if result:results.append(result)
        if len(results)==3:break
    return results
