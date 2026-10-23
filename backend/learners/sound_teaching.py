"""Expected-sound education, separate from claims about a learner's production."""

def cue(language, phone, word, repeated=False):
    cues = {
        'en': {
            'ə': ('Use the short, relaxed “uh” sound at the start of “about”. Keep it light; then join it to the next sound.', 'Say a light “uh”, then slowly join it to the rest of your word.'),
            'ɛ': ('Use the short vowel in “bed”. Keep your jaw relaxed and say “eh”, then join it into the word.', 'Listen to “bed”, then try its vowel and your word slowly.'),
            'æ': ('Use the vowel in “cat”. Open your mouth comfortably, then join that short vowel into the word.', 'Listen to “cat”, then slowly join its vowel into your word.'),
            's': ('Let a gentle, steady stream of air make the quiet “sss” sound in “sun”. Then join it into the word.', 'Try “sss” slowly, then your word.'),
            'm': ('Close your lips gently and hum “mmm”, then open into the next sound.', 'Try “mmm” gently, then join it to the rest of your word.'),
            'p': ('Close your lips gently, then release them for the first sound in “pen”.', 'Try “p, pen”, then join the sound into your word.'),
            'f': ('Rest your top teeth lightly near your lower lip and let air flow gently, like the start of “fun”.', 'Try a gentle “fff”, then join it into your word.'),
            'ɪ': ('Use the short, relaxed vowel in “sit”; keep it shorter than “ee” in “see”.', 'Alternate “sit, see”, then say the short vowel in your word.'),
            'iː': ('Use the longer “ee” vowel in “see”.', 'Hold “ee” gently, then join it to the other sounds.'),
            'θ': ('Place the tongue tip lightly near the front teeth and let air flow without your voice.', 'Listen to “thin”. Keep the air flowing instead of stopping it like “t”.'),
            'ð': ('Place the tongue tip lightly near the front teeth and add your voice with gentle airflow.', 'Listen to “this”, then try its first sound on its own.'),
            'l': ('Touch the tongue tip lightly behind the upper front teeth and let your voice flow.', 'Try “la” slowly, then join the sound into your word.'),
            'ɹ': ('Listen to the first sound in “red”; gently shape it without pressing the tongue against the teeth.', 'Try “red” slowly, then your word. Different English accents can make r differently.'),
        },
        'hi': {
            't̪': ('त में जीभ की नोक ऊपर के दाँतों के पास हल्के से रखें और छोड़ें।', 'पहले “ता” धीरे कहें। फिर बिना ज़ोर लगाए पूरे शब्द में जोड़ें।'),
            'd̪': ('द में जीभ की नोक ऊपर के दाँतों के पास हल्के से रखें और आवाज़ जोड़ें।', 'पहले “दा” धीरे कहें, फिर पूरा शब्द बोलें।'),
            'ʈ': ('ट में जीभ की नोक त की तुलना में थोड़ा पीछे रखकर छोड़ें।', 'पहले “टा” धीरे कहें, फिर पूरा शब्द बोलें।'),
            'ɖ': ('ड में जीभ की नोक थोड़ा पीछे रखें और आवाज़ जोड़ें।', 'पहले “डा” धीरे कहें, फिर पूरा शब्द बोलें।'),
            'k': ('क में ख जितना हवा का झोंका न दें।', 'धीरे “क, का” बोलें, फिर पूरा शब्द।'),
            'kʰ': ('ख में क के साथ हवा का हल्का झोंका जोड़ें।', 'धीरे “क, ख” सुनें, फिर “खा” और पूरा शब्द बोलें।'),
            'p': ('प में दोनों होंठ हल्के से मिलाकर छोड़ें; फ जैसा हवा का झोंका न दें।', 'धीरे “प, पा” बोलें, फिर पूरा शब्द।'),
            'pʰ': ('फ में दोनों होंठ छोड़ते समय हवा का हल्का झोंका दें।', 'पहले “प, फ” सुनें, फिर पूरा शब्द बोलें।'),
            'aː': ('आ की ध्वनि अ से लंबी रखें।', 'पहले “अ, आ” का अंतर सुनें; फिर आ को पूरे शब्द में जोड़ें।'),
        },
        'ml': {
            'm': ('മ പറയാൻ രണ്ട് ചുണ്ടുകളും മൃദുവായി ചേർത്ത് “മ്മ്” എന്ന് ശബ്ദമുണ്ടാക്കൂ. പിന്നെ സ്വരം ചേർത്ത് വാക്ക് പറയൂ.', 'ആദ്യം “മ, മീ” പതുക്കെ കേട്ട് പറയാം. പിന്നെ മുഴുവൻ വാക്ക് പറയാം.'),
            'p': ('പ പറയാൻ രണ്ട് ചുണ്ടുകളും മൃദുവായി അടച്ചിട്ട് തുറക്കൂ. ഫ് പോലെ താഴത്തെ ചുണ്ട് പല്ലിനോട് ചേർത്ത് കാറ്റ് വിടേണ്ട.', 'ആദ്യം “പ, പാ” പതുക്കെ പറയാം. പിന്നെ വാക്കിന്റെ ഭാഗങ്ങൾ ചേർക്കാം.'),
            'ɻ': ('ഴ പറയാൻ നാവിന്റെ അറ്റം അല്പം പിന്നിലേക്ക് വളച്ച്, മുകളിൽ തൊടാതെ ശബ്ദം വരാൻ വിടൂ. ബലം കൊടുക്കേണ്ട.', 'ആദ്യം “ഴ” മാത്രം കേട്ട് പറയാം. പിന്നെ വാക്കിന്റെ ഭാഗങ്ങൾ പതുക്കെ ചേർക്കാം. ല, ള, ഴ എന്നിവ ഒരേ ശബ്ദമല്ല.'),
            'l': ('ല പറയുമ്പോൾ നാവിന്റെ അറ്റം മുകളിലെ മുൻപല്ലുകൾക്ക് പിന്നിൽ മൃദുവായി തൊടാം.', 'ആദ്യം “ല” പതുക്കെ പറയാം. പിന്നെ വാക്കിൽ ചേർക്കാം.'),
            'ɭ': ('ള പറയുമ്പോൾ നാവിന്റെ അറ്റം ല പറയുന്നതിനെക്കാൾ അല്പം പിന്നിലേക്ക് വളച്ച് മൃദുവായി തൊടാം.', 'ആദ്യം “ള” മാത്രം പറയാം. പിന്നെ വാക്കിന്റെ ഭാഗങ്ങൾ ചേർക്കാം.'),
            'aː': ('ആ എന്ന സ്വരം അ എന്നതിനെക്കാൾ നീട്ടി പറയൂ.', '“അ, ആ” കേട്ടുനോക്കൂ. നീണ്ട ആ ശബ്ദം വാക്കിൽ നിലനിർത്താം.'),
            'a': ('അ എന്ന സ്വരം ചെറുതായി പറയൂ; ആ പോലെ നീട്ടേണ്ട.', '“അ, ആ” എന്ന വ്യത്യാസം കേട്ട്, ചെറിയ അ ശബ്ദം വാക്കിൽ ചേർക്കാം.'),
        },
    }
    pair = cues.get(language, {}).get(phone)
    if not pair:
        return None
    finish = {'en': f' Listen to “{word}”, then try it once.', 'hi': f' अब “{word}” सुनें और एक बार कहें।', 'ml': f' ഇനി “{word}” കേട്ടിട്ട് ഒരിക്കൽ പറഞ്ഞുനോക്കൂ.'}[language]
    return pair[0] + (' ' + pair[1] if repeated else '') + finish


