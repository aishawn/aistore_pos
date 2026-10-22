package com.orithos.modules.ai.invoice;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.security.AdminAccess;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.ArrayList;
import java.util.List;

/** Odoo-safe invoice OCR preview. It does not resolve or write supplier, product, or stock records. */
@RestController
@RequestMapping("/api/ai/invoice")
public class AiInvoicePreviewController {

    private final ObjectProvider<InvoiceVisionService> visionService;

    public AiInvoicePreviewController(ObjectProvider<InvoiceVisionService> visionService) {
        this.visionService = visionService;
    }

    @PostMapping(value = "/preview", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<InvoiceScanResponse> preview(@RequestParam("file") MultipartFile file) {
        AdminAccess.requireAdmin();
        InvoiceVisionService vision = visionService.getIfAvailable();
        if (vision == null) {
            throw new BusinessException(50301,
                    "Invoice preview is disabled. Set app.ai.enabled=true and AI_DASHSCOPE_API_KEY.");
        }
        return ApiResult.ok(toPreview(vision.read(file)));
    }

    private static InvoiceScanResponse toPreview(TaxInvoiceRead read) {
        InvoiceScanResponse response = new InvoiceScanResponse();
        response.setSupplierName(read.supplierName());
        response.setSupplierAbn(read.abn());
        response.setSupplierWebsite(read.website());
        response.setInvoiceNumber(read.invoiceNumber());
        response.setInvoiceDate(read.invoiceDate());
        response.setCustomerName(read.customerName());
        response.setCustomerAddress(read.customerAddress());
        response.setAttn(read.attn());
        response.setPhone(read.phone());
        response.setDeliveryFee(read.deliveryFee());
        response.setGstIncluded(read.gstIncluded());
        response.setTotalPayable(read.totalPayable());
        response.setTotalCases(read.totalCases());
        response.setNotes(read.notes());

        List<InvoiceScanLine> lines = new ArrayList<>();
        for (TaxInvoiceRead.Line source : read.lines()) {
            if (source == null) continue;
            InvoiceScanLine line = new InvoiceScanLine();
            line.setDescription(source.description());
            line.setBrand(source.brand());
            line.setPackQty(source.packQty());
            line.setQtyCases(source.qtyCases());
            line.setUnitPrice(source.unitPrice());
            line.setLineTotal(source.lineTotal());
            lines.add(line);
        }
        response.setLines(lines);
        return response;
    }
}
