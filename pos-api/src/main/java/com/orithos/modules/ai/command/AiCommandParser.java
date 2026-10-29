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
    private static final PromptVersion PROMPT = new PromptVersion("ai-command-parser", "v1", "");
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
            JsonNode structured = normalizeProviderValue(completion.value());
            var reader = mapper.readerFor(AiCommandService.Parsed.class)
                    .with(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES);
            AiCommandService.Parsed parsed = reader.readValue(structured.traverse(mapper));
            validate(parsed);
            return parsed;
        } catch (BusinessException rejected) {
            throw rejected;
        } catch (Exception invalid) {
            throw new BusinessException(42220, "AI command output did not match the allowed schema.");
        }
    }

    /**
     * DashScope text generation can return structured output as a JSON object,
     * a JSON string, or a provider envelope containing one of those forms.
     * Unwrap only the known transport fields; the command DTO remains strict
     * so model-controlled fields still cannot bypass validation.
     */
    private JsonNode normalizeProviderValue(JsonNode value) throws Exception {
        if (value == null || value.isNull()) throw new IllegalArgumentException("empty provider output");
        JsonNode current = value;
        for (int depth = 0; depth < 3; depth++) {
            if (current.isTextual()) {
                current = mapper.readTree(extractJsonObject(current.asText()));
                continue;
            }
            if (current.isObject() && current.has("type")) return current;
            if (current.isArray()) {
                JsonNode next = null;
                for (JsonNode item : current) {
                    if (item.isObject() && item.has("type")) {
                        next = item;
                        break;
                    }
                    if (item.isTextual()) {
                        next = item;
                        break;
                    }
                    if (item.isObject() && item.has("text")) {
                        next = item.get("text");
                        break;
                    }
                }
                if (next == null) return current;
                current = next;
                continue;
            }
            JsonNode next = null;
            for (String key : List.of("output", "result", "data", "content")) {
                JsonNode candidate = current.get(key);
                if (candidate != null && !candidate.isNull()) {
                    next = candidate;
                    break;
                }
            }
            if (next == null) return current;
            current = next;
        }
        return current;
    }

    private static String stripJsonFence(String text) {
        String value = text == null ? "" : text.trim();
        if (value.startsWith("```") && value.endsWith("```")) {
            int newline = value.indexOf('\n');
            value = newline >= 0
                    ? value.substring(newline + 1, value.length() - 3)
                    : value.substring(3, value.length() - 3);
        }
        return value.trim();
    }

    private static String extractJsonObject(String text) {
        String value = stripJsonFence(text);
        int start = value.indexOf('{');
        int end = value.lastIndexOf('}');
        if (start >= 0 && end > start) return value.substring(start, end + 1).trim();
        return value;
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
