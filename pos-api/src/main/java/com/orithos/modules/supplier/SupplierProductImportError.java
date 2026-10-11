package com.orithos.modules.supplier;

import lombok.AllArgsConstructor;
import lombok.Data;

@Data
@AllArgsConstructor
public class SupplierProductImportError {
    private int line;
    private String message;
}
