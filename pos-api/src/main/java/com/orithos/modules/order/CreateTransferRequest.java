package com.orithos.modules.order;

import lombok.Data;

import java.time.LocalDate;

/** Payload for POST /api/orders/transfers when creating a stock transfer from the UI. */
@Data
public class CreateTransferRequest {
    /** Source outlet id. */
    private Long fromId;
    /** Destination outlet id. */
    private Long toId;
    private LocalDate transferDate;
    private LocalDate dueDate;
    /** User-facing transfer number (stored as invoice_number). */
    private String transferNumber;
    private String reference;
    private String notes;
    private String internalNotes;
}
