package com.orithos.modules.customer;

import java.util.List;

public record CustomerImportResult(int imported, int skipped, List<CustomerImportError> errors) {}
