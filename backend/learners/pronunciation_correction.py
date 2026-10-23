"""Speakable correction from supported audio concerns, never from ASR spelling."""

# These describe sounds in ordinary speech. They do not transliterate an entire
# attempted word or claim that hidden articulation was measured.
SOUNDS = {
    'en': {'z':'the z sound in zoo', 'ɻ':'the Malayalam zha sound',
        'ʌ':'the short vowel in cup','uː':'the long oo sound in moon','u':'the oo sound',
        'ɪ':'the short vowel in sit','iː':'the long ee sound in see',
        'ɡ':'the g sound in go','g':'the g sound in go','b':'the b sound in ball',
        'k':'the k sound in key','t':'the t sound in tea','s':'the s sound in sun',
        'ʃ':'the sh sound in ship','f':'the f sound in fan','p':'the p sound in pen',
        'l':'the l sound in leaf','ɭ':'the Malayalam retroflex la sound',
        'ɹ':'the r sound in red','r':'the r sound in red','w':'the w sound in water',
        'θ':'the th sound in thin','ð':'the th sound in this','d':'the d sound in day'},
    'ml': {'ɻ':'ഴ ശബ്ദം','z':'ഇംഗ്ലീഷിലെ zoo എന്ന വാക്കിലെ z ശബ്ദം',
        'ʒ':'ഇംഗ്ലീഷിലെ vision എന്ന വാക്കിന്റെ നടുവിലെ ശബ്ദം',
        'l':'ല ശബ്ദം','ɭ':'ള ശബ്ദം','a':'ചെറിയ അ ശബ്ദം','aː':'നീണ്ട ആ ശബ്ദം',
        'm':'മ ശബ്ദം','p':'പ ശബ്ദം','f':'ഫ് ശബ്ദം'},
    'hi': {'t̪':'त की ध्वनि','d̪':'द की ध्वनि','ʈ':'ट की ध्वनि','ɖ':'ड की ध्वनि',
        'k':'क की ध्वनि','kʰ':'ख की ध्वनि','p':'प की ध्वनि','pʰ':'फ की ध्वनि'}
}


def correction(language, word, expected, produced):
    labels=SOUNDS.get(language,{})
    if not expected or not produced or expected==produced:return None
    wanted=labels.get(expected);heard=labels.get(produced)
    if not wanted or not heard:return None
    if language=='ml':
        speech=f'“{word}” എന്ന വാക്കിൽ {wanted} വേണ്ടിടത്ത് {heard} പോലെയാണ് കേട്ടത്. കേൾക്കൂ: {word}. നമുക്ക് ഒരുമിച്ച് പതുക്കെ പറയാം: {word}.'
    elif language=='hi':
        speech=f'“{word}” में {wanted} की जगह {heard} जैसी सुनाई दी। सुनो: {word}। चलो साथ में धीरे बोलें: {word}।'
    else:
        speech=f'That sounded closer to {heard} where we want {wanted}. Listen: {word}. Let’s try {word} together.'
    return {'expected':word,'heard':heard,'expected_sound':wanted,'expected_phone':expected,'produced_phone':produced,'kind':'sound',
        'speech':speech,'source':'speakable_supported_audio_contrast','confirmed_error':False}
