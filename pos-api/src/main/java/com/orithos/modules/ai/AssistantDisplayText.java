package com.orithos.modules.ai;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Shared formatting for in-chat assistant briefs: strip import/test noise from
 * Odoo display names and keep shelf prices to two decimals.
 */
public final class AssistantDisplayText {

    /** Bracketed import / archive ids, e.g. {@code [R2-11eee66f…]} or {@code [SKU-123]}. */
    private static final Pattern BRACKETED_ID = Pattern.compile(
            "\\[(?:R2|SKU|ID)[-_][A-Za-z0-9]+]\\s*",
            Pattern.CASE_INSENSITIVE);
    /** Demo / seed prefixes before a pipe, e.g. {@code R2 TEST |}. */
    private static final Pattern TEST_PREFIX = Pattern.compile(
            "^(?:R2\\s+)?TEST(?:\\s+DATA)?\\s*[|：:]\\s*",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern MULTI_SPACE = Pattern.compile("\\s+");

    private AssistantDisplayText() {
    }

    public static String productName(String raw) {
        if (raw == null || raw.isBlank()) {
            return "Product";
        }
        String name = raw.trim();
        name = BRACKETED_ID.matcher(name).replaceAll("");
        name = TEST_PREFIX.matcher(name).replaceFirst("");
        // If a pipe still separates a short warehouse/seed tag from the label, keep the right side.
        int pipe = name.indexOf('|');
        if (pipe >= 0 && pipe < name.length() - 1) {
            String left = name.substring(0, pipe).trim();
            String right = name.substring(pipe + 1).trim();
            if (!right.isBlank() && (left.isBlank() || left.length() <= 12 || looksLikeSeedTag(left))) {
                name = right;
            }
        }
        name = MULTI_SPACE.matcher(name).replaceAll(" ").trim();
        return name.isBlank() ? "Product" : name;
    }

    public static String money(BigDecimal value) {
        if (value == null) {
            return null;
        }
        return value.setScale(2, RoundingMode.HALF_UP).toPlainString();
    }

    public static String money(double value) {
        if (!Double.isFinite(value)) {
            return "0.00";
        }
        return String.format(Locale.ROOT, "%.2f", value);
    }

    private static boolean looksLikeSeedTag(String left) {
        String u = left.toUpperCase(Locale.ROOT);
        return u.contains("TEST") || u.startsWith("R2") || u.equals("DEMO") || u.equals("SEED");
    }
}
