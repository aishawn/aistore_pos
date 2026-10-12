package com.orithos.modules.ai.report;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

class AiReportQuotaServiceTest {

    @Test
    void separateOutletsDoNotShareQueryQuota() {
        AiReportProperties props = new AiReportProperties();
        props.setQueriesPerHour(2);
        props.setTokensPerHour(0);
        AiReportQuotaService quota = new AiReportQuotaService(props, null);
        assertDoesNotThrow(() -> quota.acquire(12L, 1, 0));
        assertDoesNotThrow(() -> quota.acquire(12L, 1, 0));
        SqlGuardException ex = assertThrows(SqlGuardException.class, () -> quota.acquire(12L, 1, 0));
        assertTrue(ex.getMessage().contains("QUOTA_EXCEEDED"));
        assertDoesNotThrow(() -> quota.acquire(15L, 1, 0));
    }
}
