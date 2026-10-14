#!/bin/sh
set -eu

chown 10001:1001 /data
chmod 2775 /data

exec su-exec archive:archive python /app/sync.py
