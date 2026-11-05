import os

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg:///eliors_deco"
    # Vercel/Neon fournissent postgres:// ou postgresql:// ; SQLAlchemy veut le pilote explicite
    environment: str = "development"
    secret_key: str = "dev-only-change-me"
    public_url: str = "http://localhost:3000"
    resend_api_key: str = ""
    email_from: str = "Favor Upon You Rentals <onboarding@resend.dev>"
    session_cookie_name: str = "eld_admin_session"
    session_ttl_hours: int = 12
    hold_ttl_minutes: int = 30
    max_upload_bytes: int = 4 * 1024 * 1024  # les fonctions Vercel limitent le corps des requêtes à 4,5 Mo
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()

if settings.database_url.startswith(("postgres://", "postgresql://")):
    settings.database_url = "postgresql+psycopg://" + settings.database_url.split("://", 1)[1]

if settings.public_url == "http://localhost:3000" and os.environ.get("VERCEL_PROJECT_PRODUCTION_URL"):
    settings.public_url = "https://" + os.environ["VERCEL_PROJECT_PRODUCTION_URL"]
