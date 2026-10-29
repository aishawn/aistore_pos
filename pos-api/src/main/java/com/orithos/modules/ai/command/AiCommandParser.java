package com.orithos.modules.ai.command;

import com.orithos.modules.ai.gateway.AiCompletion;
import com.orithos.modules.ai.gateway.AiGateway;
import com.orithos.modules.ai.gateway.AiTask;
import com.orithos.modules.ai.gateway.AiTenantContext;
import com.orithos.modules.ai.gateway.PromptVersion;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;

@Service
public class AiCommandParser {
    private static final String PROMPT = """
            Parse the user's POS change request into JSON only.
            Allowed type values: UPDATE_PRODUCT, UPDATE_CUSTOMER, PREVIEW_PRICE_CHANGE, PREVIEW_REPLENISHMENT.
            Return exactly: type, confidence, summary, items, changes.
            Each item may contain id only when explicitly present in the request; otherwise use null.
            Never return tenant, vendor, outlet, user, SQL, API paths, Odoo model names, or permissions.
            Do not execute anything and do not invent current values.
            """;
    private final AiGateway gateway;

    public AiCommandParser(AiGateway gateway) {
        this.gateway = gateway;
    }

    public AiCommandDtos.ParsedCommand parse(AiTenantContext tenant, String text) {
        AiCompletion<AiCommandDtos.ParsedCommand> completion = gateway.complete(
                tenant, AiTask.COMMAND_PARSE, new PromptVersion("ai-command-parse", "1", ""),
                PROMPT + "\nUser request:\n" + text, AiCommandDtos.ParsedCommand.class);
        AiCommandDtos.ParsedCommand parsed = completion.value();
        if (parsed == null || parsed.type() == null) throw new IllegalArgumentException("command type is required");
        AiCommandType.valueOf(parsed.type().trim().toUpperCase(Locale.ROOT));
        if (parsed.confidence() < 0 || parsed.confidence() > 1) throw new IllegalArgumentException("invalid command confidence");
        if (parsed.items() == null || parsed.items().isEmpty()) throw new IllegalArgumentException("a target item must be identified before preview");
        AiCommandType type = AiCommandType.valueOf(parsed.type().trim().toUpperCase(Locale.ROOT));
        int itemLimit = type == AiCommandType.UPDATE_CUSTOMER ? 20 : 50;
        if (parsed.items().size() > itemLimit) throw new IllegalArgumentException("command item limit exceeded");
        for (AiCommandDtos.ParsedItem item : parsed.items()) {
            if (item == null || item.name() == null || item.name().isBlank() || item.field() == null
                    || !allowedField(type, item.field())) {
                throw new IllegalArgumentException("command contains an unsupported or unresolved field");
            }
        }
        if (parsed.changes() != null) {
            List<String> allowedChanges = switch (type) {
                case UPDATE_PRODUCT -> List.of("displayName", "barcode", "category", "tags");
                case UPDATE_CUSTOMER -> List.of("name", "phone", "email", "address", "group");
                case PREVIEW_PRICE_CHANGE -> List.of("price", "percentage", "category", "priceRange");
                case PREVIEW_REPLENISHMENT -> List.of("targetStock", "category", "lowStock", "supplier");
            };
            if (!allowedChanges.containsAll(parsed.changes().keySet())) {
                throw new IllegalArgumentException("command contains an unsupported change field");
            }
        }
        return parsed;
    }

    private static boolean allowedField(AiCommandType type, String field) {
        return switch (type) {
            case UPDATE_PRODUCT -> List.of("displayName", "barcode", "category", "tags").contains(field);
            case UPDATE_CUSTOMER -> List.of("name", "phone", "email", "address", "group").contains(field);
            case PREVIEW_PRICE_CHANGE -> List.of("price", "percentage", "category", "priceRange").contains(field);
            case PREVIEW_REPLENISHMENT -> List.of("targetStock", "category", "lowStock", "supplier").contains(field);
        };
    }
}
