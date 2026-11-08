package com.orithos.modules.ai.invoice;

import com.orithos.common.BusinessException;
import com.orithos.modules.order.CreateReceiveRequest;
import com.orithos.modules.order.Order;
import com.orithos.modules.order.OrderService;
import com.orithos.modules.order.ReceiveLineRequest;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.ProductService;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.register.Outlet;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.supplier.Supplier;
import com.orithos.modules.supplier.SupplierDetail;
import com.orithos.modules.supplier.SupplierMapper;
import com.orithos.modules.supplier.SupplierService;
import com.orithos.security.CurrentUser;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

@Service
public class InvoiceScanService {

    private final ObjectProvider<InvoiceVisionService> visionService;
    private final SupplierMapper supplierMapper;
    private final SupplierService supplierService;
    private final ProductMapper productMapper;
    private final ProductService productService;
    private final OutletMapper outletMapper;
    private final OrderService orderService;

    public InvoiceScanService(
            ObjectProvider<InvoiceVisionService> visionService,
            SupplierMapper supplierMapper,
            SupplierService supplierService,
            ProductMapper productMapper,
            ProductService productService,
            OutletMapper outletMapper,
            OrderService orderService) {
        this.visionService = visionService;
        this.supplierMapper = supplierMapper;
        this.supplierService = supplierService;
        this.productMapper = productMapper;
        this.productService = productService;
        this.outletMapper = outletMapper;
        this.orderService = orderService;
    }

    public InvoiceScanResponse scan(MultipartFile file) {
        InvoiceVisionService vision = visionService.getIfAvailable();
        if (vision == null) {
            throw new BusinessException(50301,
                    "Invoice scan is disabled. Configure app.ai.enabled and the remote AI service.");
        }
        return toResponse(vision.read(file));
    }

    @Transactional
    public Order save(InvoiceScanResponse request) {
        // Pilot SoT is Odoo. Do not write supplier receives into Classic PostgreSQL.
        throw new BusinessException(50101,
                "Saving invoice receives into Classic PostgreSQL is disabled. Use Odoo Purchases or Replenishment to create a draft RFQ.");
    }

    /** Retained for reference; Classic receive path must stay disabled while Odoo is SoT. */
    @Transactional
    private Order saveClassic(InvoiceScanResponse request) {
        if (request == null) {
            throw new BusinessException("Request body is required.");
        }
        Long toId = resolveOutletId(request.getToId());
        Long supplierId = resolveOrCreateSupplier(request);
        List<ReceiveLineRequest> lines = new ArrayList<>();
        if (request.getLines() != null) {
            for (InvoiceScanLine line : request.getLines()) {
                ReceiveLineRequest row = resolveOrCreateProduct(line, supplierId);
                if (row != null) {
                    lines.add(row);
                }
            }
        }
        CreateReceiveRequest receive = new CreateReceiveRequest();
        receive.setFromId(supplierId);
        receive.setToId(toId);
        receive.setInvoiceDate(request.getInvoiceDate());
        receive.setDueDate(request.getDueDate());
        receive.setInvoiceNumber(trimToNull(request.getInvoiceNumber()));
        receive.setNotes(buildNotes(request));
        receive.setInternalNotes(StringUtils.hasText(request.getInternalNotes())
                ? request.getInternalNotes().trim()
                : "Imported from supplier tax invoice photo via OCR.");
        receive.setEnteredAs("INCLUSIVE");
        receive.setTotalCost(request.getTotalPayable());
        receive.setProducts(lines);
        return orderService.createReceive(receive, "invoice-scan-" + UUID.randomUUID());
    }

    InvoiceScanResponse toResponse(TaxInvoiceRead read) {
        InvoiceScanResponse response = new InvoiceScanResponse();
        String supplierName = trimToNull(read.supplierName());
        String abn = trimToNull(read.abn());
        Supplier matched = null;
        if (supplierName != null || abn != null) {
            matched = supplierMapper.findByNameOrAbn(supplierName, digits(abn));
        }
        response.setSupplierId(matched == null ? null : matched.getId());
        response.setSupplierName(supplierName);
        response.setSupplierAbn(abn);
        response.setSupplierWebsite(trimToNull(read.website()));
        response.setCreateSupplier(matched == null && supplierName != null);
        response.setToId(resolveOutletId(null));
        response.setInvoiceNumber(trimToNull(read.invoiceNumber()));
        response.setInvoiceDate(read.invoiceDate());
        response.setCustomerName(trimToNull(read.customerName()));
        response.setCustomerAddress(trimToNull(read.customerAddress()));
        response.setAttn(trimToNull(read.attn()));
        response.setPhone(trimToNull(read.phone()));
        response.setDeliveryFee(read.deliveryFee());
        response.setGstIncluded(read.gstIncluded());
        response.setTotalPayable(read.totalPayable());
        response.setTotalCases(read.totalCases());
        response.setNotes(trimToNull(read.notes()));
        response.setInternalNotes("Imported from supplier tax invoice photo via OCR.");

        List<InvoiceScanLine> lines = new ArrayList<>();
        if (read.lines() != null) {
            for (TaxInvoiceRead.Line src : read.lines()) {
                if (src == null || !StringUtils.hasText(src.description())) continue;
                InvoiceScanLine line = new InvoiceScanLine();
                String description = src.description().trim();
                Product product = productMapper.findActiveByName(description);
                line.setProductId(product == null ? null : product.getId());
                line.setDescription(description);
                line.setBrand(trimToNull(src.brand()));
                line.setPackQty(src.packQty());
                line.setQtyCases(src.qtyCases());
                line.setUnitPrice(src.unitPrice());
                line.setLineTotal(src.lineTotal());
                line.setCreateProduct(product == null);
                lines.add(line);
            }
        }
        response.setLines(lines);
        return response;
    }

