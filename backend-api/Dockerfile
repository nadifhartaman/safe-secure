FROM python:3.11-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY . .

# run sebagai non-root
RUN useradd -m appuser
USER appuser

EXPOSE 9015
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "9015"]
