#!/usr/bin/env python3
"""Private, atomic mirror of the Shopfront R2 archive for Orithos."""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
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
# Optional comma-separated extra prefixes for multi-store archives, e.g.
# shopfront/acme/,shopfront/other/. Each syncs under DATA_DIR/tenants/{slug}/.
# Do not mirror every store by default — only active prefixes.
_EXTRA_PREFIXES_RAW = os.getenv("R2_PREFIXES", "").strip()
SYNC_HOUR = int(os.getenv("R2_SYNC_HOUR", "3"))
SYNC_MINUTE = int(os.getenv("R2_SYNC_MINUTE", "30"))
RETAIN_SNAPSHOTS = max(2, int(os.getenv("R2_RETAIN_SNAPSHOTS", "2")))
MAX_TOTAL_BYTES = int(os.getenv("R2_MAX_TOTAL_BYTES", str(2 * 1024 * 1024 * 1024)))
SCHEDULE_ENABLED = os.getenv("R2_SYNC_SCHEDULE_ENABLED", "false").strip().lower() == "true"


def _normalize_prefix(raw: str) -> str:
    return raw.strip().strip("/") + "/"


def extra_prefixes() -> list[str]:
    if not _EXTRA_PREFIXES_RAW:
        return []
    values = []
    for part in _EXTRA_PREFIXES_RAW.split(","):
        if not part.strip():
            continue
        prefix = _normalize_prefix(part)
        if prefix != PREFIX and prefix not in values:
            values.append(prefix)
    return values


def tenant_slug_from_prefix(prefix: str) -> str:
    # shopfront/acme/ → acme ; acme/ → acme
    parts = [p for p in prefix.strip("/").split("/") if p]
    slug = parts[-1] if parts else "tenant"
    safe = re.sub(r"[^a-zA-Z0-9._-]+", "-", slug).strip(".-") or "tenant"
    return safe[:63]

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


def validate_manifest(
    path: Path,
    objects: list[dict],
    summaries: list[dict],
    *,
    manifest_key: str | None = None,
) -> None:
    """Require the manifest to describe every non-manifest object exactly."""
    skip_key = manifest_key or MANIFEST_KEY
    try:
        manifest = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError("manifest is not valid JSON") from exc
    entries = manifest.get("objects") if isinstance(manifest, dict) else None
    if not isinstance(entries, list):
        raise ValueError("manifest object list is missing")

    actual_objects = {item["key"]: item for item in objects if item["key"] != skip_key}
    actual_summaries = {item["key"]: item for item in summaries if item["key"] != skip_key}
    declared: dict[str, dict] = {}
    for entry in entries:
        if not isinstance(entry, dict):
            raise ValueError("manifest contains an invalid object entry")
        key = entry.get("key")
        if not isinstance(key, str) or key in declared:
            raise ValueError("manifest contains a missing or duplicate object key")
        size = entry.get("bytes")
        sha256 = entry.get("sha256")
        if type(size) is not int or size < 0 or not isinstance(sha256, str) or not re.fullmatch(r"[a-fA-F0-9]{64}", sha256):
            raise ValueError("manifest object size or SHA-256 is invalid")
        source = actual_objects.get(key)
        downloaded = actual_summaries.get(key)
        if source is None or downloaded is None:
            raise ValueError("manifest references an object absent from the archive")
        if size != source["size"] or size != downloaded["sizeBytes"]:
            raise ValueError("manifest object size does not match the archived file")
        if sha256.lower() != downloaded["sha256"].lower():
            raise ValueError("manifest SHA-256 does not match the archived file")
        declared[key] = entry

    if set(declared) != set(actual_objects):
        raise ValueError("manifest does not cover every archived object")


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


