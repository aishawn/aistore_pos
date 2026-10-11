package com.orithos.modules.externalstocktake;

import lombok.Data;

import java.math.BigDecimal;

@Data
public class ExternalStocktakeExportRow {
    private String outletName;
    private String barcode;
    private BigDecimal caseQuantity;
}
