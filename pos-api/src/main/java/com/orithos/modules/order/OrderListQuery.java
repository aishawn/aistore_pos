package com.orithos.modules.order;

import lombok.Data;

import java.time.LocalDate;

/** Filter + pagination parameters for GET /api/orders (Orders page Filter button). */
@Data
public class OrderListQuery {
    /** Raw status from client; OUTSTANDING is expanded to {@link #outstanding}. */
    private String status;
    private boolean outstanding;
    private String type;
    private Long supplierId;
    /** Transferee id (stored in purchase_order.to_id). */
    private Long transferorId;
    /** Outlet id (stored in purchase_order.to_id). */
    private Long outletId;
    private String invoiceNumber;
    private String reference;
    private LocalDate orderDate;
    private LocalDate orderDateFrom;
    private LocalDate orderDateTo;
    private LocalDate dueDate;
    private Long createdById;
    private Long sentById;
    private Long receivedById;
    private Long productId;
    /** Tenant scope is populated from the authenticated principal, never from request input. */
    private Long vendorId;
    private int page = 1;
    private int size = 10;

    public int getOffset() {
        return Math.max(0, (page - 1) * size);
    }

    /** Normalise blank strings and map OUTSTANDING to the outstanding flag. */
    public void normalize() {
        status = blankToNull(status);
        type = blankToNull(type);
        invoiceNumber = blankToNull(invoiceNumber);
        reference = blankToNull(reference);

        if ("OUTSTANDING".equalsIgnoreCase(status)) {
            outstanding = true;
            status = null;
        }

        if (page < 1) {
            page = 1;
        }
        if (size < 1) {
            size = 20;
        } else if (size > 200) {
            size = 200;
        }
    }

    private static String blankToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
