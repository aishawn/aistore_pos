package com.orithos.modules.ai.command;

import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.config.CorrelationIdContext;
import com.orithos.modules.ai.gateway.AiCompletion;
import com.orithos.modules.ai.gateway.AiGateway;
import com.orithos.modules.ai.gateway.AiGatewayPolicy;
import com.orithos.modules.ai.gateway.AiTask;
import com.orithos.modules.ai.gateway.AiTenantContext;
import com.orithos.modules.ai.gateway.PromptVersion;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

import static com.orithos.modules.ai.command.AiCommandDtos.CommandItem;

/** Converts natural language into a strict command draft; it never resolves or writes business records. */
@Component
public class AiCommandParser {
    private static final PromptVersion PROMPT = new PromptVersion("ai-command-parser", "v1");
    private static final Set<String> CONTROL_KEYS = Set.of(
            "tenantid", "tenant_id", "vendorid", "vendor_id", "outletid", "outlet_id", "userid", "user_id",
            "sql", "model", "odoomodel", "odoo_model", "apipath", "api_path");
    private static final Set<String> PRODUCT_FIELDS = Set.of("name", "barcode", "category", "tag");
    private static final Set<String> CUSTOMER_FIELDS = Set.of("name", "phone", "email", "address", "group");

    private final AiGateway gateway;
    private final ObjectMapper mapper;

    public AiCommandParser(AiGateway gateway, ObjectMapper mapper) {
        this.gateway = gateway;
        this.mapper = mapper;
    }

    public AiCommandService.Parsed parse(TenantContext tenant, String text) {
        if (tenant == null || tenant.requireOutletId() == null || tenant.userId() <= 0) {
            throw new BusinessException(40100, "AI command scope is unavailable.");
        }
        String normalized = AiGatewayPolicy.validateInput(text, 12_000);
        AiTenantContext scope = new AiTenantContext(tenant.vendorId(), tenant.requireOutletId(), tenant.userId(),
                CorrelationIdContext.current());
        String input = "Return JSON only for this schema: {type, confidence, summary, items, changes, excluded}. "
                + "Allowed type values: UPDATE_PRODUCT, UPDATE_CUSTOMER, PREVIEW_PRICE_CHANGE, "
                + "PREVIEW_REPLENISHMENT. Each item may contain only id, name, field, before, after, reason, status. "
                + "Do not return tenant IDs, outlet IDs, SQL, API paths, Odoo model names, or credentials. "
                + "Resolve no record and perform no action. User request: " + normalized;
        AiCompletion<JsonNode> completion;
        try {
            completion = gateway.complete(scope, AiTask.COMMAND_PARSE, PROMPT, input, JsonNode.class);
        } catch (RuntimeException failure) {
            throw new BusinessException(50320, "AI command parser is temporarily unavailable.");
        }
        try {
            var reader = mapper.readerFor(AiCommandService.Parsed.class)
                    .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
            AiCommandService.Parsed parsed = reader.readValue(completion.value().traverse(mapper));
            validate(parsed);
            return parsed;
        } catch (BusinessException rejected) {
            throw rejected;
        } catch (Exception invalid) {
            throw new BusinessException(42220, "AI command output did not match the allowed schema.");
        }
    }

    private void validate(AiCommandService.Parsed parsed) {
        if (parsed == null || parsed.type() == null || parsed.confidence() == null
                || parsed.confidence().compareTo(BigDecimal.ZERO) < 0
                || parsed.confidence().compareTo(BigDecimal.ONE) > 0
                || parsed.summary() == null || parsed.summary().isBlank()) {
            throw new BusinessException(42220, "AI command output is incomplete.");
        }
        List<CommandItem> items = parsed.items() == null ? List.of() : parsed.items();
        List<CommandItem> excluded = parsed.excluded() == null ? List.of() : parsed.excluded();
        int max = parsed.type() == AiCommandType.UPDATE_CUSTOMER ? 20 : 50;
        if (items.size() > max || excluded.size() > max) throw new BusinessException(42220, "AI command item limit exceeded.");
        for (CommandItem item : items) validateItem(parsed.type(), item, true);
        for (CommandItem item : excluded) validateItem(parsed.type(), item, false);
        Set<String> allowedChanges = switch (parsed.type()) {
            case UPDATE_PRODUCT, UPDATE_CUSTOMER -> Set.of("field");
            case PREVIEW_PRICE_CHANGE -> Set.of("percent", "direction", "amount");
            case PREVIEW_REPLENISHMENT -> Set.of("request", "target", "quantity");
        };
        if (parsed.changes() != null) {
            for (String key : parsed.changes().keySet()) {
                String normalized = key == null ? "" : key.toLowerCase(Locale.ROOT).replace("-", "");
                if (CONTROL_KEYS.contains(normalized) || !allowedChanges.contains(normalized)) {
                    throw new BusinessException(42220, "AI command contains an unsupported field.");
                }
            }
        }
    }

    private void validateItem(AiCommandType type, CommandItem item, boolean ready) {
        if (item == null || item.name() == null || item.name().isBlank()
                || (ready && (item.id() == null || item.id() <= 0))) {
            throw new BusinessException(42220, "AI command item is incomplete.");
        }
        if (!ready) return;
        Set<String> allowed = switch (type) {
            case UPDATE_PRODUCT -> PRODUCT_FIELDS;
            case UPDATE_CUSTOMER -> CUSTOMER_FIELDS;
            case PREVIEW_PRICE_CHANGE -> Set.of("price");
            case PREVIEW_REPLENISHMENT -> Set.of("quantity", "replenishment");
        };
        if (item.field() == null || !allowed.contains(item.field().toLowerCase(Locale.ROOT))) {
            throw new BusinessException(42220, "AI command field is not enabled.");
        }
        if (item.status() != null && !Set.of("READY", "EXCLUDED").contains(item.status().toUpperCase(Locale.ROOT))) {
            throw new BusinessException(42220, "AI command item status is invalid.");
        }
    }
}
