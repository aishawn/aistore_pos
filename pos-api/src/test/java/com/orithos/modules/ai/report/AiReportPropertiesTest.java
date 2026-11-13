package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiReportPropertiesTest {

    @Test
    void bulkOutletProvisioningIsOptIn() {
        AiReportProperties properties = new AiReportProperties();

        assertFalse(properties.isProvisionAllOnStartup());
        properties.setProvisionAllOnStartup(true);
        assertTrue(properties.isProvisionAllOnStartup());
    }

    @Test
    void reportQueryTimeoutHasHardLowerAndUpperBounds() {
        AiReportProperties properties = new AiReportProperties();

        properties.setQueryTimeoutSeconds(0);
        assertEquals(1, properties.getQueryTimeoutSeconds());

        properties.setQueryTimeoutSeconds(600);
        assertEquals(30, properties.getQueryTimeoutSeconds());
    }
}
