package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

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
}
