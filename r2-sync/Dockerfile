FROM python:3.12-alpine

RUN apk add --no-cache su-exec tzdata \
    && addgroup -S -g 1001 archive \
    && adduser -S -D -H -u 10001 -G archive archive \
    && mkdir -p /data \
    && chown archive:archive /data

WORKDIR /app
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
COPY sync.py ./
COPY entrypoint.sh ./
RUN chmod 0555 /app/entrypoint.sh /app/sync.py

ENV R2_DATA_DIR=/data
ENTRYPOINT ["/app/entrypoint.sh"]
