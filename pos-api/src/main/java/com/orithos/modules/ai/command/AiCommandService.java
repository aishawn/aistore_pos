package com.orithos.modules.ai.command;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.gateway.AiTenantContext;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.stereotype.Service;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

@Service
public class AiCommandService {
    private final AiCommandParser parser;
    private final AiCommandRepository repository;
    private final AiCommandPermissionService permissions;
    private final AiCommandAuditService audit;

    public AiCommandService(AiCommandParser parser, AiCommandRepository repository,
                            AiCommandPermissionService permissions, AiCommandAuditService audit) {
        this.parser = parser; this.repository = repository; this.permissions = permissions; this.audit = audit;
    }

    public AiCommandDtos.CommandResponse parse(TenantContext tenant, AiCommandDtos.ParseRequest request) {
        permissions.requirePreview();
        Long outlet = tenant.requireOutletId();
        if (outlet == null) throw new BusinessException(40010, "A store outlet is required");
        AiCommandDtos.ParsedCommand parsed = parser.parse(
                new AiTenantContext(tenant.vendorId(), outlet, tenant.userId(), "ai-command-parse"), request.text());
        AiCommandType type = AiCommandType.valueOf(parsed.type().trim().toUpperCase());
        UUID id = UUID.randomUUID();
        String version = UUID.randomUUID().toString();
        Instant expires = Instant.now().plus(10, ChronoUnit.MINUTES);
        List<AiCommandDtos.CommandItem> items = (parsed.items() == null ? List.<AiCommandDtos.ParsedItem>of() : parsed.items()).stream()
                // Model-supplied IDs/current values are not authoritative; a resolver must populate them.
                .map(i -> new AiCommandDtos.CommandItem(null, i.name(), i.field(), null, i.after(), i.evidence(),
                        "Target resolution adapter is not configured", null))
                .collect(Collectors.toList());
        repository.insert(id, tenant, type, AiCommandStatus.DRAFT, redactSourceText(request.text()), request.threadId(),
                parsed.confidence(), expires, version, items, List.of(), parsed.changes(), id.toString());
        audit.record(tenant, id, "PARSED_UNRESOLVED", AiCommandStatus.DRAFT, AiCommandStatus.DRAFT,
                null, Map.of("type", type.name(), "itemCount", items.size(), "confidence", parsed.confidence()));
        return response(id, type, AiCommandStatus.DRAFT, parsed.confidence(),
                "Request parsed. A verified business target and current value are required before preview.", items, List.of(), expires, version, null);
    }

    public AiCommandDtos.CommandResponse get(TenantContext tenant, UUID id) {
        permissions.requirePreview();
        return fromDraft(require(id, tenant));
    }

    public AiCommandDtos.CommandResponse cancel(TenantContext tenant, UUID id) {
        permissions.requirePreview();
        AiCommandRepository.Draft draft = require(id, tenant);
        if (terminal(draft.status())) return fromDraft(draft);
        repository.updateStatus(id, tenant, draft.status(), AiCommandStatus.CANCELLED);
        audit.record(tenant, id, "CANCELLED", draft.status(), AiCommandStatus.CANCELLED, null, Map.of());
        return fromDraft(require(id, tenant));
    }

    public AiCommandDtos.CommandResponse confirm(TenantContext tenant, UUID id, AiCommandDtos.ConfirmRequest request) {
        permissions.requireConfirm();
        AiCommandRepository.Draft draft = require(id, tenant);
        if (draft.expiresAt().isBefore(Instant.now())) throw new BusinessException(40910, "Command has expired");
        if (!"确认修改".equals(request.confirmationText()) && !"确认执行".equals(request.confirmationText())
                && !"confirm".equalsIgnoreCase(request.confirmationText())) {
            throw new BusinessException(40010, "Explicit confirmation is required");
        }
        // The write adapters are deliberately not implicit. Until an adapter is registered,
        // confirmation cannot mutate Odoo and remains an auditable rejection.
        if (request.expectedVersion() == null || !request.expectedVersion().equals(draft.version())) {
            throw new BusinessException(40912, "Command preview version is stale");
        }
        repository.updateStatus(id, tenant, draft.status(), AiCommandStatus.REJECTED);
        audit.record(tenant, id, "EXECUTION_BLOCKED", draft.status(), AiCommandStatus.REJECTED,
                request.confirmationMode(), Map.of("reason", "EXECUTOR_DISABLED"));
        throw new BusinessException(40911, "Command execution adapter is not enabled; no business data was changed");
    }

    private AiCommandRepository.Draft require(UUID id, TenantContext tenant) {
        AiCommandRepository.Draft draft = repository.find(id, tenant);
        if (draft == null) throw new BusinessException(40410, "AI command was not found");
        return draft;
    }
    private AiCommandDtos.CommandResponse fromDraft(AiCommandRepository.Draft d) {
        return response(d.id(), d.type(), d.status(), d.confidence(), d.type().name(), d.items(), d.excludedItems(), d.expiresAt(), d.version(), null);
    }
    private static AiCommandDtos.CommandResponse response(UUID id, AiCommandType type, AiCommandStatus status, double confidence,
                                                           String summary, List<AiCommandDtos.CommandItem> items,
                                                           List<AiCommandDtos.CommandItem> excluded, Instant expires, String version, String error) {
        return new AiCommandDtos.CommandResponse(id, type, status, confidence, true, summary,
                items == null ? List.of() : items, excluded == null ? List.of() : excluded, expires, version, error);
    }
    private static boolean terminal(AiCommandStatus status) {
        return status == AiCommandStatus.APPLIED || status == AiCommandStatus.FAILED || status == AiCommandStatus.REJECTED
                || status == AiCommandStatus.EXPIRED || status == AiCommandStatus.STALE || status == AiCommandStatus.CANCELLED;
    }

    private static String redactSourceText(String value) {
        return value.replaceAll("(?i)[A-Z0-9._%+-]+@[A-Z0-9.-]+\\.[A-Z]{2,}", "[redacted-email]")
                .replaceAll("(?<!\\w)(?:\\+?\\d[\\d ()-]{7,}\\d)(?!\\w)", "[redacted-phone]");
    }
}
