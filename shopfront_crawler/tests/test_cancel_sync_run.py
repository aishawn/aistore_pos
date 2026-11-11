import asyncio
from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app import main


@pytest.mark.asyncio
async def test_cancelled_snapshot_job_stops_its_active_background_task(monkeypatch):
    job = SimpleNamespace(
        id=59,
        store_key="skr",
        status="cancelled",
        started_at=datetime(2026, 11, 4, 3, 48, 59, tzinfo=timezone.utc),
    )
    run = SimpleNamespace(
        store_key="skr",
        status="running",
        started_at=datetime(2026, 11, 4, 3, 49, 0, tzinfo=timezone.utc),
        error=None,
        finished_at=None,
    )
    task_started = asyncio.Event()

    async def running_job():
        task_started.set()
        await asyncio.Future()

    task = asyncio.create_task(running_job())
    await task_started.wait()

    class FakeDb:
        def get(self, model, identifier):
            return job if model is main.SyncJob and identifier == job.id else None

        def scalars(self, query):
            return SimpleNamespace(first=lambda: run)

        def commit(self):
            pass

    monkeypatch.setitem(main.active_job_tasks, job.id, task)
    try:
        result = main.cancel_sync_run(job.id, FakeDb())
        assert result == {"status": "cancelled", "run_id": job.id, "type": "job"}
        assert run.status == "cancelled"
        assert run.error == "cancelled by operator"
        assert run.finished_at is not None
        with pytest.raises(asyncio.CancelledError):
            await task
    finally:
        main.active_job_tasks.pop(job.id, None)


@pytest.mark.asyncio
async def test_cancel_running_snapshot_job_marks_it_cancelled_and_cancels_task(monkeypatch):
    job = SimpleNamespace(
        id=60,
        store_key="skr",
        status="running",
        error=None,
        finished_at=None,
        started_at=None,
    )
    task = SimpleNamespace(done=lambda: False, cancel=lambda: setattr(job, "task_cancelled", True))

    class FakeDb:
        def get(self, model, identifier):
            return job if model is main.SyncJob and identifier == job.id else None

        def commit(self):
            job.committed = True

    monkeypatch.setitem(main.active_job_tasks, job.id, task)
    try:
        result = main.cancel_sync_run(job.id, FakeDb())
        assert result["status"] == "cancelled"
        assert job.error == "cancelled by operator"
        assert isinstance(job.finished_at, datetime)
        assert job.finished_at.tzinfo == timezone.utc
        assert job.committed is True
        assert job.task_cancelled is True
    finally:
        main.active_job_tasks.pop(job.id, None)
