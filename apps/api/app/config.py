from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+psycopg:///eliors_deco"
    environment: str = "development"
    secret_key: str = "dev-only-change-me"
    public_url: str = "http://localhost:3000"
    resend_api_key: str = ""
    email_from: str = "Favor Upon You Rentals <onboarding@resend.dev>"
    session_cookie_name: str = "eld_admin_session"
    session_ttl_hours: int = 12
    hold_ttl_minutes: int = 30
    upload_dir: str = "uploads"
    max_upload_bytes: int = 8 * 1024 * 1024
    cors_origins: list[str] = ["http://localhost:3000"]


settings = Settings()
