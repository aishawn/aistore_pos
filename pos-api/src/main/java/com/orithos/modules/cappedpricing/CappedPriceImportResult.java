package com.orithos.modules.cappedpricing;

import java.util.List;

public record CappedPriceImportResult(int imported, int skipped, List<CappedPriceImportError> errors) {}
