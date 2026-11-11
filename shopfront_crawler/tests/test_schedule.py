import asyncio
from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.config import Settings


def test_startup_constructs_cron_for_exact_configured_times(monkeypatch):
    from app import main

    jobs = {}

    class Scheduler:
        def add_job(self, callback, trigger, **kwargs):
            jobs[kwargs["id"]] = trigger

        def start(self):
            pass

    db = SimpleNamespace(
        scalars=lambda *args: SimpleNamespace(all=lambda: []),
        commit=lambda: None,
        close=lambda: None,
    )
    monkeypatch.setattr(main, "init_db", lambda: None)
    monkeypatch.setattr(main, "get_db", lambda: iter([db]))
    monkeypatch.setattr(main, "ensure_stores", lambda *args: None)
    monkeypatch.setattr(main, "scheduler", Scheduler())
    monkeypatch.setattr(main, "settings", Settings(sync_daily_times="23:00,02:30"))
    asyncio.run(main.startup())

    assert set(jobs) >= {"shopfront-sync-2300", "shopfront-sync-0230"}
    zone = ZoneInfo("Australia/Adelaide")
    for job_id, current_hour, current_minute, next_hour, next_minute, next_day in [
        ("shopfront-sync-0230", 1, 59, 2, 30, 4),
        ("shopfront-sync-0230", 2, 31, 2, 30, 5),
        ("shopfront-sync-2300", 22, 59, 23, 0, 4),
        ("shopfront-sync-2300", 23, 1, 23, 0, 5),
    ]:
        following = jobs[job_id].get_next_fire_time(
            None, datetime(2026, 11, 4, current_hour, current_minute, tzinfo=zone)
        )
        assert (following.day, following.hour, following.minute) == (next_day, next_hour, next_minute)


def test_nightly_sync_uses_a_short_incremental_window():
    from app.main import scheduled_sync_range

    zone = ZoneInfo("Australia/Adelaide")
    assert Settings().daily_sync_times() == ["02:30", "23:00"]
    assert Settings().full_inventory_times() == ["02:30", "23:00"]
    assert scheduled_sync_range(datetime(2026, 11, 4, 23, 0, tzinfo=zone), 3) == (datetime(2026, 11, 3).date(), datetime(2026, 11, 4).date())
    assert scheduled_sync_range(datetime(2026, 11, 5, 2, 30, tzinfo=zone), 10) == (
        datetime(2026, 11, 3).date(), datetime(2026, 11, 4).date()
    )


def test_sync_times_validate_and_deduplicate():
    settings = Settings(sync_daily_times="23:00,02:30,02:30")
    assert settings.daily_sync_times() == ["02:30", "23:00"]
    try:
        Settings(sync_daily_times="25:00").daily_sync_times()
    except ValueError as exc:
        assert "HH:MM" in str(exc)
    else:
        raise AssertionError("invalid sync time should be rejected")


def test_scheduled_sync_persists_distinct_full_inventory_jobs(monkeypatch):
    from app import main

    class FixedDateTime(datetime):
        current = datetime(2026, 11, 4, 23, 0)

        @classmethod
        def now(cls, tz=None):
            return cls.current.replace(tzinfo=tz)

    class FakeDb:
        def __init__(self):
            self.jobs = []

        def scalars(self, *_args, **_kwargs):
            return SimpleNamespace(all=lambda: list(reversed(self.jobs[-32:])))

        def add(self, job):
            self.jobs.append(job)

        def commit(self):
            pass

        def close(self):
            pass

    db = FakeDb()
    settings = Settings(sync_daily_times="23:00,02:30", sync_full_inventory_times="23:00,02:30")
    monkeypatch.setattr(main, "datetime", FixedDateTime)
    monkeypatch.setattr(main, "settings", settings)
    monkeypatch.setattr(main, "get_db", lambda: iter([db]))
    monkeypatch.setattr(main, "active_job", lambda *_args: None)
    monkeypatch.setattr(main, "should_include_supply_chain", lambda *_args: False)

    asyncio.run(main.scheduled_sync("23:00"))
    FixedDateTime.current = datetime(2026, 11, 5, 2, 30)
    asyncio.run(main.scheduled_sync("02:30"))
    asyncio.run(main.scheduled_sync("02:30"))

    assert len(db.jobs) == 2
    assert {job.payload["schedule_key"] for job in db.jobs} == {
        "2026-11-04T23:00",
        "2026-11-05T02:30",
    }
    assert all(job.payload["full_inventory_snapshot"] is True for job in db.jobs)


def test_scheduled_sync_requeues_failed_occurrence(monkeypatch):
    from app import main

    class FixedDateTime(datetime):
        @classmethod
        def now(cls, tz=None):
            return cls(2026, 11, 4, 23, 0, tzinfo=tz)

    failed = SimpleNamespace(
        status="failed",
        payload={"schedule_key": "2026-11-04T23:00", "full_inventory_snapshot": True},
        from_date="2026-11-04", to_date="2026-11-04", cursor_date="2026-11-04",
    )

    class FakeDb:
        def __init__(self):
            self.jobs = [failed]

        def scalars(self, *_args, **_kwargs):
            return SimpleNamespace(all=lambda: list(self.jobs))

        def add(self, job):
            self.jobs.append(job)

        def commit(self):
            pass

        def close(self):
            pass

    db = FakeDb()
    monkeypatch.setattr(main, "datetime", FixedDateTime)
    monkeypatch.setattr(main, "settings", Settings(sync_daily_times="23:00", sync_full_inventory_times="23:00"))
    monkeypatch.setattr(main, "get_db", lambda: iter([db]))
    monkeypatch.setattr(main, "active_job", lambda *_args: None)
    monkeypatch.setattr(main, "should_include_supply_chain", lambda *_args: False)

    asyncio.run(main.scheduled_sync("23:00"))

    assert len(db.jobs) == 2
    assert db.jobs[-1].payload["full_inventory_snapshot"] is True


def test_daily_sync_does_not_expand_to_previous_week_on_monday():
    from app.main import scheduled_sync_range

    zone = ZoneInfo("Australia/Adelaide")
    assert scheduled_sync_range(datetime(2026, 11, 9, 2, 30, tzinfo=zone), 10) == (datetime(2026, 11, 7).date(), datetime(2026, 11, 8).date())
    assert scheduled_sync_range(datetime(2026, 11, 8, 23, 0, tzinfo=zone), 10) == (datetime(2026, 11, 7).date(), datetime(2026, 11, 8).date())


def test_shopfront_sync_notifies_both_mapped_store_hosts():
    from app.main import POS_UI_NOTIFY_HOSTS

    assert POS_UI_NOTIFY_HOSTS["skr"] == ["skr.orithos.com.au", "demo.orithos.com.au"]
