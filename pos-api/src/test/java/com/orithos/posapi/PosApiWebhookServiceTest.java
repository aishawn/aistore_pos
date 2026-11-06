package com.orithos.posapi;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
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

    @Test
    void signsExactBodyAndRejectsTampering() {
        String signature = PosApiWebhookService.signatureHeader("secret", "{\"id\":1}");
        assertTrue(signature.startsWith("sha256="));
        assertEquals(signature, PosApiWebhookService.signatureHeader("secret", "{\"id\":1}"));
        assertNotEquals(signature, PosApiWebhookService.signatureHeader("secret", "{\"id\":2}"));
    }

    @Test
    void validatesResolvedAddressAndRejectsUnsafeUrlShapes() throws Exception {
        PosApiWebhookService.validateEndpoint("https://hooks.example.test/events",
                host -> new java.net.InetAddress[]{java.net.InetAddress.getByAddress(new byte[]{8, 8, 8, 8})});
        assertThrows(IllegalArgumentException.class, () -> PosApiWebhookService.validateEndpoint(
                "https://hooks.example.test/events",
                host -> new java.net.InetAddress[]{java.net.InetAddress.getByAddress(new byte[]{10, 0, 0, 1})}));
        assertThrows(IllegalArgumentException.class, () -> PosApiWebhookService.validateEndpoint(
                "http://hooks.example.test/events", host -> new java.net.InetAddress[]{
                        java.net.InetAddress.getByAddress(new byte[]{8, 8, 8, 8})}));
        assertThrows(IllegalArgumentException.class, () -> PosApiWebhookService.validateEndpoint(
                "https://user@hooks.example.test/events", host -> new java.net.InetAddress[]{
                        java.net.InetAddress.getByAddress(new byte[]{8, 8, 8, 8})}));
    }
}
