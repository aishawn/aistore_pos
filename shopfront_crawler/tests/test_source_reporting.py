from datetime import datetime, timedelta, timezone

from app.source_reporting import dashboard_report_transaction_count, dashboard_sales_matching_report, inventory_manifest_status, inventory_report_totals, inventory_snapshot_is_fresh, inventory_snapshot_report_rows, merge_incremental_inventory_manifest


def test_inventory_snapshot_freshness_uses_utc_age_and_rejects_stale_or_future_data():
    now = datetime(2026, 11, 6, 12, 0, tzinfo=timezone.utc)
    assert inventory_snapshot_is_fresh(now - timedelta(hours=23, minutes=59), now=now)
    assert not inventory_snapshot_is_fresh(now - timedelta(hours=24, seconds=1), now=now)
    assert inventory_snapshot_is_fresh(now + timedelta(minutes=4), now=now)
    assert not inventory_snapshot_is_fresh(now + timedelta(minutes=6), now=now)
    assert not inventory_snapshot_is_fresh("not-a-timestamp", now=now)


def test_inventory_totals_convert_cases_and_items_and_exclude_negative_units():
    totals = inventory_report_totals([
        {"Case Quantity": 6, "Case Level": 2, "Item Level": 3},
        {"case_quantity": 12, "case_level": -1, "single_level": -2},
        {"case_quantity": 1, "case_level": 0, "single_level": 4},
    ])
    assert totals == {
        "sellable_units": 19.0,
        "negative_stock_products": 1.0,
        "inventory_metrics_complete": 1.0,
        "value_last_cost": 0.0,
        "value_last_cost_complete": 0.0,
    }


def test_inventory_totals_fail_closed_when_source_units_are_missing():
    totals = inventory_report_totals([
        {"Case Quantity": 6, "Case Level": 2, "Item Level": 3},
        {"Case Quantity": None, "Case Level": 1, "Item Level": 2},
    ])
    assert totals["sellable_units"] == 15
    assert totals["inventory_metrics_complete"] == 0


def test_inventory_snapshot_totals_convert_shopfront_graphql_case_and_item_levels():
    from app.source_reporting import inventory_snapshot_totals

    totals = inventory_snapshot_totals([
        {"inventory": {"caseLevel": 2, "singleLevel": 3}, "product": {"caseQuantity": 6}},
        {"inventory": {"caseLevel": -1, "singleLevel": -2}, "product": {"caseQuantity": 12}},
    ])
    assert totals == {
        "sellable_units": 15.0,
        "negative_stock_products": 1.0,
        "inventory_metrics_complete": 1.0,
    }


def test_inventory_snapshot_totals_fail_closed_without_pack_size():
    from app.source_reporting import inventory_snapshot_totals

    totals = inventory_snapshot_totals([
        {"inventory": {"caseLevel": 1, "singleLevel": 2}, "product": {}}
    ])
    assert totals["inventory_metrics_complete"] == 0


def test_incremental_inventory_manifest_adds_only_products_with_inventory_evidence():
    merged = merge_incremental_inventory_manifest(
        ["old-a", "old-b"],
        [{"id": "new-a", "inventory": []}, {"ID": "new-b", "inventory": None}],
    )
    assert merged == ["new-a", "new-b", "old-a", "old-b"]


def test_incremental_inventory_manifest_fails_closed_if_inventory_field_is_missing():
    assert merge_incremental_inventory_manifest(["old"], [{"id": "new"}]) is None


def test_inventory_manifest_status_fails_closed_on_unlisted_inventory_product():
    status = inventory_manifest_status(["p1"], ["p1", "p2"], True)
    assert status["complete"] is False
    assert status["products_match_manifest"] is False
    assert status["products_not_in_manifest"] == 1


def test_inventory_manifest_status_allows_zero_stock_products_without_rows():
    status = inventory_manifest_status(["p1", "p2"], ["p1"], True)
    assert status["complete"] is True
    assert status["products_with_inventory_rows"] == 1


def test_inventory_manifest_status_requires_declared_complete_snapshot():
    assert inventory_manifest_status(["p1"], ["p1"], False)["complete"] is False


def test_persisted_inventory_snapshot_maps_to_report_rows_and_case_units():
    rows = inventory_snapshot_report_rows([
        {"product": {"id": "p1", "name": "Beer", "caseQuantity": 6},
         "inventory": [{"caseLevel": 2, "singleLevel": 3, "value": 100}]},
    ])
    assert rows == [{"ID": "p1", "Name": "Beer", "Case Quantity": 6, "Case Level": 2, "Item Level": 3, "Value (Inc) (Last)": 100}]
    assert inventory_report_totals(rows or [])['sellable_units'] == 15
    assert inventory_report_totals(rows or [])['value_last_cost'] == 100


def test_persisted_inventory_snapshot_reconstructs_shopfront_last_cost_value():
    rows = inventory_snapshot_report_rows([
        {"product": {"id": "p1", "name": "Beer", "caseQuantity": 6, "lastCost": 30},
         "inventory": [{"caseLevel": 2, "singleLevel": 3}]},
    ])
    assert rows is not None
    assert rows[0]["Value (Inc) (Last)"] == 75
    totals = inventory_report_totals(rows)
    assert totals["value_last_cost"] == 75
    assert totals["value_last_cost_complete"] == 1


def test_inventory_value_total_is_incomplete_when_a_product_cost_is_missing():
    totals = inventory_report_totals([
        {"Case Quantity": 6, "Case Level": 1, "Item Level": 0, "Value (Inc) (Last)": 12},
        {"Case Quantity": 1, "Case Level": 0, "Item Level": 2, "Value (Inc) (Last)": None},
    ])
    assert totals["value_last_cost_complete"] == 0


def test_persisted_inventory_snapshot_accepts_one_database_inventory_row():
    rows = inventory_snapshot_report_rows([
        {"product": {"id": "p1", "name": "Beer", "caseQuantity": 6},
         "inventory": {"caseLevel": 2, "singleLevel": 3, "value": 100}},
    ])
    assert rows is not None
    assert len(rows) == 1
    assert inventory_report_totals(rows)["sellable_units"] == 15


def test_persisted_inventory_snapshot_fails_closed_without_pack_data():
    assert inventory_snapshot_report_rows([
        {"product": {"id": "p1"}, "inventory": [{"caseLevel": 2, "singleLevel": 3}]},
    ]) is None


def test_dashboard_metrics_include_reported_sales_statuses_when_count_matches():
    sales = [
        {"id": "s1", "status": "COMPLETED"},
        {"id": "s2", "status": "INCOMPLETE"},
    ]
    report = [{"Transaction Count": 2}]
    assert dashboard_report_transaction_count(report) == 2
    assert dashboard_sales_matching_report(sales, report) == sales


def test_dashboard_metrics_fail_closed_when_source_sales_count_differs():
    sales = [{"id": "s1", "status": "COMPLETED"}, {"id": "s2", "status": "INCOMPLETE"}]
    assert dashboard_sales_matching_report(sales, [{"Transaction Count": 1}]) is None


def test_dashboard_metrics_fail_closed_when_source_sale_status_is_missing():
    assert dashboard_sales_matching_report([{"id": "s1"}], [{"Transaction Count": 1}]) is None
