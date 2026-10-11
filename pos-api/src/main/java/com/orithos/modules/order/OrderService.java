package com.orithos.modules.order;

import com.orithos.common.BusinessException;
import com.orithos.common.PageResult;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.supplier.SupplierMapper;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

@Service
public class OrderService {

    private static final Set<String> GENERATE_STOCK_SOURCES = Set.of(
            "REORDER_LEVEL", "MINIMUM_STOCK", "BUYING_PERIOD");

    private final OrderMapper orderMapper;
    private final OutletMapper outletMapper;
    private final SupplierMapper supplierMapper;
    private final ProductMapper productMapper;

    public OrderService(OrderMapper orderMapper,
                        OutletMapper outletMapper,
                        SupplierMapper supplierMapper,
                        ProductMapper productMapper) {
        this.orderMapper = orderMapper;
        this.outletMapper = outletMapper;
        this.supplierMapper = supplierMapper;
        this.productMapper = productMapper;
    }

    /** Paginated order search for the Orders page Filter action. */
    public PageResult<Order> search(OrderListQuery query) {
        query.normalize();
        var items = orderMapper.page(query);
        long total = orderMapper.count(query);
        return PageResult.of(items, total, query.getPage(), query.getSize());
    }

    @Transactional
    public Order create(CreateOrderRequest request) {
        validateCreateRequest(request);

        Order order = new Order();
        order.setType("ORDER");
        order.setStatus("OPEN");
        order.setFromId(request.getFromId());
        order.setToId(request.getToId());
        order.setOrderDate(request.getOrderDate() != null ? request.getOrderDate() : LocalDate.now());
        order.setDueDate(request.getDueDate());
        order.setInvoiceNumber(request.getInvoiceNumber().trim());
        order.setReference(trimToNull(request.getReference()));
        order.setNotes(trimToNull(request.getNotes()));
        order.setInternalNotes(trimToNull(request.getInternalNotes()));
        order.setIncludeFreight(false);
        order.setTotalCost(BigDecimal.ZERO);
        order.setExpectedTotal(BigDecimal.ZERO);
        order.setCreatedById(CurrentUser.id());

        orderMapper.insert(order);
        return orderMapper.findById(order.getId());
    }

    @Transactional
    public Order createTransfer(CreateTransferRequest request) {
        validateCreateTransferRequest(request);

        Order order = new Order();
        order.setType("TRANSFER");
        order.setStatus("OPEN");
        order.setFromId(request.getFromId());
        order.setToId(request.getToId());
        order.setOrderDate(request.getTransferDate() != null ? request.getTransferDate() : LocalDate.now());
        order.setDueDate(request.getDueDate());
        order.setInvoiceNumber(request.getTransferNumber().trim());
        order.setReference(trimToNull(request.getReference()));
        order.setNotes(trimToNull(request.getNotes()));
        order.setInternalNotes(trimToNull(request.getInternalNotes()));
        order.setIncludeFreight(false);
        order.setTotalCost(BigDecimal.ZERO);
        order.setExpectedTotal(BigDecimal.ZERO);
        order.setCreatedById(CurrentUser.id());

        orderMapper.insert(order);
        return orderMapper.findById(order.getId());
    }

    @Transactional
    public Order createReceive(CreateReceiveRequest request) {
        validateCreateReceiveRequest(request);

        Order order = new Order();
        order.setType("ORDER");
        order.setStatus("RECEIVED");
        order.setFromId(request.getFromId());
        order.setToId(request.getToId());
        order.setOrderDate(request.getInvoiceDate() != null ? request.getInvoiceDate() : LocalDate.now());
        order.setDueDate(request.getDueDate());
        order.setInvoiceNumber(trimToNull(request.getInvoiceNumber()));
        order.setReference(trimToNull(request.getReference()));
        order.setNotes(trimToNull(request.getNotes()));
        order.setInternalNotes(trimToNull(request.getInternalNotes()));
        order.setIncludeFreight(false);
        order.setEnteredAs(trimToNull(request.getEnteredAs()));
        BigDecimal headerTotal = request.getTotalCost() != null ? request.getTotalCost() : BigDecimal.ZERO;
        order.setTotalCost(headerTotal);
        order.setExpectedTotal(headerTotal);
        order.setCreatedById(CurrentUser.id());

        orderMapper.insert(order);
        Long userId = CurrentUser.id();
        if (userId != null) {
            orderMapper.setReceivedMeta(order.getId(), userId);
        } else {
            orderMapper.markReceived(order.getId());
        }
        persistReceiveLines(order.getId(), request.getFromId(), request.getToId(), request.getProducts());
        Order saved = orderMapper.findById(order.getId());
        saved.setProducts(orderMapper.findProductsByOrderId(order.getId()));
        return saved;
    }

