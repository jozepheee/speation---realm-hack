import os
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional
import chromadb
from config import settings

_chroma_client = None
_clinical_kb_col = None
_user_memory_col = None

CLINICAL_KNOWLEDGE_DOCS = [
    {
        "id": "kb_diaphragmatic_breathing",
        "category": "breathing",
        "title": "Diaphragmatic Breathing & Abdominal Pacing",
        "content": (
            "Deep abdominal inhalation expands the lower rib cage and activates the vagus nerve, reducing autonomic "
            "vocal tension. Instruct the speaker to take a calm, gentle breath before initiating speech, releasing airflow "
            "smoothly without holding tension in the neck or shoulders."
        )
    },
    {
        "id": "kb_easy_vocal_onset",
        "category": "phonation",
        "title": "Easy Vocal Onset & Gentle Phonation",
        "content": (
            "Prevents hard glottal attacks on vowels (like 'apple', 'open', 'energy'). Initiate sound with a gentle, "
            "soft exhalation (almost like a soft /h/) allowing the vocal folds to approximate softly without slamming shut. "
            "Encourage a warm, easy voice initiation."
        )
    },
    {
        "id": "kb_light_articulatory_contact",
        "category": "articulation",
        "title": "Light Articulatory Contacts",
        "content": (
            "Reduces excessive physical pressure of lips and tongue on consonant plosives (/p/, /b/, /t/, /d/, /k/, /g/). "
            "Touch the lips or tongue lightly against the teeth/palate, keeping the articulators relaxed rather than pressed tightly."
        )
    },
    {
        "id": "kb_rate_control_elongation",
        "category": "prosody",
        "title": "Continuous Phonation & Syllable Elongation",
        "content": (
            "Slowing speech down by stretching vowel sounds slightly gives the motor cortex more time to sequence phonemes. "
            "Link words smoothly together like a calm river rather than staccato bursts. Natural pauses every 4-6 words prevent breath depletion."
        )
    },
    {
        "id": "kb_social_ordering_coffee",
        "category": "social_scenario",
        "title": "Everyday Situations: Ordering at a Counter or Cafe",
        "content": (
            "Counter ordering often triggers situational anxiety and rushing. Techniques: mentally rehearse the first two words, "
            "take a relaxed breath upon reaching the counter, make friendly eye contact, and use an easy onset: 'Hi, may I please get a...'. "
            "Pausing before speaking is a sign of composure, not hesitation."
        )
    },
    {
        "id": "kb_conversational_confidence",
        "category": "psychology",
        "title": "Confidence Reinforcement & Desensitization",
        "content": (
            "Remind the learner that minor pauses or repetitions are completely natural in everyday human communication. "
            "Focus on the message and connection rather than perceived perfection. Celebrate every steady sentence and steady vocal rhythm."
        )
    }
]

def get_chroma_client():
    global _chroma_client
    if _chroma_client is not None:
        return _chroma_client

    # 1. Attempt Chroma Cloud connection
    if settings.CHROMA_API_KEY:
        try:
            print("[ChromaDB] Connecting to Chroma Cloud...", flush=True)
            _chroma_client = chromadb.CloudClient(
                api_key=settings.CHROMA_API_KEY,
                tenant=settings.CHROMA_TENANT,
                database=settings.CHROMA_DATABASE
            )
            # Test heartbeat
            _chroma_client.heartbeat()
            print("[ChromaDB] Successfully connected to Chroma Cloud!", flush=True)
            return _chroma_client
        except Exception as e:
            print(f"[ChromaDB Cloud Warning] Falling back to local persistent store: {e}", flush=True)

    # 2. Fallback to local persistent ChromaDB
    local_path = os.path.join(os.path.dirname(__file__), "..", "data", "chroma_db")
    os.makedirs(local_path, exist_ok=True)
    _chroma_client = chromadb.PersistentClient(path=local_path)
    print(f"[ChromaDB] Using local persistent store at: {local_path}", flush=True)
    return _chroma_client

def get_collections():
    global _clinical_kb_col, _user_memory_col
    client = get_chroma_client()
    
    if _clinical_kb_col is None:
        _clinical_kb_col = client.get_or_create_collection(
            name="clinical_speech_knowledge",
            metadata={"description": "Authoritative speech coaching strategies and exercises"}
        )
        # Seed knowledge base if empty
        if _clinical_kb_col.count() < len(CLINICAL_KNOWLEDGE_DOCS):
            ids = [doc["id"] for doc in CLINICAL_KNOWLEDGE_DOCS]
            docs = [f"{doc['title']}: {doc['content']}" for doc in CLINICAL_KNOWLEDGE_DOCS]
            metas = [{"category": doc["category"], "title": doc["title"]} for doc in CLINICAL_KNOWLEDGE_DOCS]
            _clinical_kb_col.upsert(ids=ids, documents=docs, metadatas=metas)
            print(f"[ChromaDB] Seeded {_clinical_kb_col.count()} clinical knowledge documents.", flush=True)

    if _user_memory_col is None:
        _user_memory_col = client.get_or_create_collection(
            name="user_conversation_memory",
            metadata={"description": "User conversational memory and longitudinal speech practice context"}
        )

    return _clinical_kb_col, _user_memory_col

def retrieve_rag_context(user_id: str, query: str, n_results: int = 2) -> Dict[str, List[str]]:
    """
    Performs semantic vector retrieval from both:
    1. Clinical speech coaching knowledge base
    2. User's personalized long-term conversational memory
    """
    try:
        kb_col, mem_col = get_collections()
        
        # 1. Query clinical knowledge
        kb_results = kb_col.query(
            query_texts=[query],
            n_results=min(n_results, kb_col.count() or 1)
        )
        clinical_snippets = kb_results["documents"][0] if kb_results.get("documents") else []

        # 2. Query user long-term memory
        user_snippets = []
        if user_id and mem_col.count() > 0:
            user_results = mem_col.query(
                query_texts=[query],
                where={"user_id": str(user_id)},
                n_results=min(n_results, mem_col.count() or 1)
            )
            if user_results.get("documents") and len(user_results["documents"]) > 0:
                user_snippets = user_results["documents"][0]

        return {
            "clinical_guidance": clinical_snippets,
            "user_memory": user_snippets
        }
    except Exception as e:
        print(f"[Vector RAG Retrieval Error] {e}", flush=True)
        return {"clinical_guidance": [], "user_memory": []}

def store_conversation_memory(
    user_id: str,
    user_message: str,
    avatar_reply: str,
    fluency_score: float,
    notes: str
):
    """
    Embeds and stores conversational turn into the persistent Chroma vector store.
    """
    try:
        _, mem_col = get_collections()
        doc_id = f"mem_{user_id}_{uuid.uuid4().hex[:12]}"
        
        document_text = (
            f"User said: '{user_message}'. "
            f"Speech flow score: {fluency_score:.1f}/100. "
            f"Observation: {notes}. "
            f"Companion replied: '{avatar_reply}'"
        )
        
        metadata = {
            "user_id": str(user_id) if user_id else "guest",
            "fluency_score": float(fluency_score),
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "notes": str(notes)
        }
        
        mem_col.add(
            ids=[doc_id],
            documents=[document_text],
            metadatas=[metadata]
        )
        print(f"[ChromaDB] Vector memory stored for user {user_id}: {doc_id}", flush=True)
    except Exception as e:
        print(f"[ChromaDB Store Memory Error] {e}", flush=True)
