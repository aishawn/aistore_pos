package com.orithos.modules.ai.gateway;

import java.util.List;
import java.util.regex.Pattern;

/** Pure validation shared by provider adapters and command parsing. */
public final class AiGatewayPolicy {
    private static final List<Pattern> CONTROL_ASSIGNMENTS = List.of(
            Pattern.compile("(?i)(?:^|[\\s,{])(?:tenant_?id|vendor_?id|outlet_?id|user_?id)\\s*[:=]"),
            Pattern.compile("(?is)(?:^|[;\\n])\\s*(?:select\\s+.+\\s+from\\s+[a-z_][\\w.]*|insert\\s+into\\s+[a-z_][\\w.]*|update\\s+[a-z_][\\w.]*\\s+set|delete\\s+from\\s+[a-z_][\\w.]*)\\b"),
            Pattern.compile("(?i)(?:^|\\s)odoo\\s+model\\s*[:=]"),
            Pattern.compile("(?i)(?:^|\\s)/api/[a-z0-9_./-]+"));

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
        for (Pattern marker : CONTROL_ASSIGNMENTS) {
            if (marker.matcher(normalized).find()) {
                throw new IllegalArgumentException("AI input contains a restricted control field");
            }
        }
        return normalized;
    }
}