    private Long resolveOrCreateSupplier(InvoiceScanResponse request) {
        if (request.getSupplierId() != null) {
            if (supplierMapper.findById(request.getSupplierId()) == null) {
                throw new BusinessException("Supplier not found.");
            }
            return request.getSupplierId();
        }
        String name = trimToNull(request.getSupplierName());
        String abn = trimToNull(request.getSupplierAbn());
        Supplier existing = supplierMapper.findByNameOrAbn(name, digits(abn));
        if (existing != null) {
            return existing.getId();
        }
        if (name == null) {
            throw new BusinessException("Supplier is required.");
        }
        SupplierDetail detail = new SupplierDetail();
        detail.setName(name);
        detail.setBusinessNumber(abn);
        detail.setWebsite(trimToNull(request.getSupplierWebsite()));
        detail.setDefaultOrderTax("INCLUSIVE");
        detail.setStatus("ACTIVE");
        return supplierService.create(detail).getId();
    }

    private ReceiveLineRequest resolveOrCreateProduct(InvoiceScanLine line, Long supplierId) {
        if (line == null) return null;
        String description = trimToNull(line.getDescription());
        Long productId = line.getProductId();
        if (productId == null && description != null) {
            Product existing = productMapper.findActiveByName(description);
            if (existing != null) {
                productId = existing.getId();
            } else if (line.isCreateProduct()) {
                Product created = new Product();
                created.setName(description);
                BigDecimal pack = line.getPackQty() != null && line.getPackQty().compareTo(BigDecimal.ZERO) > 0
                        ? line.getPackQty() : BigDecimal.ONE;
                created.setCaseQuantity(pack);
                if (line.getUnitPrice() != null && pack.compareTo(BigDecimal.ZERO) > 0) {
                    created.setCost(line.getUnitPrice().divide(pack, 4, RoundingMode.HALF_UP));
                }
                created = productService.create(created);
                productId = created.getId();
            }
        }
        if (productId == null) {
            return null;
        }
        List<Long> linked = productMapper.findSupplierIdsByProductId(productId);
        if (supplierId != null && (linked == null || !linked.contains(supplierId))) {
            productMapper.insertSupplier(productId, supplierId);
        }
        ReceiveLineRequest row = new ReceiveLineRequest();
        row.setProductId(productId);
        row.setDescription(description);
        row.setCaseQuantity(line.getPackQty());
        row.setQuantity(line.getQtyCases());
        row.setUnitPrice(line.getUnitPrice());
        return row;
    }

    private Long resolveOutletId(Long requested) {
        if (requested != null) {
            if (outletMapper.findById(requested) == null) {
                throw new BusinessException("Destination outlet not found.");
            }
            return requested;
        }
        Long current = CurrentUser.outletId();
        if (current != null && outletMapper.findById(current) != null) {
            return current;
        }
        List<Outlet> outlets = outletMapper.findAll();
        if (outlets == null || outlets.isEmpty()) {
            throw new BusinessException("Destination outlet is required.");
        }
        return outlets.get(0).getId();
    }

    private static String buildNotes(InvoiceScanResponse request) {
        if (StringUtils.hasText(request.getNotes())) {
            return request.getNotes().trim();
        }
        StringBuilder notes = new StringBuilder();
        if (StringUtils.hasText(request.getCustomerName())) {
            notes.append("Customer: ").append(request.getCustomerName().trim());
            if (StringUtils.hasText(request.getAttn())) {
                notes.append(", Attn ").append(request.getAttn().trim());
            }
            notes.append('\n');
        }
        if (StringUtils.hasText(request.getCustomerAddress())) {
            notes.append(request.getCustomerAddress().trim()).append('\n');
        }
        if (StringUtils.hasText(request.getPhone())) {
            notes.append("Tel: ").append(request.getPhone().trim()).append('\n');
        }
        if (request.getTotalCases() != null) {
            notes.append("Total delivered cases: ").append(request.getTotalCases().stripTrailingZeros().toPlainString()).append('\n');
        }
        if (request.getGstIncluded() != null) {
            notes.append("GST included: $").append(request.getGstIncluded().toPlainString()).append('\n');
        }
        if (StringUtils.hasText(request.getSupplierAbn())) {
            notes.append("ABN: ").append(request.getSupplierAbn().trim());
        }
        String text = notes.toString().trim();
        return text.isEmpty() ? null : text;
    }

    private static String digits(String raw) {
        if (!StringUtils.hasText(raw)) return raw;
        String d = raw.replaceAll("\\s+", "");
        return d.isEmpty() ? raw : d;
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