def focused_provider_words(context):
    words=(context.get('dedicated_provider_assessment') or {}).get('words',[])
    focus=context.get('focus_word','').casefold();sound=context.get('target_sound','')
    if not focus:return words
    matches=[word for word in words if word['word'].casefold()==focus]
    if not context.get('isolated_sound_practice') or context['language']!='en' or not sound or len(matches)<2:return matches
    # Repeated copies of the SAME practice word are separate attempts, not
    # phoneme errors. Keep the strongest focal attempt; preserve raw evidence.
    if len(matches)!=len(words):return matches
    def strength(word):
        scores=[phone.get('provider_accuracy_score') for phone in word.get('provider_phones',[]) if phone.get('provider_phone')==sound]
        return min((score for score in scores if score is not None),default=-1)
    best=max(matches,key=strength)
    return [{**best,'provider_error_type':'None'} if best.get('provider_error_type')=='Insertion' else best]


def provider_concerns(context):
    """Weak expected sounds trigger teaching, never an invented produced phone.

    Hindi may omit phone labels. Only unambiguous reference sequences with the
    same length permit positional *expected* sound guidance, not acoustic labels.
    """
    assessment = context.get('dedicated_provider_assessment') or {}
    if assessment.get('state') != 'provider_assessment':
        return []
    references = {item['word'].casefold(): item for item in (context.get('pronunciation_reference') or {}).get('words', [])}
    concerns = []
    for word in focused_provider_words(context):
        if context.get('focus_word') and word['word'].casefold()!=context['focus_word'].casefold():continue
        reference = references.get(word['word'].casefold())
        if not reference:
            continue
        phones = word.get('provider_phones', [])
        for index, phone in sorted(enumerate(phones),key=lambda pair:pair[1].get('provider_accuracy_score') if pair[1].get('provider_accuracy_score') is not None else 101):
            score = phone.get('provider_accuracy_score')
            if score is None or score >= 60:
                continue
            expected = phone.get('provider_phone') if context['language'] == 'en' else None
            allowed = {p for variant in reference['variants'] for p in variant}
            if expected and expected not in allowed:
                continue
            if not expected:
                variants = reference['variants']
                # Every possible variant must agree on both the phone and alignment.
                if not variants or any(len(variant) != len(phones) for variant in variants):
                    continue
                options = {variant[index] for variant in variants}
                if len(options) != 1:
                    continue
                expected = options.pop()
            if context.get('isolated_sound_practice') and context.get('target_sound') and context['target_sound'] != expected:
                continue
            tip = cue(context['language'], expected, reference['word'])
            if not tip:
                tip = {'en':f'Listen to “{reference["word"]}” slowly, then practise the /{expected}/ sound and join it into the word.',
                    'hi':f'पहले “{reference["word"]}” धीरे सुनें, फिर ध्वनि को पूरे शब्द में जोड़कर कहें।'}[context['language']]
            produced=None
            alternatives=sorted(phone.get('provider_alternatives',[]),key=lambda item:item['provider_score'],reverse=True)
            if context['language']=='en' and alternatives and alternatives[0]['phone']!=expected and alternatives[0]['provider_score']>=80 and (len(alternatives)==1 or alternatives[0]['provider_score']-alternatives[1]['provider_score']>=15):
                produced=alternatives[0]['phone']
            observation = {
                'en': f'The sound assessment suggests practising /{expected}/ in “{reference["word"]}”.',
                'hi': f'ध्वनि आकलन के अनुसार “{reference["word"]}” में /{expected}/ का अभ्यास करें।',
            }[context['language']]
            if produced:observation=f'The audio assessment suggests a sound closer to /{produced}/ where /{expected}/ is expected in “{reference["word"]}”.'
            concerns.append({'word': reference['word'], 'expected_phone': expected, 'produced_phone': produced,
                'category': 'substitution' if produced else 'distortion', 'observation': observation,
                'uncertainty': 'Low provider score suggests practice, not a verified error or an identified produced sound. Hindi expected sounds may come from unambiguous reference alignment.',
                'practice_tip': tip, 'start_seconds': 0, 'end_seconds': context['duration_seconds']})
            break  # Teach one sound at a time for each word.
        if not context.get('isolated_sound_practice') and not any(item['word'].casefold()==reference['word'].casefold() for item in concerns) and (word.get('provider_error_type') in ['Mispronunciation','Omission'] or isinstance(word.get('provider_accuracy_score'),(int,float)) and word['provider_accuracy_score']<60):
            tip={'en':f'Listen to “{reference["word"]}” slowly, then say the word once. Next, try it in your sentence.',
                 'hi':f'पहले “{reference["word"]}” धीरे सुनें, फिर एक बार बोलें। उसके बाद अपने वाक्य में कहें।'}[context['language']]
            concerns.append({'word':reference['word'],'expected_phone':None,'produced_phone':None,'category':'uncertain',
                'observation':{'en':f'The audio assessment suggests practising “{reference["word"]}”; the specific sound difference was not identified.',
                    'hi':f'ध्वनि आकलन “{reference["word"]}” के अभ्यास का सुझाव देता है; विशेष ध्वनि अंतर स्पष्ट नहीं है।'}[context['language']],
                'uncertainty':'Provider word assessment only; no produced phone was established.','practice_tip':tip,'start_seconds':0,'end_seconds':context['duration_seconds']})
    return concerns[:3]


