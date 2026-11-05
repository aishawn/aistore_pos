import asyncio
from datetime import datetime
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.config import Settings


def test_startup_constructs_valid_daily_cron_for_all_configured_hours(monkeypatch):
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
    monkeypatch.setattr(main, "settings", Settings(sync_daily_hours="18,2,10,23,2"))
    asyncio.run(main.startup())

    trigger = jobs["shopfront-sync"]
    zone = ZoneInfo("Australia/Adelaide")
    for current_hour, current_minute, next_hour, next_day in [
        (1, 59, 2, 4), (2, 1, 10, 4), (10, 1, 18, 4),
        (18, 1, 23, 4), (23, 1, 2, 5)
    ]:
        following = trigger.get_next_fire_time(
            None, datetime(2026, 11, 4, current_hour, current_minute, tzinfo=zone)
        )
        assert (following.day, following.hour, following.minute) == (next_day, next_hour, 0)


def test_nightly_sync_uses_a_short_incremental_window():
    from app.main import scheduled_sync_range

    zone = ZoneInfo("Australia/Adelaide")
    assert Settings().daily_sync_hours() == [6, 23]
    assert scheduled_sync_range(datetime(2026, 11, 4, 23, 0, tzinfo=zone), 3) == (datetime(2026, 11, 3).date(), datetime(2026, 11, 4).date())
    assert scheduled_sync_range(datetime(2026, 11, 5, 6, 0, tzinfo=zone), 10) == (
        datetime(2026, 11, 3).date(), datetime(2026, 11, 4).date()
    )


def test_daily_sync_does_not_expand_to_previous_week_on_monday():
    from app.main import scheduled_sync_range

    zone = ZoneInfo("Australia/Adelaide")
    assert scheduled_sync_range(datetime(2026, 11, 9, 6, 0, tzinfo=zone), 10) == (datetime(2026, 11, 7).date(), datetime(2026, 11, 8).date())
    assert scheduled_sync_range(datetime(2026, 11, 8, 23, 0, tzinfo=zone), 10) == (datetime(2026, 11, 7).date(), datetime(2026, 11, 8).date())


def test_shopfront_sync_notifies_both_mapped_store_hosts():
    from app.main import POS_UI_NOTIFY_HOSTS

    assert POS_UI_NOTIFY_HOSTS["skr"] == ["skr.orithos.com.au", "demo.orithos.com.au"]
