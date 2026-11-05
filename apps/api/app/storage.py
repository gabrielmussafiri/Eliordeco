"""Stockage des fichiers dans PostgreSQL.

Pourquoi en base : l'hébergement serverless (Vercel) n'a pas de disque persistant. Les photos produit (publiques)
et les reçus de paiement (privés) sont stockés en `bytea`. Les reçus ne sortent que par des routes qui vérifient
l'autorisation ; les photos sont servies par /media/{clé} avec un cache long (la clé change à chaque fichier).
Pour de gros volumes, remplacer ce module par un stockage objet (S3, Blob) en gardant la même interface."""
import secrets

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session

from .config import settings
from .models import StoredFile

_SIGNATURES = [
    (b"\xff\xd8\xff", "image/jpeg", ".jpg"),
    (b"\x89PNG\r\n\x1a\n", "image/png", ".png"),
    (b"%PDF-", "application/pdf", ".pdf"),
]


def sniff(head: bytes) -> tuple[str, str] | None:
    for sig, ctype, ext in _SIGNATURES:
        if head.startswith(sig):
            return ctype, ext
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return "image/webp", ".webp"
    return None


async def read_validated(file: UploadFile, *, allow_pdf: bool) -> tuple[bytes, str, str]:
    """Valide par signature réelle (pas par extension ni Content-Type client) et par taille."""
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, f"File too large (max {settings.max_upload_bytes // (1024 * 1024)} MB)")
    if not data:
        raise HTTPException(400, "Empty file")
    kind = sniff(data[:16])
    if not kind or (kind[0] == "application/pdf" and not allow_pdf):
        raise HTTPException(415, "Unsupported file type (JPEG, PNG, WebP" + (", PDF)" if allow_pdf else ")"))
    return data, kind[0], kind[1]


def store(db: Session, data: bytes, content_type: str, ext: str, *, private: bool) -> str:
    key = secrets.token_hex(16) + ext
    db.add(StoredFile(key=key, content_type=content_type, size_bytes=len(data), is_private=private, data=data))
    return key


def load(db: Session, key: str, *, private: bool) -> StoredFile:
    f = db.get(StoredFile, key)
    if not f or f.is_private != private:
        raise HTTPException(404, "Not found")
    return f
