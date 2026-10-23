"""Compare recognized practice words, without turning ASR into a sound diagnosis."""
import unicodedata


def word_recognition(expected, heard, language):
    def key(text):
        return ' '.join(''.join(char if unicodedata.category(char)[0] in 'LNM' else ' '
            for char in unicodedata.normalize('NFC', text or '').casefold()
            if char not in '\u200c\u200d').split())
    target, actual = key(expected), key(heard)
    if not target or len(target.split()) != 1 or not actual:
        return None
    matched = target == actual
    message = '' if matched else {
        'en': f'I heard “{heard}”, but the practice word is “{expected}”. This answer did not match. Listen to the word, then try again.',
        'hi': f'मुझे “{heard}” सुनाई दिया, लेकिन अभ्यास का शब्द “{expected}” है। यह उत्तर मेल नहीं खाता। शब्द सुनें और फिर कोशिश करें।',
        'ml': f'“{heard}” എന്നാണ് തിരിച്ചറിഞ്ഞത്. പരിശീലിക്കേണ്ട വാക്ക് “{expected}” ആണ്. ഈ ഉത്തരം ഒത്തില്ല. വാക്ക് കേട്ടിട്ട് വീണ്ടും പറഞ്ഞുനോക്കൂ.'
    }[language]
    return {'status': 'matches_target' if matched else 'different_word', 'expected': expected,
        'recognized': heard, 'message': message, 'source': 'speech_recognition_comparison',
        'pronunciation_correctness_established': False}
