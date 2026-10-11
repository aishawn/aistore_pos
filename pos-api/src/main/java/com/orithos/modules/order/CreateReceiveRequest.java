package com.orithos.modules.order;

import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** Payload for POST /api/orders/receives when recording a supplier stock receipt (invoice). */
@Data
public class CreateReceiveRequest {
    /** Supplier id. */
    private Long fromId;
    /** Destination outlet id. */
    private Long toId;
    private LocalDate invoiceDate;
    private LocalDate dueDate;
    /** Supplier invoice number (stored as invoice_number). */
    private String invoiceNumber;
    private String reference;
    private String notes;
    private String internalNotes;
    private String enteredAs;
    private BigDecimal totalCost;
    /** Optional invoice lines; when present they are persisted on the receive. */
    private List<ReceiveLineRequest> products;
}
