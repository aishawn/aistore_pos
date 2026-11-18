package com.orithos.modules.sale;

import com.orithos.modules.config.CompanySettingsService;
import com.orithos.modules.eftpos.EftposService;
import com.orithos.modules.sale.dto.CheckoutRequest;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.mockito.Mockito.mock;

class CheckoutLineAmountTest {

    private final CheckoutService service = new CheckoutService(null, null, null, null, null, null, new ObjectMapper(),
            mock(CompanySettingsService.class), mock(EftposService.class));

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

    @Test
    void retryIdentityIncludesQuotedPriceButIgnoresClientLineTotal() {
        CheckoutRequest first = request("4.50", "9.00");
        CheckoutRequest sameQuote = request("4.50", "0.02");
        CheckoutRequest changedQuote = request("4.51", "9.02");

        assertEquals(service.requestHash(first), service.requestHash(sameQuote));
        assertNotEquals(service.requestHash(first), service.requestHash(changedQuote));
    }

    @Test
    void retryIdentityChangesWhenQuantityChanges() {
        CheckoutRequest first = request("4.50", "9.00");
        CheckoutRequest changed = request("4.50", "13.50");
        changed.getItems().getFirst().setQuantity(new BigDecimal("3"));

        assertNotEquals(service.requestHash(first), service.requestHash(changed));
    }

    private static CheckoutRequest request(String unitPrice, String lineTotal) {
        CheckoutRequest req = new CheckoutRequest();
        req.setTender("EFTPOS VISA");
        CheckoutRequest.Item item = new CheckoutRequest.Item();
        item.setProductId(42L);
        item.setQuantity(new BigDecimal("2"));
        item.setUnitPrice(new BigDecimal(unitPrice));
        item.setLineTotal(new BigDecimal(lineTotal));
        req.setItems(java.util.List.of(item));
        return req;
    }
}
