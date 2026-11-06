package com.orithos.posapi;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class PosApiWebhookServiceTest {
    @Test
    void matchesSingleAndCommaSeparatedEventSubscriptions() {
        assertTrue(PosApiWebhookService.matchesEvent("sale.created", "sale.created"));
        assertTrue(PosApiWebhookService.matchesEvent("sale.created,refund.created", "sale.created"));
        assertTrue(PosApiWebhookService.matchesEvent("sale.created,refund.created", "refund.created"));
    }

    @Test
    void supportsWildcardAndRejectsPartialOrMissingMatches() {
        assertTrue(PosApiWebhookService.matchesEvent("*", "sale.created"));
        assertTrue(PosApiWebhookService.matchesEvent("sale.created, refund.created", " refund.created "));
        assertFalse(PosApiWebhookService.matchesEvent("sale.created", "sale"));
        assertFalse(PosApiWebhookService.matchesEvent("other.sale.created", "sale.created"));
        assertFalse(PosApiWebhookService.matchesEvent("sale.created.backup", "sale.created"));
        assertFalse(PosApiWebhookService.matchesEvent("refund.created", "sale.created"));
        assertFalse(PosApiWebhookService.matchesEvent(null, "sale.created"));
        assertFalse(PosApiWebhookService.matchesEvent("sale.created", null));
    }
}
