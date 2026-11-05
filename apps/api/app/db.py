from collections.abc import Iterator

from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import settings


class Base(DeclarativeBase):
    pass


# Hébergement serverless : petit pool par instance, connexions recyclées. `prepare_threshold=None` désactive les
# requêtes préparées côté serveur, incompatibles avec le pooler de connexions (pgbouncer) des bases hébergées.
engine = create_engine(
    settings.database_url, pool_pre_ping=True, pool_size=2, max_overflow=3, pool_recycle=300,
    connect_args={"prepare_threshold": None},
)
SessionLocal = sessionmaker(bind=engine, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    with SessionLocal() as session:
        yield session