def publish_snapshot_for_prefix(
    s3,
    bucket: str,
    *,
    prefix: str,
    manifest_key: str,
    database_key: str,
    data_dir: Path,
) -> dict:
    """Download one archive prefix into data_dir (atomic CURRENT pointer)."""
    snapshots_dir = data_dir / "snapshots"
    current_file = data_dir / "CURRENT"
    snapshots_dir.mkdir(parents=True, exist_ok=True)

    paginator = s3.get_paginator("list_objects_v2")
    objects: list[dict] = []
    for page in paginator.paginate(Bucket=bucket, Prefix=prefix):
        for item in page.get("Contents", []):
            key = item["Key"]
            if key.endswith("/"):
                continue
            relative = PurePosixPath(key).relative_to(PurePosixPath(prefix))
            if ".." in relative.parts:
                continue
            objects.append({"key": key, "size": int(item["Size"]), "etag": item.get("ETag", "").strip('"'), "relative": str(relative)})

    keys = {item["key"] for item in objects}
    if manifest_key not in keys:
        raise ValueError(f"manifest object is missing for prefix {prefix}")
    if database_key not in keys:
        raise ValueError(f"SQLite archive object is missing for prefix {prefix}")
    if sum(item["size"] for item in objects) > MAX_TOTAL_BYTES:
        raise ValueError(f"archive exceeds configured size limit for prefix {prefix}")

    timestamp = datetime.now().strftime("%Y%m%dT%H%M%S")
    stage = Path(tempfile.mkdtemp(prefix=f".incoming-{timestamp}-", dir=snapshots_dir))
    summaries = []
    manifest_hash = ""
    try:
        for item in objects:
            key = item["key"]
            target = stage / item["relative"]
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
            if key == manifest_key:
                manifest_hash = sha256

        # Manifest validation uses relative names under the prefix.
        manifest_path = stage / PurePosixPath(manifest_key).relative_to(PurePosixPath(prefix))
        if not manifest_path.is_file():
            raise ValueError("manifest file missing after download")
        validate_manifest(manifest_path, objects, summaries, manifest_key=manifest_key)

        for item in objects:
            if object_etag(s3, bucket, item["key"]) != item["etag"]:
                raise ValueError("R2 archive changed during snapshot download; retry the next run")

        database_path = stage / PurePosixPath(database_key).relative_to(PurePosixPath(prefix))
        integrity = sqlite_integrity(database_path)
        (stage / "snapshot.json").write_text(json.dumps({
            "syncedAt": now_iso(),
            "prefix": prefix,
            "manifestKey": manifest_key,
            "manifestSha256": manifest_hash,
            "databaseKey": database_key,
            "databaseIntegrity": integrity,
            "files": summaries,
        }, ensure_ascii=False, indent=2), encoding="utf-8")
        os.chmod(stage, 0o750)

        snapshot_name = timestamp + "Z"
        final_path = snapshots_dir / snapshot_name
        os.replace(stage, final_path)
        pointer_temp = data_dir / "CURRENT.tmp"
        pointer_temp.write_text(snapshot_name, encoding="ascii")
        os.replace(pointer_temp, current_file)

        snapshots = sorted(
            (path for path in snapshots_dir.iterdir() if path.is_dir() and not path.name.startswith(".incoming-")),
            key=lambda path: path.name,
            reverse=True,
        )
        keep = {path.name for path in snapshots[:RETAIN_SNAPSHOTS]}
        keep.add(snapshot_name)
        for path in snapshots:
            if path.name not in keep:
                shutil.rmtree(path, ignore_errors=True)

        return json.loads((final_path / "snapshot.json").read_text(encoding="utf-8"))
    except Exception:
        shutil.rmtree(stage, ignore_errors=True)
        raise


def publish_snapshot(s3, bucket: str) -> dict:
    primary = publish_snapshot_for_prefix(
        s3,
        bucket,
        prefix=PREFIX,
        manifest_key=MANIFEST_KEY,
        database_key=DATABASE_KEY,
        data_dir=DATA_DIR,
    )
    tenant_results = []
    for prefix in extra_prefixes():
        slug = tenant_slug_from_prefix(prefix)
        tenant_dir = DATA_DIR / "tenants" / slug
        tenant_dir.mkdir(parents=True, exist_ok=True)
        manifest_key = prefix + "manifest.json"
        database_key = prefix + "shopfront.sqlite3"
        try:
            snap = publish_snapshot_for_prefix(
                s3,
                bucket,
                prefix=prefix,
                manifest_key=manifest_key,
                database_key=database_key,
                data_dir=tenant_dir,
            )
            tenant_results.append({"slug": slug, "prefix": prefix, "ok": True, "snapshotId": snap.get("syncedAt")})
            LOG.info("R2 tenant archive synced slug=%s prefix=%s", slug, prefix)
        except Exception as exc:
            tenant_results.append({"slug": slug, "prefix": prefix, "ok": False, "error": error_code(exc)})
            LOG.error("R2 tenant archive failed slug=%s (%s)", slug, error_code(exc))
    if tenant_results:
        primary = {**primary, "tenantArchives": tenant_results}
    return primary


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
            "nextRunAt": next_run(datetime.now(TIMEZONE)).isoformat(timespec="seconds") if SCHEDULE_ENABLED else None,
            "scheduleEnabled": SCHEDULE_ENABLED,
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
            "nextRunAt": next_run(datetime.now(TIMEZONE)).isoformat(timespec="seconds") if SCHEDULE_ENABLED else None,
            "nextAttemptAt": (datetime.now(TIMEZONE) + timedelta(minutes=30)).isoformat(timespec="seconds") if SCHEDULE_ENABLED and attempt_count < 4 else None,
            "scheduleEnabled": SCHEDULE_ENABLED,
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
        save_status({**status, "configured": False, "state": "not_configured", "checkedAt": now_iso(), "timezone": TIMEZONE_NAME, "scheduleEnabled": SCHEDULE_ENABLED})
        LOG.warning("R2 credentials are not configured; archive worker is idle")
    else:
        now = datetime.now(TIMEZONE)
        save_status({
            **status,
            "configured": True,
            "scheduleEnabled": SCHEDULE_ENABLED,
            "timezone": TIMEZONE_NAME,
            "nextRunAt": next_run(now).isoformat(timespec="seconds") if SCHEDULE_ENABLED else None,
            "nextAttemptAt": status.get("nextAttemptAt") if SCHEDULE_ENABLED else None,
            "checkedAt": now_iso(),
        })
        if not current_snapshot_exists():
            run_sync("initial")

    while True:
        try:
            if REQUEST_FILE.exists():
                REQUEST_FILE.unlink(missing_ok=True)
                run_sync("manual")
            elif credentials_configured() and SCHEDULE_ENABLED:
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