def provider_clear(context):
    """Educational pass from actual provider audio scores, never transcript matching."""
    assessment=context.get('dedicated_provider_assessment') or {}
    if assessment.get('state')!='provider_assessment':return False
    words=focused_provider_words(context) if context.get('isolated_sound_practice') else assessment.get('words',[])
    focus=context.get('focus_word','').casefold();sound=context.get('target_sound','')
    if focus and context.get('isolated_sound_practice'):words=[word for word in words if word['word'].casefold()==focus]
    else:
        expected={word['word'].casefold() for word in (context.get('pronunciation_reference') or {}).get('words',[])}
        if not expected or not expected.issubset({word['word'].casefold() for word in words}):return False
    if not words:return False
    for word in words:
        if word.get('provider_error_type') in ['Omission','Insertion']:return False
        phones=word.get('provider_phones',[])
        if focus and sound and context['language']=='en' and context.get('isolated_sound_practice'):
            phones=[phone for phone in phones if phone.get('provider_phone')==sound]
            if not phones or any(phone.get('provider_accuracy_score') is None or phone['provider_accuracy_score']<80 for phone in phones):return False
        elif word.get('provider_error_type')!='None' or (word.get('provider_accuracy_score') or 0)<80 or not phones or any(phone.get('provider_accuracy_score') is None or phone['provider_accuracy_score']<80 for phone in phones):return False
        for phone in phones:
            alternatives=sorted(phone.get('provider_alternatives',[]),key=lambda item:item['provider_score'],reverse=True)
            if alternatives and alternatives[0]['phone']!=phone.get('provider_phone') and alternatives[0]['provider_score']>=80 and (len(alternatives)==1 or alternatives[0]['provider_score']-alternatives[1]['provider_score']>=15):return False
    return True


