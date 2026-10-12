package com.orithos.modules.supplychain;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class SupplySettingsView {
    private List<SupplyChainRows.SupplierRow> suppliers = new ArrayList<>();
    private List<SupplyChainRows.PrefRow> preferences = new ArrayList<>();
    private List<SupplyChainRows.PriceRow> prices = new ArrayList<>();
    private List<SupplyChainRows.DealRow> deals = new ArrayList<>();
    private List<SupplyChainRows.RuleRow> rules = new ArrayList<>();
    private List<SupplyChainRows.EventRow> events = new ArrayList<>();
}
