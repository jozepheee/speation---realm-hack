"""Private encrypted objects, accessed only after route-level learner authorization."""
import base64
import os
import uuid
from pathlib import Path
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
from cryptography.exceptions import InvalidTag
from fastapi import HTTPException
from config import settings


def cipher():
    try:
        key = base64.urlsafe_b64decode(settings.AUDIO_ENCRYPTION_KEY)
        if len(key) != 32:
            raise ValueError()
        return AESGCM(key)
    except (ValueError, TypeError) as error:
        raise HTTPException(503, "Private recording retention requires a configured encryption key") from error


def path_for(key):
    # Opaque server-generated UUIDs only, never uploaded filenames.
    identifier = str(uuid.UUID(str(key)))
    root = Path(settings.AUDIO_STORAGE_DIR).resolve()
    return root / f"{identifier}.aes"


def retain(data):
    encryption = cipher()
    key = str(uuid.uuid4())
    nonce = os.urandom(12)
    encrypted = nonce + encryption.encrypt(nonce, data, key.encode())
    path = path_for(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("xb") as stream:
        stream.write(encrypted)
    return key


def read(key):
    try:
        encrypted = path_for(key).read_bytes()
        return cipher().decrypt(encrypted[:12], encrypted[12:], key.encode())
    except FileNotFoundError as error:
        raise HTTPException(404, "Recording is no longer retained") from error
    except InvalidTag as error:
        raise HTTPException(503, "Recording integrity verification failed") from error


def remove(key):
    path_for(key).unlink(missing_ok=True)