    @Transactional
    public Order createReturn(CreateReturnRequest request) {
        validateCreateReturnRequest(request);

        Order order = new Order();
        order.setType("RETURN");
        order.setStatus("OPEN");
        order.setFromId(request.getFromId());
        order.setToId(request.getToId());
        order.setOrderDate(request.getOrderDate() != null ? request.getOrderDate() : LocalDate.now());
        order.setDueDate(request.getDueDate());
        order.setInvoiceNumber(trimToNull(request.getOrderNumber()));
        order.setReference(trimToNull(request.getReference()));
        order.setNotes(trimToNull(request.getNotes()));
        order.setInternalNotes(trimToNull(request.getInternalNotes()));
        order.setIncludeFreight(false);
        order.setTotalCost(BigDecimal.ZERO);
        order.setExpectedTotal(BigDecimal.ZERO);
        order.setCreatedById(CurrentUser.id());

        orderMapper.insert(order);
        return orderMapper.findById(order.getId());
    }

    @Transactional
    public Order createCredit(CreateCreditRequest request) {
        validateCreateCreditRequest(request);

        Order order = new Order();
        order.setType("CREDIT");
        order.setStatus("OPEN");
        order.setFromId(request.getFromId());
        order.setToId(request.getToId());
        order.setOrderDate(request.getCreditNoteDate() != null ? request.getCreditNoteDate() : LocalDate.now());
        order.setDueDate(request.getDueDate());
        order.setInvoiceNumber(request.getCreditNoteNumber().trim());
        order.setReference(trimToNull(request.getReference()));
        order.setNotes(trimToNull(request.getNotes()));
        order.setInternalNotes(trimToNull(request.getInternalNotes()));
        order.setIncludeFreight(false);
        order.setTotalCost(BigDecimal.ZERO);
        order.setExpectedTotal(BigDecimal.ZERO);
        order.setCreatedById(CurrentUser.id());

        orderMapper.insert(order);
        return orderMapper.findById(order.getId());
    }

    private void validateCreateCreditRequest(CreateCreditRequest request) {
        if (request == null) {
            throw new BusinessException("Request body is required.");
        }
        if (request.getFromId() == null) {
            throw new BusinessException("Supplier is required.");
        }
        if (supplierMapper.findById(request.getFromId()) == null) {
            throw new BusinessException("Supplier not found.");
        }
        if (request.getToId() == null) {
            throw new BusinessException("Destination outlet is required.");
        }
        if (outletMapper.findById(request.getToId()) == null) {
            throw new BusinessException("Destination outlet not found.");
        }
        if (request.getCreditNoteNumber() == null || request.getCreditNoteNumber().isBlank()) {
            throw new BusinessException("Credit note number is required.");
        }
        String creditNoteNumber = request.getCreditNoteNumber().trim();
        if (orderMapper.countByInvoiceNumber(creditNoteNumber) > 0) {
            throw new BusinessException("Credit note number already exists.");
        }
        LocalDate creditNoteDate = request.getCreditNoteDate() != null ? request.getCreditNoteDate() : LocalDate.now();
        if (request.getDueDate() != null && request.getDueDate().isBefore(creditNoteDate)) {
            throw new BusinessException("Due date cannot be before credit note date.");
        }
    }

    private void validateCreateReturnRequest(CreateReturnRequest request) {
        if (request == null) {
            throw new BusinessException("Request body is required.");
        }
        if (request.getFromId() == null) {
            throw new BusinessException("Source outlet is required.");
        }
        if (outletMapper.findById(request.getFromId()) == null) {
            throw new BusinessException("Source outlet not found.");
        }
        if (request.getToId() == null) {
            throw new BusinessException("Supplier is required.");
        }
        if (supplierMapper.findById(request.getToId()) == null) {
            throw new BusinessException("Supplier not found.");
        }
        String orderNumber = trimToNull(request.getOrderNumber());
        if (orderNumber != null && orderMapper.countByInvoiceNumber(orderNumber) > 0) {
            throw new BusinessException("Order number already exists.");
        }
        LocalDate orderDate = request.getOrderDate() != null ? request.getOrderDate() : LocalDate.now();
        if (request.getDueDate() != null && request.getDueDate().isBefore(orderDate)) {
            throw new BusinessException("Due date cannot be before order date.");
        }
    }

    private void validateCreateReceiveRequest(CreateReceiveRequest request) {
        if (request == null) {
            throw new BusinessException("Request body is required.");
        }
        if (request.getFromId() == null) {
            throw new BusinessException("Supplier is required.");
        }
        if (supplierMapper.findById(request.getFromId()) == null) {
            throw new BusinessException("Supplier not found.");
        }
        if (request.getToId() == null) {
            throw new BusinessException("Destination outlet is required.");
        }
        if (outletMapper.findById(request.getToId()) == null) {
            throw new BusinessException("Destination outlet not found.");
        }
        String invoiceNumber = trimToNull(request.getInvoiceNumber());
        if (invoiceNumber != null && orderMapper.countByInvoiceNumber(invoiceNumber) > 0) {
            throw new BusinessException("Invoice number already exists.");
        }
        LocalDate invoiceDate = request.getInvoiceDate() != null ? request.getInvoiceDate() : LocalDate.now();
        if (request.getDueDate() != null && request.getDueDate().isBefore(invoiceDate)) {
            throw new BusinessException("Due date cannot be before invoice date.");
        }
    }

