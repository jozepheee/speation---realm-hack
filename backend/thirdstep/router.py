import random
from fastapi import APIRouter, HTTPException, Response
from pydantic import BaseModel
from avatar.tts import generate_elevenlabs_speech

router = APIRouter(tags=["thirdstep"])

CLINICAL_VOCABULARY = [
    {"word": "articulation", "phonetic": "/ɑːrˌtɪkjʊˈleɪʃən/", "difficulty": "Medium"},
    {"word": "resilience", "phonetic": "/rɪˈzɪljəns/", "difficulty": "Medium"},
    {"word": "equilibrium", "phonetic": "/ˌiːkwɪˈlɪbriəm/", "difficulty": "Hard"},
    {"word": "diaphragm", "phonetic": "/ˈdaɪəfræm/", "difficulty": "Hard"},
    {"word": "synchrony", "phonetic": "/ˈsɪŋkrəni/", "difficulty": "Medium"},
    {"word": "modulation", "phonetic": "/ˌmɒdjʊˈleɪʃən/", "difficulty": "Hard"},
    {"word": "serendipity", "phonetic": "/ˌsɛrənˈdɪpɪti/", "difficulty": "Hard"},
    {"word": "ubiquitous", "phonetic": "/juːˈbɪkwɪtəs/", "difficulty": "Hard"},
    {"word": "ephemeral", "phonetic": "/ɪˈfɛmərəl/", "difficulty": "Hard"},
    {"word": "soliloquy", "phonetic": "/səˈlɪləkwi/", "difficulty": "Hard"}
]

class PronunciationCheckRequest(BaseModel):
    word: str
    user_said: str

@router.get("/get-word/")
async def get_practice_word():
    """
    Returns a clinical pronunciation word for therapeutic speech training.
    """
    item = random.choice(CLINICAL_VOCABULARY)
    return {
        "word": item["word"],
        "phonetic": item["phonetic"],
        "difficulty": item["difficulty"]
    }

@router.get("/text-to-speech/")
async def synthesize_word_pronunciation(word: str):
    """
    Synthesizes crystal-clear audio pronunciation using ElevenLabs voice model.
    """
    try:
        audio_bytes = await generate_elevenlabs_speech(f"{word}. {word}.")
        if not audio_bytes:
            raise HTTPException(status_code=500, detail="Failed to synthesize speech audio with ElevenLabs.")
        return Response(content=audio_bytes, media_type="audio/mpeg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"TTS synthesis error: {str(e)}")

@router.post("/check-pronunciation/")
async def check_pronunciation(payload: PronunciationCheckRequest):
    """
    Verifies user pronunciation accuracy using token, substring, and fuzzy matching.
    Strips trailing periods/punctuation added by speech recognition engines.
    """
    import re
    from difflib import SequenceMatcher

    raw_target = payload.word.strip().lower()
    raw_spoken = payload.user_said.strip().lower()

    # Strip punctuation
    target = re.sub(r'[^\w\s]', '', raw_target).strip()
    spoken = re.sub(r'[^\w\s]', '', raw_spoken).strip()

    # Exact or substring match
    is_correct = bool(target and ((target == spoken) or (target in spoken) or (spoken in target)))

    # Token-level similarity check (in case user said "the word is soliloquy" or stuttered)
    best_sim = SequenceMatcher(None, target, spoken).ratio() if (target and spoken) else 0.0
    for token in spoken.split():
        token_sim = SequenceMatcher(None, target, token).ratio()
        if token_sim > best_sim:
            best_sim = token_sim
        if token == target or token_sim >= 0.75:
            is_correct = True

    if best_sim >= 0.75:
        is_correct = True

    acc_score = 100.0 if (target == spoken) else round(best_sim * 100, 1)

    if acc_score >= 85:
        verdict = "Excellent articulation & phoneme clarity!"
    elif acc_score >= 65:
        verdict = "Good attempt! Close phoneme match. Focus on syllable stress."
    else:
        verdict = "Needs practice. Listen to the native audio model and try again."

    return {
        "correct": is_correct,
        "target": target,
        "user_said": spoken,
        "accuracy_score": acc_score,
        "verdict": verdict
    }
