"""Usage: python create_admin.py email "Full Name" [owner|staff]  (mot de passe demandé de façon masquée)"""
import getpass
import sys

from app.db import Base, SessionLocal, engine
from app.enums import UserRole
from app.models import User
from app.security import hash_password

email, name = sys.argv[1].lower(), sys.argv[2]
role = UserRole(sys.argv[3]) if len(sys.argv) > 3 else UserRole.OWNER
pw = getpass.getpass("Password (min 12 chars): ")
if len(pw) < 12:
    sys.exit("Password too short")
Base.metadata.create_all(engine)
with SessionLocal() as db:
    db.add(User(email=email, full_name=name, role=role, password_hash=hash_password(pw)))
    db.commit()
print("Admin created:", email)
