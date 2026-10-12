package com.orithos.modules.sale;

import com.orithos.modules.sale.dto.CheckoutRequest;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class CheckoutLineAmountTest {

    @Test
    void displayedLineTotalIsChargedInsteadOfReconstructedUnitPrice() {
        CheckoutRequest.Item item = new CheckoutRequest.Item();
        item.setQuantity(new BigDecimal("2"));
        item.setUnitPrice(new BigDecimal("2.265"));
        item.setLineTotal(new BigDecimal("4.53"));

        assertEquals(new BigDecimal("4.53"), CheckoutService.lineAmount(item));
    }

    @Test
    void quantityTimesUnitIsRoundedOnceAtLineLevel() {
        CheckoutRequest.Item item = new CheckoutRequest.Item();
        item.setQuantity(new BigDecimal("2"));
        item.setUnitPrice(new BigDecimal("2.265"));

        assertEquals(new BigDecimal("4.53"), CheckoutService.lineAmount(item));
    }
}