    private void validateCreateTransferRequest(CreateTransferRequest request) {
        if (request == null) {
            throw new BusinessException("Request body is required.");
        }
        if (request.getFromId() == null) {
            throw new BusinessException("Source outlet is required.");
        }
        if (request.getToId() == null) {
            throw new BusinessException("Destination outlet is required.");
        }
        if (request.getFromId().equals(request.getToId())) {
            throw new BusinessException("Source and destination outlets must be different.");
        }
        if (outletMapper.findById(request.getFromId()) == null) {
            throw new BusinessException("Source outlet not found.");
        }
        if (outletMapper.findById(request.getToId()) == null) {
            throw new BusinessException("Destination outlet not found.");
        }
        if (request.getTransferNumber() == null || request.getTransferNumber().isBlank()) {
            throw new BusinessException("Transfer number is required.");
        }
        String transferNumber = request.getTransferNumber().trim();
        if (orderMapper.countByInvoiceNumber(transferNumber) > 0) {
            throw new BusinessException("Transfer number already exists.");
        }
        LocalDate transferDate = request.getTransferDate() != null ? request.getTransferDate() : LocalDate.now();
        if (request.getDueDate() != null && request.getDueDate().isBefore(transferDate)) {
            throw new BusinessException("Due date cannot be before transfer date.");
        }
    }

    private void validateCreateRequest(CreateOrderRequest request) {
        if (request == null) {
            throw new BusinessException("Request body is required.");
        }
        if (request.getToId() == null) {
            throw new BusinessException("Destination outlet is required.");
        }
        if (outletMapper.findById(request.getToId()) == null) {
            throw new BusinessException("Destination outlet not found.");
        }
        if (request.getFromId() != null && supplierMapper.findById(request.getFromId()) == null) {
            throw new BusinessException("Supplier not found.");
        }
        if (request.getInvoiceNumber() == null || request.getInvoiceNumber().isBlank()) {
            throw new BusinessException("Order number is required.");
        }
        String invoiceNumber = request.getInvoiceNumber().trim();
        if (orderMapper.countByInvoiceNumber(invoiceNumber) > 0) {
            throw new BusinessException("Order number already exists.");
        }
        if (request.getDueDate() != null
                && request.getOrderDate() != null
                && request.getDueDate().isBefore(request.getOrderDate())) {
            throw new BusinessException("Due date cannot be before order date.");
        }
        String generateFrom = trimToNull(request.getGenerateStockFrom());
        if (generateFrom != null && !GENERATE_STOCK_SOURCES.contains(generateFrom)) {
            throw new BusinessException("Invalid generate stock source.");
        }
    }

    private void persistReceiveLines(Long orderId, Long supplierId, Long outletId, List<ReceiveLineRequest> lines) {
        if (lines == null || lines.isEmpty()) {
            return;
        }
        BigDecimal total = BigDecimal.ZERO;
        int count = 0;
        for (ReceiveLineRequest line : lines) {
            if (line == null || line.getProductId() == null) {
                continue;
            }
            BigDecimal cases = nz(line.getQuantity());
            BigDecimal pack = nz(line.getCaseQuantity());
            if (pack.compareTo(BigDecimal.ZERO) <= 0) {
                pack = BigDecimal.ONE;
            }
            BigDecimal caseCost = nz(line.getUnitPrice());
            BigDecimal lineTotal = caseCost.multiply(cases);
            total = total.add(lineTotal);
            count++;

            OrderProduct row = new OrderProduct();
            row.setOrderId(orderId);
            row.setProductId(line.getProductId());
            row.setSupplierId(supplierId);
            row.setSupplierCode(trimToNull(line.getDescription()));
            row.setCaseQuantity(pack);
            row.setOrderedQuantity(cases);
            row.setReceivedQuantity(cases);
            row.setBaseCost(caseCost);
            row.setOrderedCost(caseCost);
            row.setFees(BigDecimal.ZERO);
            row.setFreight(BigDecimal.ZERO);
            row.setRebate(BigDecimal.ZERO);
            orderMapper.insertProduct(row);

            BigDecimal units = cases.multiply(pack);
            if (outletId != null && units.compareTo(BigDecimal.ZERO) > 0) {
                productMapper.adjustInventory(line.getProductId(), outletId, units);
            }
        }
        orderMapper.updateTotals(orderId, total, total, count, "INCLUSIVE");
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
