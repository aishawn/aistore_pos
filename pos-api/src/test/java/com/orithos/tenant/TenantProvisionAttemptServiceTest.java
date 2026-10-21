package com.orithos.tenant;

import com.orithos.modules.vendor.Vendor;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.time.LocalDateTime;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class TenantProvisionAttemptServiceTest {

    private final TenantProvisionAttemptMapper mapper = mock(TenantProvisionAttemptMapper.class);
    private final TenantProvisionAttemptService service = new TenantProvisionAttemptService(mapper);

    @Test
    void startsPersistedAttemptWithTenantAndTrigger() {
        Vendor tenant = new Vendor();
        tenant.setId(42L);
        tenant.setName("Example Store");
        tenant.setSubdomain("example");
        when(mapper.insertAttempt(any(TenantProvisionAttemptEntry.class))).thenReturn(1);

        String attemptId = service.start(tenant, "ADMIN_RETRY");

        ArgumentCaptor<TenantProvisionAttemptEntry> entry = ArgumentCaptor.forClass(TenantProvisionAttemptEntry.class);
        verify(mapper).insertAttempt(entry.capture());
        assertEquals(attemptId, entry.getValue().attemptId());
        assertEquals(42L, entry.getValue().tenantId());
        assertEquals("ADMIN_RETRY", entry.getValue().triggerType());
        assertEquals("IN_PROGRESS", entry.getValue().outcome());
        assertNotNull(entry.getValue().startedAt());
    }

    @Test
    void persistsFailedStepAndRedactsSecretsFromFailureSummary() {
        when(mapper.insertStep(any(), eq("attempt-1"), eq("ODOO_AUTHENTICATION"), any(LocalDateTime.class)))
                .thenReturn(1);
        when(mapper.setCurrentStep("attempt-1", "ODOO_AUTHENTICATION")).thenReturn(1);
        when(mapper.finishStep(any(), eq("FAILED"), eq(null), eq("IllegalStateException"),
                eq("password=[REDACTED], token: [REDACTED]"), any(LocalDateTime.class))).thenReturn(1);
        when(mapper.clearCurrentStep("attempt-1", "ODOO_AUTHENTICATION")).thenReturn(1);

        String stepId = service.beginStep("attempt-1", "ODOO_AUTHENTICATION");
        service.failStep("attempt-1", stepId, "ODOO_AUTHENTICATION",
                new IllegalStateException("password=hidden, token: abc123"));

        verify(mapper).finishStep(eq(stepId), eq("FAILED"), eq(null), eq("IllegalStateException"),
                eq("password=[REDACTED], token: [REDACTED]"), any(LocalDateTime.class));
    }

    @Test
    void surfacesAttemptCompletionPersistenceFailure() {
        when(mapper.finishAttempt(eq("attempt-1"), eq("SUCCEEDED"), eq(null), eq(null), any(LocalDateTime.class)))
                .thenReturn(0);

        assertThrows(TenantProvisionAttemptPersistenceException.class, () -> service.succeed("attempt-1"));
    }

    @Test
    void redactsJsonCredentialsAndBearerTokens() {
        when(mapper.insertStep(any(), eq("attempt-1"), eq("ODOO_AUTHENTICATION"), any(LocalDateTime.class)))
                .thenReturn(1);
        when(mapper.setCurrentStep("attempt-1", "ODOO_AUTHENTICATION")).thenReturn(1);
        when(mapper.finishStep(any(), eq("FAILED"), isNull(), eq("IllegalStateException"), any(),
                any(LocalDateTime.class))).thenReturn(1);
        when(mapper.clearCurrentStep("attempt-1", "ODOO_AUTHENTICATION")).thenReturn(1);
        String stepId = service.beginStep("attempt-1", "ODOO_AUTHENTICATION");

        service.failStep("attempt-1", stepId, "ODOO_AUTHENTICATION",
                new IllegalStateException("{\"password\":\"hidden\",\"authorization\":\"Bearer top.secret\"}"));

        ArgumentCaptor<String> summary = ArgumentCaptor.forClass(String.class);
        verify(mapper).finishStep(eq(stepId), eq("FAILED"), isNull(), eq("IllegalStateException"),
                summary.capture(), any(LocalDateTime.class));
        assertFalse(summary.getValue().contains("hidden"));
        assertFalse(summary.getValue().contains("top.secret"));
    }
}
