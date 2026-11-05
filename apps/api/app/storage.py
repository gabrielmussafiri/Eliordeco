"""Stockage local (dev). Interface volontairement minimale pour brancher S3/Cloudinary ensuite.
Les images produit sont publiques (/media) ; les preuves de paiement sont privées
et ne sortent que par des routes protégées."""
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile

from .config import settings

ROOT = Path(settings.upload_dir)
PUBLIC = ROOT / "public"
PRIVATE = ROOT / "private"
for d in (PUBLIC, PRIVATE):
    d.mkdir(parents=True, exist_ok=True)

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


async def save_upload(file: UploadFile, *, private: bool, allow_pdf: bool) -> tuple[str, str, int]:
    """Valide par signature réelle (pas par extension/Content-Type client) et par taille."""
    data = await file.read(settings.max_upload_bytes + 1)
    if len(data) > settings.max_upload_bytes:
        raise HTTPException(413, "File too large")
    if not data:
        raise HTTPException(400, "Empty file")
    kind = sniff(data[:16])
    if not kind or (kind[0] == "application/pdf" and not allow_pdf):
        raise HTTPException(415, "Unsupported file type (JPEG, PNG, WebP" + (", PDF)" if allow_pdf else ")"))
    key = secrets.token_hex(16) + kind[1]
    (PRIVATE if private else PUBLIC).joinpath(key).write_bytes(data)
    return key, kind[0], len(data)


def private_path(key: str) -> Path:
    p = (PRIVATE / key).resolve()
    if PRIVATE.resolve() not in p.parents or not p.exists():
        raise HTTPException(404, "Not found")
    return p
