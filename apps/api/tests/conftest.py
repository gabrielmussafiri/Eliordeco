import os

os.environ["DATABASE_URL"] = "postgresql+psycopg:///eliors_deco_test"

from decimal import Decimal  # noqa: E402

import pytest  # noqa: E402
from sqlalchemy import text  # noqa: E402

from app.db import Base, SessionLocal, engine  # noqa: E402
from app import models  # noqa: E402,F401
from app.models import Category, Product  # noqa: E402
from app.settings_store import get_settings  # noqa: E402


@pytest.fixture(scope="session", autouse=True)
def _schema():
    Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    yield


@pytest.fixture(autouse=True)
def _clean():
    with engine.begin() as c:
        names = ", ".join(t.name for t in Base.metadata.sorted_tables)
        c.execute(text(f"TRUNCATE {names} RESTART IDENTITY CASCADE"))
    yield


@pytest.fixture
def db():
    with SessionLocal() as s:
        yield s


@pytest.fixture
def settings(db):
    return get_settings(db)


@pytest.fixture
def umbrella(db):
    cat = Category(name="Outdoor Umbrellas", slug="outdoor-umbrellas")
    p = Product(category=cat, name="Cantilever Umbrella", slug="cantilever-umbrella",
                unit_price=Decimal("45.00"), security_deposit=Decimal("20.00"), total_quantity=1)
    db.add(p)
    db.commit()
    return p
