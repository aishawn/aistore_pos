package com.orithos.modules.product;

import java.util.List;

public record ProductImportResult(int imported, int skipped, List<ProductImportError> errors) {}
