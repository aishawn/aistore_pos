package com.orithos.modules.order;

import lombok.Data;

import java.time.LocalDate;

/** Payload for POST /api/orders/credits when creating a supplier credit note. */
@Data
public class CreateCreditRequest {
    /** Supplier id. */
    private Long fromId;
    /** Destination outlet id. */
    private Long toId;
    private LocalDate creditNoteDate;
    private LocalDate dueDate;
    /** Credit note number (stored as invoice_number). */
    private String creditNoteNumber;
    private String reference;
    private String notes;
    private String internalNotes;
}
