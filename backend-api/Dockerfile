# PERBAIKAN BE PYTHON
FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Buat user dulu
RUN useradd -m appuser

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

# Copy file dengan kepemilikan appuser
COPY --chown=appuser:appuser . .

USER appuser

EXPOSE 9019
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9019"]