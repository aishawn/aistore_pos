package com.orithos.modules.ai;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;

class AssistantDisplayTextTest {

    @Test
    void stripsImportIdsAndTestPrefixesFromDisplayName() {
        assertEquals(
                "PIZZINI SANGIOVESE SHIRAZ 750M",
                AssistantDisplayText.productName(
                        "[R2-11eee66f71b39c7abc790636865404] R2 TEST | PIZZINI SANGIOVESE SHIRAZ 750M"));
        assertEquals(
                "RARE PENNY SHIRAZ",
                AssistantDisplayText.productName(
                        "[R2-11eee66f71b3841aa14c0636865404] R2 TEST | RARE PENNY SHIRAZ"));
        assertEquals("Shiraz Reserve", AssistantDisplayText.productName("Shiraz Reserve"));
        assertEquals("Product", AssistantDisplayText.productName("   "));
    }

    @Test
    void moneyUsesTwoDecimalPlaces() {
        assertEquals("19.99", AssistantDisplayText.money(new BigDecimal("19.9909")));
        assertEquals("13.63", AssistantDisplayText.money(new BigDecimal("13.6273")));
        assertEquals("22.72", AssistantDisplayText.money(22.7182));
        assertEquals("30.00", AssistantDisplayText.money(new BigDecimal("30")));
    }
}
