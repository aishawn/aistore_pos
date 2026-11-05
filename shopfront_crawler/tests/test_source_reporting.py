from app.source_reporting import inventory_report_totals, inventory_snapshot_report_rows, merge_incremental_inventory_manifest


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


def test_persisted_inventory_snapshot_maps_to_report_rows_and_case_units():
    rows = inventory_snapshot_report_rows([
        {"product": {"id": "p1", "name": "Beer", "caseQuantity": 6},
         "inventory": [{"caseLevel": 2, "singleLevel": 3, "value": 100}]},
    ])
    assert rows == [{"ID": "p1", "Name": "Beer", "Case Quantity": 6, "Case Level": 2, "Item Level": 3, "Value (Inc) (Last)": 100}]
    assert inventory_report_totals(rows or [])['sellable_units'] == 15


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
