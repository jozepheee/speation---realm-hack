"""Generate the bundled teaching vocabulary using Mlphon, with provenance.

Run in Python 3.9–3.12 with mlphon==3.1.3 installed. The generated reference
is text-only; there are no invented audio labels or learner performance scores.
"""
import json
from pathlib import Path
from mlphon import PhoneticAnalyser, split_as_phonemes

WORDS = ['മഴ', 'മല', 'മള', 'മാല', 'മരം', 'വെള്ളം', 'പാൽ', 'പഴം', 'വാഴ', 'വാല',
         'വള', 'കളി', 'കിളി', 'പട്ടം', 'പടം', 'കുട്ടി', 'കുടി', 'അമ്മ', 'അച്ഛൻ', 'വീട്',
         'പൂച്ച', 'മീൻ', 'പൂവ്', 'കാറ്റ്', 'കഥ', 'പന്ത്', 'സൂര്യൻ', 'ആപ്പിൾ', 'കാർ',
         'എനിക്ക്', 'വേണം', 'ഇന്ന്', 'നാളെ', 'കേരളം']


if __name__ == '__main__':
    analyser = PhoneticAnalyser()
    words = {}
    for word in WORDS:
        analyses = analyser.analyse(word)
        if not analyses:
            raise ValueError(f'No phonetic analysis for {word}')
        words[word] = {'word': word, 'variants': [split_as_phonemes(item).split() for item in analyses],
                       'syllables': analyser.split_to_syllables(word), 'articulatory_variants': analyses}
    output = Path(__file__).resolve().parents[1] / 'learners/malayalam_reference.json'
    output.write_text(json.dumps({'generator': 'mlphon==3.1.3', 'license': 'MIT',
        'source': 'https://gitlab.com/smc/mlphon', 'audio_assessment': False, 'words': words},
        ensure_ascii=False, indent=2), encoding='utf-8')
    print(f'Generated {len(words)} expected-pronunciation references; no audio assessment.')
