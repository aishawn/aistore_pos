package com.orithos.modules.order;

import lombok.Data;

import java.time.LocalDate;

/** Payload for POST /api/orders/returns when creating a stock return to a supplier. */
@Data
public class CreateReturnRequest {
    /** Source outlet id. */
    private Long fromId;
    /** Destination supplier id. */
    private Long toId;
    private LocalDate orderDate;
    private LocalDate dueDate;
    /** Return order number (stored as invoice_number). */
    private String orderNumber;
    private String reference;
    private String notes;
    private String internalNotes;
}
