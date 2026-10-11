package com.orithos.modules.supplier;

import lombok.Data;

import java.util.ArrayList;
import java.util.List;

@Data
public class SupplierProductImportResult {
    private int imported;
    private int skipped;
    private List<SupplierProductImportError> errors = new ArrayList<>();
}
