package com.orithos.modules.ai.invoice;

import org.springframework.web.multipart.MultipartFile;

/**
 * Extension point for supplier-provided invoice APIs.
 * Adapters will pull or accept vendor payloads and create draft scan sessions.
 */
public interface SupplierInvoiceIngestPort {

    boolean isEnabled();

    InvoiceScanSessionDtos.SessionView ingest(MultipartFile file, String supplierCode);
}
