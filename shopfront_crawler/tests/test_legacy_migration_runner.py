from __future__ import annotations

import httpx
import pytest

from scripts import migrate_legacy_crawler as migration


def test_sales_page_rows_reads_months_under_one_snapshot(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEGACY_MIGRATION_SALES_START_YEAR", "2026")

    def fake_request(_client, _method, _url, *, params, **_kwargs):
        if "from" not in params:
            return {"data": [], "pagination": {"total": 4, "snapshot_id": 99}}
        month = params["from"][5:7]
        all_rows = {
            "01": [
                {"shopfront_sale_id": "s1"},
                {"shopfront_sale_id": "s2"},
                {"shopfront_sale_id": "s3"},
            ],
            "02": [{"shopfront_sale_id": "s4"}],
        }.get(month, [])
        page = params["page"]
        size = params["size"]
        rows = all_rows[(page - 1) * size : page * size]
        return {
            "data": rows,
            "pagination": {"total": len(all_rows), "snapshot_id": params["snapshot_id"]},
        }

    monkeypatch.setattr(migration, "api_request", fake_request)
    with httpx.Client() as client:
        batches = list(migration.sales_page_rows(client, "https://source", {}, size=2))

    assert [row["shopfront_sale_id"] for rows, _ in batches for row in rows] == ["s1", "s2", "s3", "s4"]


def test_sales_page_rows_rejects_partition_count_gap(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("LEGACY_MIGRATION_SALES_START_YEAR", "2026")

    def fake_request(_client, _method, _url, *, params, **_kwargs):
        if "from" not in params:
            return {"data": [], "pagination": {"total": 2, "snapshot_id": 99}}
        rows = [{"shopfront_sale_id": "s1"}] if params["from"].startswith("2026-01") else []
        return {"data": rows, "pagination": {"total": len(rows), "snapshot_id": params["snapshot_id"]}}

    monkeypatch.setattr(migration, "api_request", fake_request)
    with httpx.Client() as client, pytest.raises(RuntimeError, match="found 1 of 2"):
        list(migration.sales_page_rows(client, "https://source", {}, size=10))
