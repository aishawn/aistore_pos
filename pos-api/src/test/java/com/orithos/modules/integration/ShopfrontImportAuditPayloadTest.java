package com.orithos.modules.integration;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ShopfrontImportAuditPayloadTest {

    @Test
    void auditEnvelopeKeepsImportMetadataWithoutSourceRows() {
        var envelope = ShopfrontIntegrationController.importAuditEnvelope(
                new ObjectMapper(), "skr", "sales", 200, false, false);

        assertEquals("skr", envelope.path("store_key").asText());
        assertEquals("sales", envelope.path("type").asText());
        assertEquals(200, envelope.path("item_count").asInt());
        assertEquals("metadata_only", envelope.path("payload_mode").asText());
        assertFalse(envelope.has("items"));
        assertFalse(envelope.has("payload"));
    }

    @Test
    void auditEnvelopePreservesSnapshotFlags() {
        var envelope = ShopfrontIntegrationController.importAuditEnvelope(
                new ObjectMapper(), "demo", "inventory", 12000, true, true);

        assertTrue(envelope.path("replace").asBoolean());
        assertTrue(envelope.path("snapshot_complete").asBoolean());
        assertFalse(envelope.has("items"));
    }
}
