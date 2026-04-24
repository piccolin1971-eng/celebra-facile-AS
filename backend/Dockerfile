# Dockerfile per deploy Messale Digitale API su Render.com
FROM python:3.11-slim

# Metadata
LABEL maintainer="Messale Digitale"
LABEL description="Backend FastAPI per app Messale Digitale - letture CEI"

# Working directory
WORKDIR /app

# Install system dependencies (libxml2/libxslt per lxml se serve precompilato)
RUN apt-get update \
    && apt-get install -y --no-install-recommends gcc libxml2-dev libxslt1-dev \
    && rm -rf /var/lib/apt/lists/*

# Copia requirements e installa dipendenze Python
COPY requirements-deploy.txt ./requirements.txt
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copia il codice sorgente
COPY *.py ./

# Porta esposta (Render imposta $PORT dinamicamente)
ENV PORT=8001
EXPOSE 8001

# Avvia uvicorn con le impostazioni corrette per production
# Render sovrascriverà $PORT. Un solo worker va bene per il piano free.
CMD uvicorn server:app --host 0.0.0.0 --port ${PORT:-8001} --workers 1
