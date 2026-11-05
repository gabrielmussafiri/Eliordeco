import hashlib
import secrets
import time
from collections import defaultdict, deque
from datetime import datetime, timedelta, timezone

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from .config import settings
from .db import get_db
from .enums import UserRole
from .models import AdminSession, User

_ph = PasswordHasher()


def hash_password(pw: str) -> str:
    return _ph.hash(pw)


def verify_password(hashed: str, pw: str) -> bool:
    try:
        return _ph.verify(hashed, pw)
    except (VerifyMismatchError, Exception):
        return False


def _h(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User) -> str:
    token = secrets.token_urlsafe(32)
    db.add(AdminSession(token_hash=_h(token), user_id=user.id,
                        expires_at=datetime.now(timezone.utc) + timedelta(hours=settings.session_ttl_hours)))
    return token


def destroy_session(db: Session, token: str) -> None:
    s = db.get(AdminSession, _h(token))
    if s:
        db.delete(s)


def current_admin(request: Request, db: Session = Depends(get_db)) -> User:
    token = request.cookies.get(settings.session_cookie_name)
    if not token:
        raise HTTPException(401, "Not authenticated")
    s = db.get(AdminSession, _h(token))
    if not s or s.expires_at <= datetime.now(timezone.utc):
        raise HTTPException(401, "Session expired")
    user = db.get(User, s.user_id)
    if not user or not user.is_active:
        raise HTTPException(401, "Not authenticated")
    # Protection CSRF : les requêtes modifiantes doivent porter l'en-tête personnalisé
    if request.method not in ("GET", "HEAD", "OPTIONS") and request.headers.get("x-requested-with") != "eld":
        raise HTTPException(403, "Missing CSRF header")
    return user


def require_owner(user: User = Depends(current_admin)) -> User:
    if user.role != UserRole.OWNER:
        raise HTTPException(403, "Owner role required")
    return user


class RateLimiter:
    """Fenêtre glissante en mémoire (par IP). Suffisant pour une instance unique ;
    à remplacer par Redis si l'API est répliquée."""

    def __init__(self, limit: int, per_seconds: int, name: str):
        self.limit, self.per, self.name = limit, per_seconds, name
        self.hits: dict[str, deque] = defaultdict(deque)

    def __call__(self, request: Request) -> None:
        key = request.client.host if request.client else "unknown"
        now = time.monotonic()
        q = self.hits[key]
        while q and now - q[0] > self.per:
            q.popleft()
        if len(q) >= self.limit:
            raise HTTPException(429, "Too many requests, please try again later")
        q.append(now)
