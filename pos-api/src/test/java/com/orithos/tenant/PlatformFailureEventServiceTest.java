package com.orithos.tenant;

import com.orithos.common.BuildIdentityController;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.http.ResponseEntity;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.jdbc.BadSqlGrammarException;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import java.sql.SQLException;

import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class PlatformFailureEventServiceTest {

    private final PlatformFailureEventMapper mapper = mock(PlatformFailureEventMapper.class);
    private final BuildIdentityController buildIdentity = mock(BuildIdentityController.class);
    private final PlatformFailureEventService service = new PlatformFailureEventService(mapper, buildIdentity, "uat");

    @AfterEach
    void clearTenant() {
        TenantHolder.clear();
    }

    @Test
    void recordsOnlySanitizedRequestMetadataAndGroupsByRuntimeIdentity() {
        when(buildIdentity.version()).thenReturn(ResponseEntity.ok(Map.<String, Object>of(
                "commit", "0123456789abcdef0123456789abcdef01234567")));
        when(mapper.insert(any(PlatformFailureEventRecord.class))).thenReturn(1);
        MockHttpServletRequest request = new MockHttpServletRequest("GET", "/api/auth/reset/secret-token");
        request.setQueryString("email=customer%40example.com");
        request.setAttribute(com.orithos.config.RequestCorrelationFilter.STARTED_AT_ATTRIBUTE, System.nanoTime());
        TenantHolder.set(TenantHolder.ResolvedTenant.controlPlaneTenant());

        service.record(request, 500, 50000,
                new IllegalStateException("Authorization: Bearer top.secret customer@example.com 0412345678"));

        ArgumentCaptor<PlatformFailureEventRecord> event = ArgumentCaptor.forClass(PlatformFailureEventRecord.class);
        verify(mapper).insert(event.capture());
        assertEquals("/api/auth/reset/[REDACTED]", event.getValue().requestPath());
        assertEquals("0123456789abcdef0123456789abcdef01234567", event.getValue().runtimeCommit());
        assertFalse(event.getValue().errorSummary().contains("top.secret"));
        assertFalse(event.getValue().errorSummary().contains("customer@example.com"));
        assertFalse(event.getValue().errorSummary().contains("0412345678"));
    }

    @Test
    void extractsSqlStateAndVendorCodeWithoutLoggingDatabaseMessage() {
        var failure = new BadSqlGrammarException("record", "insert ... private-value", new SQLException("private-value", "42601", 7));

        assertEquals("42601", PlatformFailureEventService.sqlState(failure));
        assertEquals(7, PlatformFailureEventService.sqlVendorCode(failure));
    }

    @Test
    void alertRecordingUsesAnIndependentTransaction() throws Exception {
        var record = PlatformAlertService.class.getMethod("record", String.class, String.class, String.class,
                Long.class, String.class, String.class, java.time.LocalDateTime.class);
        Transactional transactional = record.getAnnotation(Transactional.class);

        assertNotNull(transactional);
        assertEquals(Propagation.REQUIRES_NEW, transactional.propagation());
    }
}
