import os

from dotenv import load_dotenv

from server.app.app_factory import create_app


load_dotenv()

# Read backend configuration from .env
host = os.getenv("BACKEND_HOST", "127.0.0.1")
port = int(os.getenv("BACKEND_PORT", 8000))
reload = os.getenv("BACKEND_RELOAD", "False").lower() == "true"
root_dir = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
reload_dirs = [
    os.path.join(root_dir, "server"),
    os.path.join(root_dir, "docetl"),
]
reload_excludes = [
    ".tmp/**",
    ".cache/**",
    "**/.cache/**",
    "docetl_data/**",
    "**/*.db",
    "**/*.db-*",
    "**/*.sqlite",
    "**/*.sqlite*",
]

app = create_app()

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "server.app.main:app",
        host=host,
        port=port,
        reload=reload,
        reload_dirs=reload_dirs if reload else None,
        reload_excludes=reload_excludes,
    )
