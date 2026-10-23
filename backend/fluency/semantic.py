"""MiniLM sentence embeddings and optional reference cosine similarity."""
from functools import lru_cache
import torch
from ml_settings import SEMANTIC_MODEL, DEVICE, ModelUnavailableError
@lru_cache(maxsize=1)
def get_semantic_encoder():
    try:
        from sentence_transformers import SentenceTransformer
        model = SentenceTransformer(SEMANTIC_MODEL, device=DEVICE).eval()
        model.requires_grad_(False)
        return model
    except Exception as exc:
        raise ModelUnavailableError("The specified MiniLM encoder is unavailable.") from exc

def semantic_embeddings(text: str) -> torch.Tensor:
    if not text.strip():
        raise ValueError("A real transcript is required for semantic features.")
    model = get_semantic_encoder()
    with torch.inference_mode():
        return model.encode(text, convert_to_tensor=True, normalize_embeddings=False).cpu()

def calculate_semantic_similarity(spoken_text: str, target_text: str) -> float | None:
    if not target_text.strip():
        return None
    if not spoken_text.strip():
        return 0.0
    with torch.inference_mode():
        vectors = get_semantic_encoder().encode([spoken_text, target_text],
                     normalize_embeddings=True, convert_to_tensor=True)
        return round(float(torch.clamp(vectors[0] @ vectors[1], 0, 1).item()) * 100, 1)
