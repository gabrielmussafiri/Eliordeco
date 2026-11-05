from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .config import settings
from .routers import admin, public

if settings.environment == "production" and settings.secret_key == "dev-only-change-me":
    # Les jetons d'accès clients sont dérivés de cette clé : une valeur par défaut les rendrait prévisibles.
    raise RuntimeError("SECRET_KEY must be set in production")

app = FastAPI(title="Favor Upon You Rentals API", docs_url="/api/docs", openapi_url="/api/openapi.json")
app.add_middleware(CORSMiddleware, allow_origins=settings.cors_origins, allow_credentials=True,
                   allow_methods=["*"], allow_headers=["*"])
app.include_router(public.router)
app.include_router(admin.router)
app.include_router(public.media_router)


@app.get("/api/health")
def health():
    return {"ok": True}
