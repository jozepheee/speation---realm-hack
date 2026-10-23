"""Language-specific expected phones. Text references never assess recorded audio."""
import ctypes
from functools import lru_cache
from pathlib import Path
import re
from threading import Lock
import unicodedata
from learners.malayalam_reference import target_reference as malayalam_reference

_engine_lock = Lock()  # eSpeak voice selection and conversion share native state.


@lru_cache(maxsize=1)
def _library():
    from espeakng_loader import get_library_path, get_data_path
    library = ctypes.CDLL(get_library_path())
    library.espeak_Initialize.argtypes = [ctypes.c_int, ctypes.c_int, ctypes.c_char_p, ctypes.c_int]
    library.espeak_Initialize.restype = ctypes.c_int
    library.espeak_SetVoiceByName.argtypes = [ctypes.c_char_p]
    library.espeak_SetVoiceByName.restype = ctypes.c_int
    library.espeak_TextToPhonemes.argtypes = [ctypes.POINTER(ctypes.c_void_p), ctypes.c_int, ctypes.c_int]
    library.espeak_TextToPhonemes.restype = ctypes.c_char_p
    # Synchronous retrieval mode does not open speakers or generate audio here.
    if library.espeak_Initialize(2, 0, str(Path(get_data_path()).parent).encode('utf-8'), 0x8000) <= 0:
        raise RuntimeError('Phonetic reference engine unavailable')
    return library


@lru_cache(maxsize=512)
def _phones(word, voice):
    with _engine_lock:
        library = _library()
        if library.espeak_SetVoiceByName(voice.encode('ascii')) != 0:
            raise ValueError('Phonetic reference language unavailable')
        buffer = ctypes.create_string_buffer(word.encode('utf-8'))
        pointer = ctypes.c_void_p(ctypes.addressof(buffer))
        chunks = []
        # Input is one bounded word; retain a guard against a non-advancing native pointer.
        for _ in range(8):
            previous = pointer.value
            result = library.espeak_TextToPhonemes(ctypes.byref(pointer), 1, 2 | (ord('|') << 8))
            if result:
                chunks.extend(part.replace('ˈ', '').replace('ˌ', '').strip() for part in result.decode('utf-8').split('|'))
            if not pointer.value:
                break
            if pointer.value == previous:
                raise ValueError('Phonetic reference did not advance')
        else:
            raise ValueError('Phonetic reference exceeds input limit')
    return tuple(phone for phone in chunks if phone and not phone.startswith('('))


def target_reference(text, language):
    if language == 'ml':
        return malayalam_reference(text, language)
    if language not in ['en', 'hi'] or not text or len(text) > 300:
        return None
    pattern = r"[A-Za-z]+(?:['’][A-Za-z]+)?" if language == 'en' else r'[\u0900-\u097f]+'
    words = list(dict.fromkeys(re.findall(pattern, unicodedata.normalize('NFC', text))))[:12]
    if not words:
        return None
    references, missing = [], []
    voices = ['en-us', 'en'] if language == 'en' else ['hi']
    for word in words:
        try:
            variants = list(dict.fromkeys(_phones(word, voice) for voice in voices))
            variants = [list(phones) for phones in variants if phones]
            if language == 'hi':
                # eSpeak's Hindi table explicitly defines these symbols as dental stops.
                dental = {'t':'t̪', 'd':'d̪', 'tʰ':'t̪ʰ', 'dʰ':'d̪ʰ'}
                variants = [[dental.get(phone, phone) for phone in phones] for phones in variants]
        except (ImportError, OSError, ValueError, RuntimeError):
            variants = []
        if variants:
            references.append({'word': word, 'variants': variants, 'reference_locales': ['en-us','en-gb'] if language=='en' else ['hi'],
                               'syllables': None})
        else:
            missing.append(word)
    return {'source': 'espeak-ng/espeakng-loader-0.2.4', 'source_url': 'https://github.com/espeak-ng/espeak-ng',
        'language': language, 'scope': 'expected_pronunciation_reference_only', 'audio_assessed': False,
        'notation': 'Hindi engine t/d/tʰ/dʰ are normalized to dental t̪/d̪/t̪ʰ/d̪ʰ; audio predictions are never normalized this way.' if language=='hi' else 'IPA; stress marks are omitted, vowel length and sound distinctions are preserved.',
        'words': references, 'uncovered_words': missing,
        'instruction': 'These are expected-phone teaching references, not learner audio or exhaustive dialect variants. '
                       'Never mark an accent or variant wrong solely because it differs from this reference. '
                       'Preserve vowel length, aspiration, dental/retroflex and voicing distinctions. '
                       'Syllabification is not supplied; do not treat written letters as separate syllables.'}
