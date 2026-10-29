package com.orithos.modules.ai.gateway;

import java.util.Set;

/** Pure validation shared by provider adapters and command parsing. */
public final class AiGatewayPolicy {
    private static final Set<String> FORBIDDEN_MARKERS = Set.of(
            "tenantid", "vendorid", "outletid", "sql", "select ", "insert ",
            "update ", "delete ", "odoo model", "/api/");

    private AiGatewayPolicy() {
    }

    public static String validateInput(String input, int maxChars) {
        if (input == null || input.isBlank()) {
            throw new IllegalArgumentException("AI input is required");
        }
        String normalized = input.trim();
        if (normalized.length() > maxChars) {
            throw new IllegalArgumentException("AI input is too long");
        }
        String lower = normalized.toLowerCase(java.util.Locale.ROOT);
        for (String marker : FORBIDDEN_MARKERS) {
            if (lower.contains(marker)) {
                throw new IllegalArgumentException("AI input contains a restricted control field");
            }
        }
        return normalized;
    }
}
