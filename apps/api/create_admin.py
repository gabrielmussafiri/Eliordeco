"""Usage: python create_admin.py email "Full Name" [owner|staff]
Le mot de passe est demandé de façon masquée, ou lu dans ADMIN_PASSWORD pour un usage non interactif."""
import getpass
import os
import sys

from app.db import Base, SessionLocal, engine
from app.enums import UserRole
from app.models import User
from app.security import hash_password

email, name = sys.argv[1].lower(), sys.argv[2]
role = UserRole(sys.argv[3]) if len(sys.argv) > 3 else UserRole.OWNER
pw = os.environ.get("ADMIN_PASSWORD") or getpass.getpass("Password (min 12 chars): ")
if len(pw) < 12:
    sys.exit("Password too short")
Base.metadata.create_all(engine)
with SessionLocal() as db:
    if db.query(User).filter_by(email=email).first():
        sys.exit(f"{email} already exists")
    db.add(User(email=email, full_name=name, role=role, password_hash=hash_password(pw)))
    db.commit()
print("Admin created:", email)
