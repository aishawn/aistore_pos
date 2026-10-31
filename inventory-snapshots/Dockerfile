FROM python:3.12-slim
WORKDIR /app
RUN pip install --no-cache-dir tzdata==2025.3
COPY scripts/ai-eval/fetch-skr-inventory-snapshot.py scripts/ai-eval/inventory-snapshot-worker.py ./
ENV PYTHONUNBUFFERED=1
CMD ["python", "inventory-snapshot-worker.py"]
