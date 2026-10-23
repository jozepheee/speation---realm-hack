"""
Redis Memory Layer — NeuroNudge Avatar
=======================================
Two-tier memory strategy:

  TIER 1 — Redis (hot, fast, session-scoped)
    • Stores the last N conversation turns per user as a JSON list
    • Used to inject immediate conversational context into every ConvAI session
    • TTL: 24 hours (rolling — refreshed on each write)
    • Key schema: `avatar:session:{user_id}` → JSON list of {role, content}

  TIER 2 — Chroma Cloud (cold, semantic, permanent — in vector_memory.py)
    • Long-term episodic memory across all sessions
    • Retrieved by semantic similarity at session start
    • Written to when a session ends (via /avatar/session-end)

Why Redis here:
  - When /avatar/convai-session is called, we pull the last 20 turns from Redis
    and append them as context to the ElevenLabs agent system prompt.
  - This means Maya remembers what you said *earlier in the day* even after
    starting a new ConvAI session (e.g. after switching scenarios or reloading).
  - Redis TTL ensures the hot context auto-expires; Chroma persists forever.
"""

import json
import asyncio
from typing import Optional, List, Dict, Any
from datetime import timedelta
from config import settings

# Max turns stored in Redis per user (keeps prompt size manageable)
MAX_HOT_TURNS = 20
# TTL: 24 hours rolling window
SESSION_TTL = int(timedelta(hours=24).total_seconds())

_redis_client = None


def _key(user_id: str) -> str:
    return f"avatar:session:{user_id}"


# In-memory fallback if Redis daemon is not running locally
_in_memory_cache: Dict[str, dict] = {}

def get_redis():
    """Lazy singleton Redis client. Returns None if Redis is unavailable."""
    global _redis_client
    if _redis_client is not None:
        return _redis_client if _redis_client is not False else None
    try:
        import redis as redis_lib
        url = settings.REDIS_URL or "redis://localhost:6379/0"
        _redis_client = redis_lib.from_url(url, decode_responses=True, socket_timeout=1)
        _redis_client.ping()
        print("[Redis] Connected successfully.", flush=True)
        return _redis_client
    except Exception as e:
        print(f"[Redis] Daemon offline ({e}) — utilizing built-in high-speed in-memory session cache.", flush=True)
        _redis_client = False  # Mark as offline so we use resilient in-memory cache
        return None


# ─────────────────────────────────────────────────────────────────────────────
#  Public API
# ─────────────────────────────────────────────────────────────────────────────

def append_turns(user_id: str, turns: List[Dict[str, str]]) -> None:
    """
    Appends one or more conversation turns to the user's hot memory.
    Each turn is a dict with 'role' ('user'|'assistant') and 'content'.
    Trims to MAX_HOT_TURNS.
    """
    if not user_id:
        return
    r = get_redis()
    if r:
        try:
            key = _key(user_id)
            existing_raw = r.get(key)
            existing: List[Dict] = json.loads(existing_raw) if existing_raw else []
            existing.extend(turns)
            trimmed = existing[-MAX_HOT_TURNS:]
            r.setex(key, SESSION_TTL, json.dumps(trimmed))
            return
        except Exception as e:
            print(f"[Redis] append_turns error: {e}", flush=True)

    # In-memory fallback
    key = _key(user_id)
    entry = _in_memory_cache.get(key, {"turns": []})
    entry["turns"].extend(turns)
    entry["turns"] = entry["turns"][-MAX_HOT_TURNS:]
    _in_memory_cache[key] = entry


def get_recent_turns(user_id: str, n: int = 10) -> List[Dict[str, str]]:
    """
    Returns the last `n` turns from the user's hot memory.
    """
    if not user_id:
        return []
    r = get_redis()
    if r:
        try:
            key = _key(user_id)
            raw = r.get(key)
            if raw:
                all_turns = json.loads(raw)
                return all_turns[-n:]
        except Exception as e:
            print(f"[Redis] get_recent_turns error: {e}", flush=True)

    # In-memory fallback
    key = _key(user_id)
    entry = _in_memory_cache.get(key)
    if entry and "turns" in entry:
        return entry["turns"][-n:]
    return []


def clear_session(user_id: str) -> None:
    """Clears the hot session memory for a user (e.g. on explicit logout)."""
    if not user_id:
        return
    key = _key(user_id)
    if key in _in_memory_cache:
        del _in_memory_cache[key]
    r = get_redis()
    if r:
        try:
            r.delete(key)
        except Exception as e:
            print(f"[Redis] clear_session error: {e}", flush=True)


def build_hot_memory_block(user_id: str, n: int = 8) -> str:
    """
    Formats the last `n` turns into a compact prompt block that can be
    appended to the ElevenLabs agent system prompt, giving Maya instant
    recall of the current-day conversation context.

    Returns an empty string if no recent turns exist.
    """
    turns = get_recent_turns(user_id, n=n)
    if not turns:
        return ""

    lines = []
    for t in turns:
        role = "You said" if t.get("role") == "user" else "I replied"
        content = t.get("content", "").strip()[:180]  # cap length
        if content:
            lines.append(f"  {role}: \"{content}\"")

    if not lines:
        return ""

    return (
        "\n\n=== TODAY'S CONVERSATION SO FAR (your hot memory) ===\n"
        + "\n".join(lines)
        + "\nUse this to maintain continuity — do not repeat what was already discussed.\n"
    )