def teaching_plan(context, concerns):
    """Save the actual cue and repeat level so next-session recall can use them."""
    plans = []
    previous = context.get('previous_audio_proposals', [])
    seen=set()
    for concern in concerns:
        key=concern.word.casefold()
        if key in seen:continue
        seen.add(key)
        if len(plans)>=3:break
        ids = {row['recording_id'] for row in previous if any(
            old.get('word', '').casefold() == concern.word.casefold() and
            old.get('expected_phone') == concern.expected_phone for old in row['concerns'])}
        tip = cue(context['language'], concern.expected_phone, concern.word, bool(ids)) or concern.practice_tip
        if concern.produced_phone and concern.expected_phone and concern.category=='substitution':
            expected,produced=concern.expected_phone,concern.produced_phone
            difference={'en':f'In “{concern.word}”, I heard something closer to /{produced}/ instead of /{expected}/. ',
                'hi':f'“{concern.word}” में /{expected}/ की जगह /{produced}/ जैसी ध्वनि सुनाई दी। ',
                'ml':f'“{concern.word}” എന്ന വാക്കിൽ /{expected}/ എന്നതിന് പകരം /{produced}/ പോലൊരു ശബ്ദമാണ് കേട്ടത്. '}[context['language']]
            if context['language']=='ml' and expected=='ɻ' and produced=='z':
                difference=f'“{concern.word}” എന്ന വാക്കിൽ ഴയ്ക്ക് പകരം ഇംഗ്ലീഷിലെ zoo എന്ന വാക്കിലെ z പോലൊരു ശബ്ദമാണ് കേട്ടത്. '
            tip=difference+tip
        from learners.pronunciation_correction import correction
        spoken=correction(context['language'],concern.word,concern.expected_phone,concern.produced_phone) if concern.category=='substitution' else None
        if context['language']=='ml':
            reported=next((item for item in (context.get('indic_character_assessment') or {}).get('differences',[]) if item['word']==concern.word and item['expected_phone']==concern.expected_phone),None)
            if reported:
                wanted,heard=reported['expected_character'],reported['observed_character']
                spoken={'expected':concern.word,'heard':heard,'expected_sound':wanted,'expected_phone':concern.expected_phone,'produced_phone':None,'kind':'character',
                    'speech':f'“{concern.word}” എന്ന വാക്കിൽ {wanted} ശബ്ദം ശ്രമിക്കാം. {heard} പോലെയാണ് മോഡലിന് കേട്ടത്. കേൾക്കൂ: {concern.word}. നമുക്ക് ഒരുമിച്ച് പതുക്കെ പറയാം: {concern.word}.',
                    'source':'indicwav2vec_character_contrast','confirmed_error':False}
        if spoken:tip=spoken['speech']+' '+(cue(context['language'],concern.expected_phone,concern.word,bool(ids)) or '')
        reference = next((word for word in (context.get('pronunciation_reference') or {}).get('words', []) if word['word'].casefold() == concern.word.casefold()), {})
        plans.append({'word': concern.word, 'expected_phone': concern.expected_phone, 'practice_tip': tip,'correction':spoken,
            'syllables': reference.get('syllables'), 'practice_sentence':context.get('expected_text') if context.get('expected_text')!=concern.word else None, 'previous_attempt_count': len(ids),
            'level': 'slower_parts_then_word' if ids else 'sound_then_word',
            'instruction': 'Speak this cue now in the session language, model the word aloud, then listen to ONE new attempt. Read ordinary letters/words, not IPA code names. Expected sound placement is education, not observed tongue movement.'})
    if not plans and context.get('expected_text'):
        words=(context.get('pronunciation_reference') or {}).get('words', [])
        focus=context.get('focus_word','').casefold()
        word=next((item for item in words if item['word'].casefold()==focus),None)
        if not word and context.get('target_sound'):
            word=next((item for item in words if any(context['target_sound'] in variant for variant in item['variants'])),None)
        if not word:word=next(iter(words),None)
        if word:
            expected = context.get('target_sound') or ('ɻ' if context['language']=='ml' and 'ഴ' in word['word'] else None)
            initials={variant[0] for variant in word.get('variants',[]) if variant}
            if not expected and len(initials)==1:
                initial=next(iter(initials))
                if cue(context['language'],initial,word['word']):expected=initial
            tip = cue(context['language'], expected, word['word']) or {
                'en': f'Listen to “{word["word"]}” slowly, then say it once. We can practise it in a short sentence next.',
                'hi': f'पहले “{word["word"]}” धीरे सुनें और एक बार कहें। फिर छोटे वाक्य में अभ्यास करें।',
                'ml': f'ആദ്യം “{word["word"]}” പതുക്കെ കേട്ടിട്ട് ഒരിക്കൽ പറയാം. പിന്നെ ഒരു ചെറിയ വാക്യത്തിൽ പരിശീലിക്കാം.',
            }[context['language']]
            plans.append({'word': word['word'], 'expected_phone': expected, 'practice_tip': tip,
                'syllables': word.get('syllables'), 'previous_attempt_count': 0, 'level':'expected_word_demonstration',
                'instruction':'General expected-word teaching only; no error was established. Briefly acknowledge uncertainty if needed, model the word aloud, then listen to one attempt. Do not wait for a clinician or require typing.'})
    return plans
