package com.orithos.modules.order;

import com.orithos.common.BusinessException;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.common.PageResult;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.supplier.SupplierMapper;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashSet;
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
    private final BusinessTimezoneService businessTimezone;

    public OrderService(OrderMapper orderMapper,
                        OutletMapper outletMapper,
                        SupplierMapper supplierMapper,
                        ProductMapper productMapper,
                        BusinessTimezoneService businessTimezone) {
        this.orderMapper = orderMapper;
        this.outletMapper = outletMapper;
        this.supplierMapper = supplierMapper;
        this.productMapper = productMapper;
        this.businessTimezone = businessTimezone;
    }

    /** Paginated order search for the Orders page Filter action. */
    public PageResult<Order> search(OrderListQuery query) {
        if (query.getVendorId() == null) throw new BusinessException(40310, "Tenant context is required.");
        query.normalize();
        var items = orderMapper.page(query);
        long total = orderMapper.count(query);
        return PageResult.of(items, total, query.getPage(), query.getSize());
    }

    @Transactional
    public PurchaseReceiptResult receivePurchaseOrder(Long orderId, String rawIdempotencyKey,
                                                       PurchaseReceiptRequest request) {
        Long vendorId = requireVendorId();
        String idempotencyKey = trimToNull(rawIdempotencyKey);
        if (idempotencyKey == null || idempotencyKey.length() > 200) {
            throw new BusinessException("A valid Idempotency-Key is required.");
        }
        if (orderMapper.lockReceiptIdempotencyKey(vendorId, idempotencyKey) == null) {
            throw new IllegalStateException("Could not acquire receipt idempotency lock.");
        }
        if (request == null || request.lines() == null || request.lines().isEmpty()) {
            throw new BusinessException("At least one receipt line is required.");
        }
        String requestHash = receiptRequestHash(orderId, request);
        Order order = orderMapper.lockPurchaseOrderForVendor(orderId, vendorId);
        if (order == null) throw new BusinessException(40410, "Order not found.");
        Long userOutlet = CurrentUser.outletId();
        if (userOutlet != null && !userOutlet.equals(order.getOutletId())) {
            throw new BusinessException(40410, "Order not found.");
        }
        PurchaseReceipt previous = orderMapper.findReceiptByKey(vendorId, idempotencyKey);
        if (previous != null) {
            if (!orderId.equals(previous.getOrderId()) || !requestHash.equals(previous.getRequestHash())) {
                throw new BusinessException("Idempotency-Key was already used with a different receipt.");
            }
            return new PurchaseReceiptResult(previous.getId(), previous.getOrderId(),
                    previous.getStatus(), previous.getReceivedAt(), true);
        }
        if (!"ORDER".equals(order.getType()) || !Set.of("OPEN", "SENT", "PARTIALLY_RECEIVED").contains(order.getStatus())) {
            throw new BusinessException("This purchase order cannot receive stock in its current state.");
        }

        PurchaseReceipt receipt = new PurchaseReceipt();
        receipt.setVendorId(vendorId);
        receipt.setOrderId(orderId);
        receipt.setOutletId(order.getOutletId());
        receipt.setIdempotencyKey(idempotencyKey);
        receipt.setRequestHash(requestHash);
        receipt.setStatus("PROCESSING");
        receipt.setReceivedById(CurrentUser.id());
        if (orderMapper.insertReceipt(receipt) == 0) {
            PurchaseReceipt raced = orderMapper.findReceiptByKey(vendorId, idempotencyKey);
            if (raced == null || !orderId.equals(raced.getOrderId()) || !requestHash.equals(raced.getRequestHash())) {
                throw new BusinessException("Idempotency-Key was already used with a different receipt.");
            }
            return new PurchaseReceiptResult(raced.getId(), raced.getOrderId(), raced.getStatus(), raced.getReceivedAt(), true);
        }

        Set<Long> seenLines = new HashSet<>();
        for (PurchaseReceiptRequest.Line requested : request.lines()) {
            if (requested == null || requested.orderProductId() == null || requested.quantity() == null
                    || requested.quantity().signum() <= 0 || requested.quantity().scale() > 4
                    || !seenLines.add(requested.orderProductId())) {
                throw new BusinessException("Receipt lines must have unique order line IDs and positive quantities.");
            }
            OrderProduct line = orderMapper.lockOrderProduct(requested.orderProductId(), orderId);
            if (line == null || line.getProductId() == null || !order.getOutletId().equals(line.getOutletId())) {
                throw new BusinessException("Purchase order line not found.");
            }
            if (productMapper.findByIdAndVendor(line.getProductId(), vendorId) == null) {
                throw new BusinessException("Purchase order product is outside this tenant.");
            }
            BigDecimal ordered = nz(line.getOrderedQuantity());
            BigDecimal received = nz(line.getReceivedQuantity());
            BigDecimal outstanding = ordered.subtract(received);
            if (outstanding.signum() <= 0 || requested.quantity().compareTo(outstanding) > 0) {
                throw new BusinessException("Received quantity exceeds the outstanding quantity.");
            }
            BigDecimal packSize = line.getCaseQuantity() == null ? BigDecimal.ONE : line.getCaseQuantity();
            if (packSize.signum() <= 0) throw new BusinessException("Purchase order case quantity is invalid.");
            BigDecimal inventoryQuantity = requested.quantity().multiply(packSize);
            List<PurchaseReceiptRequest.Batch> batches = validatedReceiptBatches(requested);

            PurchaseReceiptLine receiptLine = new PurchaseReceiptLine();
            receiptLine.setReceiptId(receipt.getId());
            receiptLine.setOrderProductId(line.getId());
            receiptLine.setProductId(line.getProductId());
            receiptLine.setReceivedQuantity(requested.quantity());
            receiptLine.setInventoryQuantity(inventoryQuantity);
            receiptLine.setUnitCost(line.getOrderedCost());
            if (orderMapper.insertReceiptLine(receiptLine) != 1 || receiptLine.getId() == null) {
                throw new IllegalStateException("Purchase receipt line could not be recorded.");
            }
            for (var batch : batches) {
                if (orderMapper.insertReceiptBatch(receiptLine.getId(), batch.code().trim(),
                        batch.expiryDate(), batch.quantity().multiply(packSize), batch.dateType()) != 1) {
                    throw new IllegalStateException("Purchase receipt batch could not be recorded.");
                }
            }
            if (productMapper.adjustInventory(line.getProductId(), order.getOutletId(), inventoryQuantity) != 1) {
                throw new IllegalStateException("Inventory could not be updated for the purchase receipt.");
            }
            InventoryMovement movement = new InventoryMovement();
            movement.setVendorId(vendorId);
            movement.setOutletId(order.getOutletId());
            movement.setProductId(line.getProductId());
            movement.setQuantityDelta(inventoryQuantity);
            movement.setSourceId(receipt.getId());
            movement.setSourceLineId(receiptLine.getId());
            movement.setIdempotencyKey(idempotencyKey);
            movement.setActorId(CurrentUser.id());
            if (orderMapper.insertInventoryMovement(movement) != 1) {
                throw new IllegalStateException("Inventory movement could not be recorded.");
            }
            if (orderMapper.updateReceivedQuantity(line.getId(), orderId, received.add(requested.quantity())) != 1) {
                throw new IllegalStateException("Purchase order line could not be updated.");
            }
        }

        List<OrderProduct> updatedLines = orderMapper.findProductsByOrderId(orderId);
        boolean complete = updatedLines.stream().allMatch(line ->
                nz(line.getReceivedQuantity()).compareTo(nz(line.getOrderedQuantity())) >= 0);
        String status = complete ? "RECEIVED" : "PARTIALLY_RECEIVED";
        if (orderMapper.updateReceiptStatus(orderId, vendorId, status, CurrentUser.id()) != 1) {
            throw new BusinessException(40410, "Order not found.");
        }
        receipt.setStatus(status);
        if (orderMapper.updateReceiptEventStatus(receipt.getId(), vendorId, status) != 1) {
            throw new IllegalStateException("Purchase receipt status could not be recorded.");
        }
        PurchaseReceipt saved = orderMapper.findReceiptByKey(vendorId, idempotencyKey);
        return new PurchaseReceiptResult(receipt.getId(), orderId, status,
                saved == null ? null : saved.getReceivedAt(), false);
    }

    static String receiptRequestHash(Long orderId, PurchaseReceiptRequest request) {
        String canonical = orderId + ":" + request.lines().stream()
                .sorted(Comparator.comparing(line -> line == null ? null : line.orderProductId(), Comparator.nullsFirst(Long::compareTo)))
                .map(line -> {
                    if (line == null) return "null";
                    String batches = validatedReceiptBatches(line).stream()
                            .map(batch -> java.util.HexFormat.of().formatHex(batch.code().trim().getBytes(StandardCharsets.UTF_8))
                                    + ":" + batch.expiryDate() + ":" + batch.quantity().stripTrailingZeros().toPlainString()
                                    + (batch.dateType() == null ? "" : ":" + batch.dateType().name()))
                            .sorted().collect(java.util.stream.Collectors.joining(","));
                    return line.orderProductId() + "=" + line.quantity() + (batches.isEmpty() ? "" : "[" + batches + "]");
                })
                .reduce((left, right) -> left + ";" + right).orElse("");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable.", e);
        }
    }

    private static List<PurchaseReceiptRequest.Batch> validatedReceiptBatches(PurchaseReceiptRequest.Line line) {
        List<PurchaseReceiptRequest.Batch> batches = line.batches();
        if (batches == null || batches.isEmpty()) return List.of();
        BigDecimal total = BigDecimal.ZERO;
        Set<String> codes = new HashSet<>();
        for (var batch : batches) {
            if (batch == null || batch.code() == null || batch.code().isBlank() || batch.code().trim().length() > 120
                    || batch.expiryDate() == null || batch.quantity() == null || batch.quantity().signum() <= 0
                    || batch.quantity().scale() > 4 || !codes.add(batch.code().trim())) {
                throw new BusinessException("Each batch needs a unique code, expiry date and positive quantity.");
            }
            total = total.add(batch.quantity());
        }
        if (line.quantity() == null || total.compareTo(line.quantity()) != 0) {
            throw new BusinessException("Batch quantities must add up to the received line quantity.");
        }
        return batches;
    }

    private static String directReceiveRequestHash(CreateReceiveRequest request) {
        String canonical = String.valueOf(request.getFromId()) + ":" + request.getToId() + ":"
                + request.getInvoiceNumber() + ":" + request.getInvoiceDate() + ":"
                + request.getProducts().stream()
                .sorted(Comparator.comparing((ReceiveLineRequest line) -> line.getProductId()))
                .map(line -> line.getProductId() + "=" + line.getQuantity() + "x" + line.getCaseQuantity()
                        + "@" + line.getUnitPrice())
                .reduce((left, right) -> left + ";" + right).orElse("");
        try {
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.getBytes(StandardCharsets.UTF_8));
            return java.util.HexFormat.of().formatHex(digest);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 is unavailable.", e);
        }
    }

    @Transactional
    public Order create(CreateOrderRequest request) {
        validateCreateRequest(request);

        Order order = new Order();
        order.setType("ORDER");
        order.setStatus("OPEN");
        order.setFromId(request.getFromId());
        order.setToId(request.getToId());
        order.setOutletId(request.getToId());
        order.setOrderDate(request.getOrderDate() != null ? request.getOrderDate() : businessTimezone.today(requireVendorId()));
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
        if (request.getLines() != null && !request.getLines().isEmpty()) {
            persistDraftOrderLines(order.getId(), request.getToId(), request.getFromId(), request.getLines());
        }
        Order saved = orderMapper.findById(order.getId());
        saved.setProducts(orderMapper.findProductsByOrderId(order.getId()));
        return saved;
    }

    @Transactional
    public Order createTransfer(CreateTransferRequest request) {
        validateCreateTransferRequest(request);

        Order order = new Order();
        order.setType("TRANSFER");
        order.setStatus("OPEN");
        order.setFromId(request.getFromId());
        order.setToId(request.getToId());
        order.setOutletId(request.getFromId());
        order.setOrderDate(request.getTransferDate() != null ? request.getTransferDate() : businessTimezone.today(requireVendorId()));
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
        String fingerprint = directReceiveRequestHash(request);
        String invoiceNumber = trimToNull(request.getInvoiceNumber());
        return createReceive(request, "invoice-" + (invoiceNumber == null ? fingerprint : invoiceNumber));
    }

    @Transactional
    public Order createReceive(CreateReceiveRequest request, String rawIdempotencyKey) {
        validateCreateReceiveRequest(request);
        Long vendorId = requireVendorId();
        String idempotencyKey = trimToNull(rawIdempotencyKey);
        if (idempotencyKey == null || idempotencyKey.length() > 200) {
            throw new BusinessException("A valid Idempotency-Key is required.");
        }
        if (orderMapper.lockReceiptIdempotencyKey(vendorId, idempotencyKey) == null) {
            throw new IllegalStateException("Could not acquire receipt idempotency lock.");
        }
        String requestHash = directReceiveRequestHash(request);
        PurchaseReceipt previous = orderMapper.findReceiptByKey(vendorId, idempotencyKey);
        if (previous != null) {
            if (!requestHash.equals(previous.getRequestHash()) || !"DIRECT_INVOICE".equals(previous.getStatus())) {
                throw new BusinessException("Idempotency-Key was already used with a different receipt.");
            }
            Order existing = orderMapper.findByIdForVendor(previous.getOrderId(), vendorId);
            if (existing == null) throw new BusinessException(40410, "Order not found.");
            existing.setProducts(orderMapper.findProductsByOrderId(existing.getId()));
            return existing;
        }

        Order order = new Order();
        order.setType("ORDER");
        order.setStatus("RECEIVED");
        order.setFromId(request.getFromId());
        order.setToId(request.getToId());
        order.setOutletId(request.getToId());
        order.setOrderDate(request.getInvoiceDate() != null ? request.getInvoiceDate() : businessTimezone.today(requireVendorId()));
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
        PurchaseReceipt receipt = new PurchaseReceipt();
        receipt.setVendorId(vendorId);
        receipt.setOrderId(order.getId());
        receipt.setOutletId(order.getOutletId());
        receipt.setIdempotencyKey(idempotencyKey);
        receipt.setRequestHash(requestHash);
        receipt.setStatus("DIRECT_INVOICE");
        receipt.setReceivedById(CurrentUser.id());
        if (orderMapper.insertReceipt(receipt) != 1 || receipt.getId() == null) {
            throw new BusinessException("Idempotency-Key was already used with a different receipt.");
        }
        Long userId = CurrentUser.id();
        if (userId != null) {
            orderMapper.setReceivedMeta(order.getId(), userId, requireVendorId());
        } else {
            orderMapper.markReceived(order.getId(), requireVendorId());
        }
        persistReceiveLines(order.getId(), receipt.getId(), idempotencyKey, vendorId,
                request.getFromId(), request.getToId(), request.getProducts());
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
        order.setOutletId(request.getFromId());
        order.setOrderDate(request.getOrderDate() != null ? request.getOrderDate() : businessTimezone.today(requireVendorId()));
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
        order.setOutletId(request.getToId());
        order.setOrderDate(request.getCreditNoteDate() != null ? request.getCreditNoteDate() : businessTimezone.today(requireVendorId()));
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
        if (supplierMapper.findByIdAndVendor(request.getFromId(), requireVendorId()) == null) {
            throw new BusinessException("Supplier not found.");
        }
        if (request.getToId() == null) {
            throw new BusinessException("Destination outlet is required.");
        }
        if (outletMapper.findByIdAndVendor(request.getToId(), requireVendorId()) == null) {
            throw new BusinessException("Destination outlet not found.");
        }
        if (request.getCreditNoteNumber() == null || request.getCreditNoteNumber().isBlank()) {
            throw new BusinessException("Credit note number is required.");
        }
        String creditNoteNumber = request.getCreditNoteNumber().trim();
        if (orderMapper.countByInvoiceNumber(creditNoteNumber, requireVendorId()) > 0) {
            throw new BusinessException("Credit note number already exists.");
        }
        LocalDate creditNoteDate = request.getCreditNoteDate() != null ? request.getCreditNoteDate() : businessTimezone.today(requireVendorId());
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
        if (outletMapper.findByIdAndVendor(request.getFromId(), requireVendorId()) == null) {
            throw new BusinessException("Source outlet not found.");
        }
        if (request.getToId() == null) {
            throw new BusinessException("Supplier is required.");
        }
        if (supplierMapper.findByIdAndVendor(request.getToId(), requireVendorId()) == null) {
            throw new BusinessException("Supplier not found.");
        }
        String orderNumber = trimToNull(request.getOrderNumber());
        if (orderNumber != null && orderMapper.countByInvoiceNumber(orderNumber, requireVendorId()) > 0) {
            throw new BusinessException("Order number already exists.");
        }
        LocalDate orderDate = request.getOrderDate() != null ? request.getOrderDate() : businessTimezone.today(requireVendorId());
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
        if (supplierMapper.findByIdAndVendor(request.getFromId(), requireVendorId()) == null) {
            throw new BusinessException("Supplier not found.");
        }
        if (request.getToId() == null) {
            throw new BusinessException("Destination outlet is required.");
        }
        if (outletMapper.findByIdAndVendor(request.getToId(), requireVendorId()) == null) {
            throw new BusinessException("Destination outlet not found.");
        }
        String invoiceNumber = trimToNull(request.getInvoiceNumber());
        if (invoiceNumber != null && orderMapper.countByInvoiceNumber(invoiceNumber, requireVendorId()) > 0) {
            throw new BusinessException("Invoice number already exists.");
        }
        LocalDate invoiceDate = request.getInvoiceDate() != null ? request.getInvoiceDate() : businessTimezone.today(requireVendorId());
        if (request.getDueDate() != null && request.getDueDate().isBefore(invoiceDate)) {
            throw new BusinessException("Due date cannot be before invoice date.");
        }
        if (request.getProducts() == null || request.getProducts().isEmpty()) {
            throw new BusinessException("At least one priced product line is required to receive stock.");
        }
        for (ReceiveLineRequest line : request.getProducts()) {
            if (line == null || line.getProductId() == null || line.getQuantity() == null
                    || line.getQuantity().signum() <= 0 || line.getQuantity().scale() > 4
                    || line.getCaseQuantity() == null || line.getCaseQuantity().signum() <= 0
                    || line.getUnitPrice() == null || line.getUnitPrice().signum() < 0) {
                throw new BusinessException("Each receipt line needs a product, positive quantity, case size, and verified unit price.");
            }
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
        if (outletMapper.findByIdAndVendor(request.getFromId(), requireVendorId()) == null) {
            throw new BusinessException("Source outlet not found.");
        }
        if (outletMapper.findByIdAndVendor(request.getToId(), requireVendorId()) == null) {
            throw new BusinessException("Destination outlet not found.");
        }
        if (request.getTransferNumber() == null || request.getTransferNumber().isBlank()) {
            throw new BusinessException("Transfer number is required.");
        }
        String transferNumber = request.getTransferNumber().trim();
        if (orderMapper.countByInvoiceNumber(transferNumber, requireVendorId()) > 0) {
            throw new BusinessException("Transfer number already exists.");
        }
        LocalDate transferDate = request.getTransferDate() != null ? request.getTransferDate() : businessTimezone.today(requireVendorId());
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
        if (outletMapper.findByIdAndVendor(request.getToId(), requireVendorId()) == null) {
            throw new BusinessException("Destination outlet not found.");
        }
        if (request.getFromId() != null && supplierMapper.findByIdAndVendor(request.getFromId(), requireVendorId()) == null) {
            throw new BusinessException("Supplier not found.");
        }
        if (request.getInvoiceNumber() == null || request.getInvoiceNumber().isBlank()) {
            throw new BusinessException("Order number is required.");
        }
        String invoiceNumber = request.getInvoiceNumber().trim();
        if (orderMapper.countByInvoiceNumber(invoiceNumber, requireVendorId()) > 0) {
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

    private void persistDraftOrderLines(Long orderId, Long outletId, Long supplierId, List<ReceiveLineRequest> lines) {
        Long vendorId = requireVendorId();
        if (supplierId != null && supplierMapper.findByIdAndVendor(supplierId, vendorId) == null) {
            throw new BusinessException("Supplier not found.");
        }
        BigDecimal total = BigDecimal.ZERO;
        int count = 0;
        for (ReceiveLineRequest line : lines) {
            if (line == null || line.getProductId() == null || line.getQuantity() == null
                    || line.getQuantity().signum() <= 0) {
                continue;
            }
            if (productMapper.findByIdAndVendor(line.getProductId(), vendorId) == null) {
                throw new BusinessException("Product not found.");
            }
            BigDecimal cases = line.getQuantity();
            BigDecimal pack = line.getCaseQuantity() != null && line.getCaseQuantity().signum() > 0
                    ? line.getCaseQuantity() : BigDecimal.ONE;
            BigDecimal unitCost = line.getUnitPrice() != null && line.getUnitPrice().signum() >= 0
                    ? line.getUnitPrice() : BigDecimal.ZERO;
            BigDecimal lineTotal = unitCost.multiply(cases);
            total = total.add(lineTotal);
            count++;

            OrderProduct row = new OrderProduct();
            row.setOrderId(orderId);
            row.setOutletId(outletId);
            row.setProductId(line.getProductId());
            row.setSupplierId(supplierId);
            row.setSupplierCode(trimToNull(line.getDescription()));
            row.setCaseQuantity(pack);
            row.setOrderedQuantity(cases);
            row.setReceivedQuantity(BigDecimal.ZERO);
            row.setBaseCost(unitCost);
            row.setOrderedCost(unitCost);
            row.setFees(BigDecimal.ZERO);
            row.setFreight(BigDecimal.ZERO);
            row.setRebate(BigDecimal.ZERO);
            orderMapper.insertProduct(row);
        }
        if (count > 0) {
            orderMapper.updateTotals(orderId, total, total, count, null);
        }
    }

    private void persistReceiveLines(Long orderId, Long receiptId, String idempotencyKey, Long vendorId,
                                     Long supplierId, Long outletId, List<ReceiveLineRequest> lines) {
        BigDecimal total = BigDecimal.ZERO;
        int count = 0;
        for (ReceiveLineRequest line : lines) {
            BigDecimal cases = nz(line.getQuantity());
            BigDecimal pack = line.getCaseQuantity();
            BigDecimal caseCost = nz(line.getUnitPrice());
            BigDecimal lineTotal = caseCost.multiply(cases);
            total = total.add(lineTotal);
            count++;

            OrderProduct row = new OrderProduct();
            row.setOrderId(orderId);
            row.setOutletId(outletId);
            row.setProductId(line.getProductId());
            if (productMapper.findByIdAndVendor(line.getProductId(), vendorId) == null) {
                throw new BusinessException("Product not found.");
            }
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
                if (productMapper.adjustInventory(line.getProductId(), outletId, units) != 1) {
                    throw new IllegalStateException("Inventory could not be updated for the supplier invoice.");
                }
                PurchaseReceiptLine receiptLine = new PurchaseReceiptLine();
                receiptLine.setReceiptId(receiptId);
                receiptLine.setOrderProductId(row.getId());
                receiptLine.setProductId(line.getProductId());
                receiptLine.setReceivedQuantity(cases);
                receiptLine.setInventoryQuantity(units);
                receiptLine.setUnitCost(caseCost);
                if (orderMapper.insertReceiptLine(receiptLine) != 1 || receiptLine.getId() == null) {
                    throw new IllegalStateException("Supplier invoice line could not be recorded.");
                }
                InventoryMovement movement = new InventoryMovement();
                movement.setVendorId(vendorId);
                movement.setOutletId(outletId);
                movement.setProductId(line.getProductId());
                movement.setQuantityDelta(units);
                movement.setSourceId(receiptId);
                movement.setSourceLineId(receiptLine.getId());
                movement.setIdempotencyKey(idempotencyKey);
                movement.setActorId(CurrentUser.id());
                if (orderMapper.insertInventoryMovement(movement) != 1) {
                    throw new IllegalStateException("Inventory movement could not be recorded.");
                }
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

    private static Long requireVendorId() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40310, "Tenant context is required.");
        return vendorId;
    }

    @Transactional
    public Order update(Long id, Order changes) {
        Long vendorId = requireVendorId();
        Order current = orderMapper.findByIdForVendor(id, vendorId);
        if (current == null) throw new BusinessException(40410, "Order not found.");
        changes.setId(id);
        changes.setVendorId(vendorId);
        changes.setOutletId(current.getOutletId());
        changes.setType(current.getType());
        validateOrderParties(changes, vendorId);
        if (orderMapper.update(changes) == 0) throw new BusinessException(40410, "Order not found.");
        return orderMapper.findByIdForVendor(id, vendorId);
    }

    private void validateOrderParties(Order order, Long vendorId) {
        String type = order.getType();
        boolean hasOutletFrom = "TRANSFER".equals(type) || "RETURN".equals(type);
        boolean hasSupplierFrom = "ORDER".equals(type) || "RECEIVE".equals(type) || "CREDIT".equals(type);
        boolean hasSupplierTo = "RETURN".equals(type) || "CREDIT".equals(type);
        boolean hasOutletTo = "ORDER".equals(type) || "TRANSFER".equals(type) || "RECEIVE".equals(type) || "CREDIT".equals(type);
        if (hasOutletFrom && outletMapper.findByIdAndVendor(order.getFromId(), vendorId) == null) {
            throw new BusinessException("Source outlet not found.");
        }
        if (hasSupplierFrom && order.getFromId() != null && supplierMapper.findByIdAndVendor(order.getFromId(), vendorId) == null) {
            throw new BusinessException("Supplier not found.");
        }
        if (hasOutletTo && outletMapper.findByIdAndVendor(order.getToId(), vendorId) == null) {
            throw new BusinessException("Destination outlet not found.");
        }
        if (hasSupplierTo && supplierMapper.findByIdAndVendor(order.getToId(), vendorId) == null) {
            throw new BusinessException("Supplier not found.");
        }
    }
}
