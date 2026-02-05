Manual Setup (Development)

1. Clone the repository:
```bash
git clone https://github.com/SiriusHsh/docetl.git
cd docetl
```

2. Set up environment variables in `.env` in the root/top-level directory (for the backend Python server):
```bash
OPENAI_API_KEY=your_api_key_here  # Used by DocETL pipeline execution engine
# BACKEND configuration
BACKEND_ALLOW_ORIGINS=http://localhost:3000,http://127.0.0.1:3000
BACKEND_HOST=localhost
BACKEND_PORT=8000
BACKEND_RELOAD=True

# FRONTEND configuration
FRONTEND_HOST=0.0.0.0
FRONTEND_PORT=3000

# Host port mapping for docker-compose (if not set, defaults are used in docker-compose.yml)
FRONTEND_DOCKER_COMPOSE_PORT=3031
BACKEND_DOCKER_COMPOSE_PORT=8081

# Supported text file encodings
TEXT_FILE_ENCODINGS=utf-8,latin1,cp1252,iso-8859-1

DOCETL_HOME_DIR=./docetl_data
DOCETL_AUTH_SECRET=test
DOCETL_BOOTSTRAP_ADMIN_USERNAME=admin
DOCETL_BOOTSTRAP_ADMIN_PASSWORD=admin
```

And create an .env.local file in the `website` directory (for DocWrangler UI features):
```bash
OPENAI_API_KEY=sk-xxx  # Used by TypeScript features: improve prompt, chatbot, etc.
OPENAI_API_BASE=https://api.openai.com/v1
MODEL_NAME=gpt-4o-mini  # Model used by the UI assistant

NEXT_PUBLIC_BACKEND_HOST=localhost
NEXT_PUBLIC_BACKEND_PORT=8000
NEXT_PUBLIC_HOSTED_DOCWRANGLER=false
```

3. Install dependencies:
```bash
make install      # Install Python deps with uv and set up pre-commit
make install-ui   # Install UI dependencies
```

If you prefer using uv directly instead of Make:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
uv sync --all-groups --all-extras
```



4. Start the development server:
```bash
make run-ui-dev
```

5. Visit http://localhost:3000/playground to access the interactive UI.


