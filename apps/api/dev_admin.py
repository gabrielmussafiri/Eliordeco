"""Crée un compte admin de DÉVELOPPEMENT local avec un mot de passe aléatoire.
Les identifiants sont écrits dans .dev-credentials (ignoré par git, chmod 600), jamais affichés.
À supprimer avant toute mise en ligne :  python dev_admin.py --remove"""
import os
import secrets
import sys
from pathlib import Path

from app.db import Base, SessionLocal, engine
from app.enums import UserRole
from app.models import User
from app.security import hash_password

EMAIL = "dev-admin@example.com"
OLD = "dev-admin@localhost.test"
FILE = Path(".dev-credentials")

Base.metadata.create_all(engine)
with SessionLocal() as db:
    for old in db.query(User).filter_by(email=OLD):
        db.delete(old)
    existing = db.query(User).filter_by(email=EMAIL).one_or_none()
    if "--remove" in sys.argv:
        if existing:
            db.delete(existing)
            db.commit()
        FILE.unlink(missing_ok=True)
        print("Dev admin removed.")
        sys.exit()
    pw = secrets.token_urlsafe(18)
    if existing:
        existing.password_hash = hash_password(pw)
    else:
        db.add(User(email=EMAIL, full_name="Dev Admin", role=UserRole.OWNER, password_hash=hash_password(pw)))
    db.commit()
FILE.write_text(f"{EMAIL}\n{pw}\n")
os.chmod(FILE, 0o600)
print(f"Dev admin ready. Credentials saved to {FILE} (not printed).")
