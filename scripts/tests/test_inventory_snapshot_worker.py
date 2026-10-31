import importlib.util
from datetime import datetime, timezone, timedelta
from pathlib import Path
from types import SimpleNamespace

import pytest

SPEC = importlib.util.spec_from_file_location("inventory_worker", Path(__file__).parents[1] / "ai-eval/inventory-snapshot-worker.py")
worker = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(worker)
NOW = datetime(2026, 10, 31, 16, 0, tzinfo=timezone.utc)
TARGET = {"companyId": 5, "timezone": "Australia/Adelaide"}


def test_collector_blocks_business_writes_before_any_network_call():
    spec = importlib.util.spec_from_file_location("readonly_collector", Path(__file__).parents[1] / "ai-eval/fetch-skr-inventory-snapshot.py")
    collector = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(collector)
    client = object.__new__(collector.Odoo)
    for method in ("create", "write", "unlink", "action_confirm"):
        with pytest.raises(RuntimeError, match="only permits read methods"):
            client.call("/web/dataset/call_kw", {"method": method})


def snapshot(company_id=5, captured=NOW):
    return {"companyId": company_id, "database": "aipos_uat", "scopeVersion": 2,
            "source": "odoo-readonly-jsonrpc", "capturedAt": captured.isoformat(),
            "businessDate": captured.astimezone(worker.ZoneInfo(TARGET["timezone"])).date().isoformat(),
            "businessTimezone": TARGET["timezone"],
            "coverage": {"expectedProducts": 1, "expectedWarehouses": 1},
            "products": [{"productId": 10, "availableQty": -2, "virtualAvailableQty": -2,
                          "incomingQty": 0, "outgoingQty": 0, "cost": 10, "leadTimeDays": None}],
            "warehouseInventory": [{"warehouseId": 1, "quantities": [{"id": 10, "qty_available": -2,
                                      "virtual_available": -2, "incoming_qty": 0, "outgoing_qty": 0}]}]}


def save(root, value):
    path = root / str(value["companyId"]) / value["businessDate"] / "inventory.json"
    worker.atomic_json(path, value)
    return path


def test_summary_rejects_wrong_company_database_and_incomplete_warehouse():
    value = snapshot()
    with pytest.raises(ValueError):
        worker.summarise(value, 127, "aipos_uat")
    with pytest.raises(ValueError):
        worker.summarise(value, 5, "other")
    value["warehouseInventory"][0]["quantities"] = []
    with pytest.raises(ValueError):
        worker.summarise(value, 5, "aipos_uat")


def test_summary_counts_null_and_nonfinite_without_erasing_negative_stock():
    value = snapshot()
    value["products"][0]["availableQty"] = float("nan")
    summary = worker.summarise(value, 5, "aipos_uat")
    assert summary["missingFields"]["availableQty"] == 1
    assert summary["missingFields"]["virtualAvailableQty"] == 0
    assert summary["missingFields"]["leadTimeDays"] == 1


def test_existing_capture_survives_worker_replacement_and_reports_real_gaps(tmp_path):
    save(tmp_path, snapshot(captured=NOW-timedelta(days=2)))
    latest = save(tmp_path, snapshot())
    before = latest.read_bytes()
    def no_network(*args, **kwargs):
        raise AssertionError("A saved successful day must not be recaptured")
    result = worker.capture(tmp_path, TARGET, "aipos_uat", NOW, run=no_network)
    assert result["lastAttemptStatus"] == "SUCCESS"
    assert result["observedDays"] == 2
    assert result["gapDays"] == 1
    assert latest.read_bytes() == before
    assert not list(tmp_path.rglob("*.tmp"))


def test_failure_retains_last_success_and_does_not_count_a_partial_file(tmp_path):
    save(tmp_path, snapshot())
    success = worker.capture(tmp_path, TARGET, "aipos_uat", NOW)
    next_day = NOW+timedelta(days=1)
    def fail(*args, **kwargs):
        return SimpleNamespace(returncode=1)
    result = worker.capture(tmp_path, TARGET, "aipos_uat", next_day, run=fail)
    assert result["lastAttemptStatus"] == "FAILED"
    assert result["lastSuccessAt"] == success["lastSuccessAt"]
    assert result["observedDays"] == 1
    assert not worker.due(next_day+timedelta(minutes=1), TARGET, result, False)
    assert worker.due(next_day+timedelta(hours=1), TARGET, result, False)


def test_company_targets_are_saved_separately_with_explicit_collector_context(tmp_path, monkeypatch):
    monkeypatch.setenv("ODOO_DATABASE", "aipos_uat")
    calls = []
    def run(*args, **kwargs):
        env = kwargs["env"]
        company_id = int(env["SKR_ODOO_COMPANY_ID"])
        value = snapshot(company_id)
        path = Path(env["SKR_INVENTORY_SNAPSHOT_ROOT"]) / value["businessDate"] / "inventory.json"
        worker.atomic_json(path, value)
        calls.append(company_id)
        return SimpleNamespace(returncode=0)
    a = worker.capture(tmp_path, TARGET, "aipos_uat", NOW, run=run)
    b = worker.capture(tmp_path, {**TARGET, "companyId": 127}, "aipos_uat", NOW, run=run)
    assert calls == [5, 127]
    assert a["companyId"] == 5 and b["companyId"] == 127
    assert a["observedDays"] == b["observedDays"] == 1


def test_daily_due_uses_store_clock_and_handles_dst_day():
    # Adelaide is already November 1 although transport date is October 31.
    assert worker.due(NOW, TARGET, {}, False)
    assert not worker.due(NOW, TARGET, {"latestBusinessDate": "2026-11-01"}, True)
    before_two = datetime(2026, 4, 4, 14, 0, tzinfo=timezone.utc)
    assert not worker.due(before_two, TARGET, {}, False)
    assert worker.due(before_two, TARGET, {}, True)
    assert worker.due(before_two+timedelta(hours=2), TARGET, {}, False)
