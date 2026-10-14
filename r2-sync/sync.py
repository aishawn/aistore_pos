#!/usr/bin/env python3
"""Private, atomic mirror of the Shopfront R2 archive for Orithos."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import shutil
import sqlite3
import tempfile
import time
from datetime import datetime, timedelta
from pathlib import Path, PurePosixPath
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

import boto3
from botocore.config import Config
from botocore.exceptions import BotoCoreError, ClientError


LOG = logging.getLogger("r2-sync")
DATA_DIR = Path(os.getenv("R2_DATA_DIR", "/data"))
SNAPSHOTS_DIR = DATA_DIR / "snapshots"
STATUS_FILE = DATA_DIR / "status.json"
CURRENT_FILE = DATA_DIR / "CURRENT"
REQUEST_FILE = DATA_DIR / "REQUEST_SYNC"
PREFIX = os.getenv("R2_PREFIX", "shopfront/").strip("/") + "/"
MANIFEST_KEY = os.getenv("R2_MANIFEST_KEY", "shopfront/manifest.json")
DATABASE_KEY = os.getenv("R2_DATABASE_KEY", "shopfront/shopfront.sqlite3")
SYNC_HOUR = int(os.getenv("R2_SYNC_HOUR", "3"))
SYNC_MINUTE = int(os.getenv("R2_SYNC_MINUTE", "30"))
RETAIN_SNAPSHOTS = max(2, int(os.getenv("R2_RETAIN_SNAPSHOTS", "2")))
MAX_TOTAL_BYTES = int(os.getenv("R2_MAX_TOTAL_BYTES", str(2 * 1024 * 1024 * 1024)))

TIMEZONE_NAME = os.getenv("R2_SYNC_TIMEZONE", "Australia/Adelaide")
try:
    TIMEZONE = ZoneInfo(TIMEZONE_NAME)
except ZoneInfoNotFoundError as exc:
    # Never silently run the store's schedule in UTC when its configured local
    # timezone is unavailable or invalid. Fail visibly so Dokploy can restart
    # the worker after the timezone configuration/image has been corrected.
    raise RuntimeError(f"R2_SYNC_TIMEZONE is unavailable: {TIMEZONE_NAME}") from exc


def now_iso() -> str:
    return datetime.now(TIMEZONE).isoformat(timespec="seconds")


def load_status() -> dict:
    try:
        return json.loads(STATUS_FILE.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}


def save_status(status: dict) -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    temp = STATUS_FILE.with_suffix(".tmp")
    temp.write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding="utf-8")
    os.replace(temp, STATUS_FILE)


def credentials_configured() -> bool:
    required = ("R2_ENDPOINT", "R2_BUCKET", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY")
    return all(os.getenv(name, "").strip() for name in required)


def client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["R2_ENDPOINT"].strip(),
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"].strip(),
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"].strip(),
        region_name="auto",
        config=Config(signature_version="s3v4", retries={"max_attempts": 5, "mode": "standard"}),
    )


def safe_relative_key(key: str) -> Path:
    if not key.startswith(PREFIX):
        raise ValueError("object outside configured prefix")
    relative = PurePosixPath(key[len(PREFIX):])
    if not relative.parts or any(part in ("", ".", "..") for part in relative.parts):
        raise ValueError("invalid object key")
    if any(part.startswith(".") or part.endswith((".incoming", ".tmp")) for part in relative.parts):
        raise ValueError("temporary object")
    return Path(*relative.parts)


def digest_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def sqlite_integrity(path: Path) -> str:
    uri = path.resolve().as_uri() + "?mode=ro&immutable=1"
    connection = sqlite3.connect(uri, uri=True, timeout=30)
    try:
        row = connection.execute("PRAGMA quick_check").fetchone()
        if not row or row[0] != "ok":
            raise ValueError("SQLite quick_check failed")
        return row[0]
    finally:
        connection.close()


def list_objects(s3, bucket: str) -> list[dict]:
    paginator = s3.get_paginator("list_objects_v2")
    objects: list[dict] = []
    for page in paginator.paginate(Bucket=bucket, Prefix=PREFIX):
        for item in page.get("Contents", []):
            key = item["Key"]
            if key.endswith("/"):
                continue
            try:
                safe_relative_key(key)
            except ValueError:
                continue
            objects.append({"key": key, "size": int(item["Size"]), "etag": item.get("ETag", "").strip('"')})
    return objects


def object_etag(s3, bucket: str, key: str) -> str:
    return s3.head_object(Bucket=bucket, Key=key).get("ETag", "").strip('"')


def publish_snapshot(s3, bucket: str) -> dict:
    objects = list_objects(s3, bucket)
    keys = {item["key"] for item in objects}
    if MANIFEST_KEY not in keys:
        raise ValueError("manifest object is missing")
    if DATABASE_KEY not in keys:
        raise ValueError("SQLite archive object is missing")
    if sum(item["size"] for item in objects) > MAX_TOTAL_BYTES:
        raise ValueError("archive exceeds configured size limit")

    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    stage = Path(tempfile.mkdtemp(prefix=f".incoming-{timestamp}-", dir=SNAPSHOTS_DIR))
    summaries = []
    manifest_hash = ""
    try:
        for item in objects:
            key = item["key"]
            target = stage / safe_relative_key(key)
            target.parent.mkdir(parents=True, exist_ok=True)
            s3.download_file(bucket, key, str(target))
            if target.stat().st_size != item["size"]:
                raise ValueError("downloaded object size does not match R2 metadata")
            if object_etag(s3, bucket, key) != item["etag"]:
                raise ValueError("R2 object changed during snapshot download")
            sha256 = digest_file(target)
            summaries.append({
                "key": key,
                "name": target.name,
                "sizeBytes": item["size"],
                "sha256": sha256,
                "etag": item["etag"],
            })
            if key == MANIFEST_KEY:
                manifest_hash = sha256

        # Confirm every object remained on the same upstream version for the
        # entire download; never publish a mixed snapshot.
        for item in objects:
            if object_etag(s3, bucket, item["key"]) != item["etag"]:
                raise ValueError("R2 archive changed during snapshot download; retry the next run")

        database_path = stage / safe_relative_key(DATABASE_KEY)
        integrity = sqlite_integrity(database_path)
        (stage / "snapshot.json").write_text(json.dumps({
            "syncedAt": now_iso(),
            "manifestKey": MANIFEST_KEY,
            "manifestSha256": manifest_hash,
            "databaseKey": DATABASE_KEY,
            "databaseIntegrity": integrity,
            "files": summaries,
        }, ensure_ascii=False, indent=2), encoding="utf-8")

        snapshot_name = timestamp + "Z"
        final_path = SNAPSHOTS_DIR / snapshot_name
        os.replace(stage, final_path)
        pointer_temp = DATA_DIR / "CURRENT.tmp"
        pointer_temp.write_text(snapshot_name, encoding="ascii")
        os.replace(pointer_temp, CURRENT_FILE)
        prune_snapshots(snapshot_name)
        return json.loads((final_path / "snapshot.json").read_text(encoding="utf-8"))
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def prune_snapshots(current: str) -> None:
    snapshots = sorted(
        (path for path in SNAPSHOTS_DIR.iterdir() if path.is_dir() and not path.name.startswith(".incoming-")),
        key=lambda path: path.name,
        reverse=True,
    )
    keep = {path.name for path in snapshots[:RETAIN_SNAPSHOTS]}
    keep.add(current)
    for path in snapshots:
        if path.name not in keep:
            shutil.rmtree(path, ignore_errors=True)


def remove_abandoned_downloads() -> None:
    for path in SNAPSHOTS_DIR.glob(".incoming-*"):
        if path.is_dir():
            shutil.rmtree(path, ignore_errors=True)


def next_run(now: datetime) -> datetime:
    scheduled = now.replace(hour=SYNC_HOUR, minute=SYNC_MINUTE, second=0, microsecond=0)
    return scheduled if now < scheduled else scheduled + timedelta(days=1)


def error_code(exc: Exception) -> str:
    if isinstance(exc, ClientError):
        return str(exc.response.get("Error", {}).get("Code", "R2_CLIENT_ERROR"))[:64]
    if isinstance(exc, BotoCoreError):
        return "R2_CONNECTION_ERROR"
    if isinstance(exc, ValueError):
        return "ARCHIVE_VALIDATION_ERROR"
    return "SYNC_ERROR"


def run_sync(reason: str) -> None:
    prior = load_status()
    if not credentials_configured():
        save_status({**prior, "configured": False, "state": "not_configured", "checkedAt": now_iso()})
        return

    attempted_at = datetime.now(TIMEZONE)
    prior_attempt = prior.get("lastAttemptAt", "")
    try:
        prior_day = datetime.fromisoformat(prior_attempt).astimezone(TIMEZONE).date() if prior_attempt else None
    except ValueError:
        prior_day = None
    attempt_count = (int(prior.get("attemptCountToday", 0)) if prior_day == attempted_at.date() else 0) + 1
    save_status({**prior, "configured": True, "state": "syncing", "reason": reason,
                 "lastAttemptAt": attempted_at.isoformat(timespec="seconds"),
                 "attemptCountToday": attempt_count, "lastErrorCode": None})
    try:
        s3 = client()
        snapshot = publish_snapshot(s3, os.environ["R2_BUCKET"].strip())
        completed = now_iso()
        save_status({
            "configured": True,
            "state": "success",
            "reason": reason,
            "lastAttemptAt": completed,
            "lastSuccessAt": completed,
            "nextRunAt": next_run(datetime.now(TIMEZONE)).isoformat(timespec="seconds"),
            "timezone": TIMEZONE_NAME,
            "attemptCountToday": attempt_count,
            "snapshot": snapshot,
            "snapshotId": CURRENT_FILE.read_text(encoding="ascii").strip(),
            "lastErrorCode": None,
        })
        LOG.info("R2 archive snapshot published: files=%d database_check=%s", len(snapshot["files"]), snapshot["databaseIntegrity"])
    except Exception as exc:  # Keep failure detail out of user-facing status/logs.
        code = error_code(exc)
        LOG.error("R2 sync failed (%s)", code)
        save_status({
            **prior,
            "configured": True,
            "state": "error",
            "reason": reason,
            "lastAttemptAt": now_iso(),
            "lastErrorCode": code,
            "nextRunAt": next_run(datetime.now(TIMEZONE)).isoformat(timespec="seconds"),
            "nextAttemptAt": (datetime.now(TIMEZONE) + timedelta(minutes=30)).isoformat(timespec="seconds") if attempt_count < 4 else None,
            "attemptCountToday": attempt_count,
            "timezone": TIMEZONE_NAME,
        })


def current_snapshot_exists() -> bool:
    try:
        snapshot_name = CURRENT_FILE.read_text(encoding="ascii").strip()
        return bool(snapshot_name) and (SNAPSHOTS_DIR / snapshot_name / "snapshot.json").is_file()
    except OSError:
        return False


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    SNAPSHOTS_DIR.mkdir(parents=True, exist_ok=True)
    remove_abandoned_downloads()
    status = load_status()
    if not credentials_configured():
        save_status({**status, "configured": False, "state": "not_configured", "checkedAt": now_iso(), "timezone": TIMEZONE_NAME})
        LOG.warning("R2 credentials are not configured; scheduled mirror is idle")
    elif not current_snapshot_exists():
        run_sync("initial")

    while True:
        try:
            if REQUEST_FILE.exists():
                REQUEST_FILE.unlink(missing_ok=True)
                run_sync("manual")
            elif credentials_configured():
                now = datetime.now(TIMEZONE)
                status = load_status()
                last_attempt = status.get("lastAttemptAt", "")
                try:
                    last_attempt_time = datetime.fromisoformat(last_attempt).astimezone(TIMEZONE) if last_attempt else None
                    last_date = last_attempt_time.date() if last_attempt_time else None
                except ValueError:
                    last_attempt_time = None
                    last_date = None
                retry_at = status.get("nextAttemptAt")
                try:
                    retry_due = bool(retry_at) and datetime.fromisoformat(retry_at).astimezone(TIMEZONE) <= now
                except ValueError:
                    retry_due = False
                if status.get("state") == "error" and int(status.get("attemptCountToday", 0)) < 4 and retry_due:
                    run_sync("retry")
                elif now.hour == SYNC_HOUR and now.minute >= SYNC_MINUTE and last_date != now.date():
                    run_sync("scheduled")
            time.sleep(15)
        except Exception:
            LOG.exception("R2 worker loop error")
            time.sleep(15)


if __name__ == "__main__":
    main()
