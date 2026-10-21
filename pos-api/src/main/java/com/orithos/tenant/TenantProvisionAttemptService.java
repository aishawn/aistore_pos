package com.orithos.tenant;

import com.orithos.modules.vendor.Vendor;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.slf4j.MDC;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

@Service
public class TenantProvisionAttemptService {

    private static final Logger log = LoggerFactory.getLogger(TenantProvisionAttemptService.class);
    private static final Pattern BEARER_TOKEN = Pattern.compile("(?i)(Bearer\\s+)[A-Za-z0-9._~+/-]+=*");
    private static final Pattern SECRET_ASSIGNMENT = Pattern.compile(
            "(?i)([\\\"']?(?:password|token|secret|api[_-]?key|authorization)[\\\"']?\\s*[:=]\\s*[\\\"']?)[^\\s\\\"',;}]+");
    private final TenantProvisionAttemptMapper mapper;

    public TenantProvisionAttemptService(TenantProvisionAttemptMapper mapper) {
        this.mapper = mapper;
    }

    @Transactional
    public String start(Vendor tenant, String triggerType) {
        AuthUser actor = CurrentUser.get();
        String correlationId = MDC.get("correlationId");
        TenantProvisionAttemptEntry entry = new TenantProvisionAttemptEntry(
                UUID.randomUUID().toString(), tenant.getId(), tenant.getName(), tenant.getSubdomain(),
                triggerType, actor == null ? null : actor.id(), actor == null ? null : actor.username(),
                correlationId, "IN_PROGRESS", null, null, null, now(), null);
        if (mapper.insertAttempt(entry) != 1) throw new IllegalStateException("Provision attempt was not persisted");
        return entry.attemptId();
    }

    @Transactional
    public String beginStep(String attemptId, String stepName) {
        String stepId = UUID.randomUUID().toString();
        if (mapper.insertStep(stepId, attemptId, stepName, now()) != 1) {
            throw new IllegalStateException("Provision step was not persisted");
        }
        if (mapper.setCurrentStep(attemptId, stepName) != 1) {
            throw new IllegalStateException("Provision attempt step could not be advanced");
        }
        return stepId;
    }

    @Transactional
    public void succeedStep(String attemptId, String stepId, String stepName, String resourceRef) {
        completeStep(attemptId, stepId, stepName, "SUCCEEDED", resourceRef, null);
    }

    @Transactional
    public void failStep(String attemptId, String stepId, String stepName, Exception error) {
        completeStep(attemptId, stepId, stepName, "FAILED", null, error);
    }

    private void completeStep(String attemptId, String stepId, String stepName, String outcome,
                              String resourceRef, Exception error) {
        String errorType = error == null ? null : error.getClass().getSimpleName();
        String errorSummary = error == null ? null : safeSummary(error.getMessage());
        try {
            int changed = mapper.finishStep(stepId, outcome, resourceRef, errorType, errorSummary, now());
            if (changed != 1) throw new IllegalStateException("Provision step result was not persisted");
        } catch (RuntimeException persistenceError) {
            log.error("Provision step result could not be persisted attemptId={} stepId={} outcome={}",
                    attemptId, stepId, outcome);
            throw new TenantProvisionAttemptPersistenceException("Provision step result could not be persisted", persistenceError);
        }
        try {
            if (mapper.clearCurrentStep(attemptId, stepName) != 1) {
                throw new IllegalStateException("Provision attempt current step could not be cleared");
            }
        } catch (RuntimeException persistenceError) {
            log.error("Provision attempt current step could not be cleared attemptId={} stepId={}", attemptId, stepId);
            throw new TenantProvisionAttemptPersistenceException("Provision attempt current step could not be cleared", persistenceError);
        }
    }

    @Transactional
    public void succeed(String attemptId) {
        finish(attemptId, "SUCCEEDED", null);
    }

    @Transactional
    public void fail(String attemptId, String stepName, Exception error) {
        if (stepName != null) {
            try {
                String stepId = beginStep(attemptId, stepName);
                failStep(attemptId, stepId, stepName, error);
            } catch (RuntimeException persistenceError) {
                log.error("Provision failure stage could not be persisted attemptId={} step={}", attemptId, stepName);
                error.addSuppressed(persistenceError);
            }
        }
        finishFailure(attemptId, error);
    }

    @Transactional
    public void finishFailure(String attemptId, Exception error) {
        finish(attemptId, "FAILED", error);
    }

    private void finish(String attemptId, String outcome, Exception error) {
        try {
            int changed = mapper.finishAttempt(attemptId, outcome,
                    error == null ? null : error.getClass().getSimpleName(),
                    error == null ? null : safeSummary(error.getMessage()), now());
            if (changed != 1) throw new IllegalStateException("Provision attempt result was not persisted");
        } catch (RuntimeException persistenceError) {
            log.error("Provision attempt result could not be persisted attemptId={} outcome={}", attemptId, outcome);
            throw new TenantProvisionAttemptPersistenceException("Provision attempt result could not be persisted", persistenceError);
        }
    }

    public List<TenantProvisionAttemptDetails> pageForTenant(long tenantId, int page, int size) {
        List<TenantProvisionAttemptEntry> attempts = mapper.pageForTenant(tenantId, size, (page - 1) * size);
        if (attempts.isEmpty()) return List.of();
        List<String> ids = attempts.stream().map(TenantProvisionAttemptEntry::attemptId).toList();
        Map<String, List<TenantProvisionAttemptStep>> stepsByAttempt = new HashMap<>();
        mapper.stepsForAttempts(ids).forEach(step ->
                stepsByAttempt.computeIfAbsent(step.attemptId(), ignored -> new ArrayList<>()).add(step));
        return attempts.stream().map(attempt -> new TenantProvisionAttemptDetails(
                attempt.attemptId(), attempt.tenantId(), attempt.tenantName(), attempt.tenantSlug(),
                attempt.triggerType(), attempt.actorId(), attempt.actorUsername(), attempt.correlationId(),
                attempt.outcome(), attempt.currentStep(), attempt.errorType(), attempt.errorSummary(),
                attempt.startedAt(), attempt.completedAt(),
                stepsByAttempt.getOrDefault(attempt.attemptId(), List.of()))).toList();
    }

    public long countForTenant(long tenantId) {
        return mapper.countForTenant(tenantId);
    }

    private static String safeSummary(String message) {
        if (message == null || message.isBlank()) return "Provisioning failed without a message";
        String redacted = BEARER_TOKEN.matcher(message).replaceAll("$1[REDACTED]");
        redacted = SECRET_ASSIGNMENT.matcher(redacted).replaceAll("$1[REDACTED]");
        return redacted.substring(0, Math.min(500, redacted.length()));
    }

    private static LocalDateTime now() {
        return LocalDateTime.now(ZoneOffset.UTC);
    }
}
