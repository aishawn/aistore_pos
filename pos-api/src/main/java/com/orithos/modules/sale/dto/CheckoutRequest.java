package com.orithos.modules.sale.dto;

import com.fasterxml.jackson.databind.annotation.JsonDeserialize;
import com.orithos.common.LenientLongDeserializer;
import lombok.Data;
import java.math.BigDecimal;
import java.util.List;

/**
 * A finalise/tender request from the Sell pad: the cart plus the chosen tender.
 * The backend computes totals, change and completion — the client sends no money maths.
 */
@Data
public class CheckoutRequest {
    private Long registerId;
    private Long userId;
    @JsonDeserialize(using = LenientLongDeserializer.class)
    private Long customerId;
    /** When set, record another tender against an open (PENDING) sale instead of starting a new one. */
    private Long saleId;
    /** Tender label tapped on the pad, e.g. "EFTPOS VISA MasterCard" / "Exact Cash". */
    private String tender;
    /** Amount for this tender. Null → assume the outstanding balance (or full total on first tender). */
    private BigDecimal tendered;
    /** Optional cash-out amount (Eftpos Cash Out). */
    private BigDecimal cashout;
    private List<Item> items;

    @Data
    public static class Item {
        @JsonDeserialize(using = LenientLongDeserializer.class)
        private Long productId;
        private String name;
        private BigDecimal quantity;
        private BigDecimal unitPrice;
        /**
         * Cents the till already showed for this line. When set, this is the
         * amount charged — {@code quantity × rounded unit price} can drift by a cent.
         */
        private BigDecimal lineTotal;
    }
}
