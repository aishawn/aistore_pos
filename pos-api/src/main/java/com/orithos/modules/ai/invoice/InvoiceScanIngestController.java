package com.orithos.modules.ai.invoice;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.security.AdminAccess;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * Reserved inbound endpoint for future supplier invoice APIs.
 * Returns 501 until a vendor adapter is configured.
 */
@RestController
@RequestMapping("/api/invoice-scans")
public class InvoiceScanIngestController {

    private final SupplierInvoiceIngestPort ingestPort;

    public InvoiceScanIngestController(SupplierInvoiceIngestPort ingestPort) {
        this.ingestPort = ingestPort;
    }

    @PostMapping(value = "/ingest", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<InvoiceScanSessionDtos.SessionView> ingest(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "supplierCode", required = false) String supplierCode) {
        AdminAccess.requireAdmin();
        if (!ingestPort.isEnabled()) {
            throw new BusinessException(50120,
                    "Supplier invoice API ingest is disabled. Keep SUPPLIER_INVOICE_INGEST_ENABLED=false until a vendor adapter is ready.");
        }
        return ApiResult.ok(ingestPort.ingest(file, supplierCode));
    }
}
