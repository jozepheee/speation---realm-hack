"""Expected Malayalam sounds for teaching; never an assessment of recorded audio."""
from copy import deepcopy
from functools import lru_cache
import json
from pathlib import Path
import re
import unicodedata


@lru_cache(maxsize=1)
def _analyser():
    try:
        from mlphon import PhoneticAnalyser
        return PhoneticAnalyser()
    except (ImportError, OSError):
        return None


@lru_cache(maxsize=1)
def _bundled():
    return json.loads(Path(__file__).with_name('malayalam_reference.json').read_text(encoding='utf-8'))['words']


@lru_cache(maxsize=256)
def _word(word):
    if word in _bundled():
        return _bundled()[word]
    analyser = _analyser()
    if analyser is None:
        return None
    from mlphon import split_as_phonemes
    try:
        analyses = analyser.analyse(word)[:8]
        syllables = analyser.split_to_syllables(word)
    except (ValueError, RuntimeError, OSError):
        return None
    if not analyses:
        return None
    return {'word': word, 'variants': [split_as_phonemes(item).split() for item in analyses],
            'syllables': syllables, 'articulatory_variants': analyses}


def target_reference(text, language):
    if language != 'ml' or not text or len(text) > 300:
        return None
    words = list(dict.fromkeys(re.findall(r'[\u0d00-\u0d7f]+', unicodedata.normalize('NFC', text))))
    references = []
    missing = []
    for word in words:
        reference = _word(word)
        if reference:
            references.append(deepcopy(reference))
        else:
            missing.append(word)
    if not words:
        return None
    return {'source': 'mlphon-3.1.3', 'source_url': 'https://pypi.org/project/mlphon/',
            'scope': 'expected_pronunciation_reference_only', 'audio_assessed': False,
            'words': references, 'uncovered_words': missing,
            'instruction': 'Use these expected sounds, syllables and articulatory attributes to model the word. '
                           'They do not describe what the learner pronounced. Accept valid variants; never infer '
                           'an error, correctness, score or hidden tongue movement from this text reference.'}
