import os

from dotenv import load_dotenv

from server.app.app_factory import create_app


load_dotenv()

# Read backend configuration from .env
host = os.getenv("BACKEND_HOST", "127.0.0.1")
port = int(os.getenv("BACKEND_PORT", 8000))
reload = os.getenv("BACKEND_RELOAD", "False").lower() == "true"

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("server.app.main:app", host=host, port=port, reload=reload)
