package com.orithos.modules.ai.invoice;

import com.orithos.common.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;
import org.springframework.web.multipart.MultipartFile;

@Component
public class NoopSupplierInvoiceIngest implements SupplierInvoiceIngestPort {

    private final boolean enabled;

    public NoopSupplierInvoiceIngest(
            @Value("${app.invoice.supplier-ingest-enabled:false}") boolean enabled) {
        this.enabled = enabled;
    }

    @Override
    public boolean isEnabled() {
        return enabled;
    }

    @Override
    public InvoiceScanSessionDtos.SessionView ingest(MultipartFile file, String supplierCode) {
        throw new BusinessException(50120,
                "Supplier invoice API ingest is reserved. Set SUPPLIER_INVOICE_INGEST_ENABLED and implement a vendor adapter when the supplier is confirmed.");
    }
}
