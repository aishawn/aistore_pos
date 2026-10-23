package com.orithos.modules.ai.context;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.HashMap;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/** Helpers for relative follow-ups that reuse the previous report intent/slots. */
public final class FollowUpSupport {

    private static final Pattern RELATIVE_FOLLOW_UP = Pattern.compile(
            "^(?:and\\s+|那|还有|再看|换成)?\\s*"
                    + "(?:昨天|昨日|yesterday|今天|今日|today|前天|day before yesterday|"
                    + "前一天|(?:the\\s+)?day before|previous day|"
                    + "上周|上星期|last\\s+week|本周|this\\s+week|"
                    + "上个月|last\\s+month|本月|this\\s+month|"
                    + "(?:近|最近|过去)\\s*\\d+\\s*天|(?:last|past|previous)\\s+\\d+\\s+days?)"
                    + "(?:呢|吗|啊)?[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PREVIOUS_DAY_FOLLOW_UP = Pattern.compile(
            "^(?:and\\s+|那|还有|再看|换成)?\\s*"
                    + "(?:前一天|(?:the\\s+)?day before|previous day)(?:呢|吗|啊)?[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);

    private FollowUpSupport() {}

    public static boolean isRelativeFollowUp(String question) {
        if (question == null || question.isBlank()) {
            return false;
        }
        return RELATIVE_FOLLOW_UP.matcher(question.trim()).matches();
    }

    public static boolean isReportIntent(String intent) {
        return intent != null && intent.startsWith("report_");
    }

    /**
     * Recognize the assistant's own explicit historical-stock refusal in durable
     * history. This keeps a repeated relative follow-up fail-closed if Redis
     * slots were refreshed from an older history snapshot without the derived
     * intent field.
     */
    public static boolean hasHistoricalStockUnavailableContext(String history) {
        if (history == null || history.isBlank()) {
            return false;
        }
        String normalized = history.toLowerCase(Locale.ROOT);
        return normalized.contains("historical stock is unavailable")
                || normalized.contains("stock reports show a live snapshot")
                || normalized.contains("历史库存查询暂不可用")
                || normalized.contains("历史库存不可用");
    }

    /** Copy category/query/days from prior turn when the new slots omit them. */
    public static Map<String, String> mergeMissingSlots(
            Map<String, String> current, Map<String, String> previous) {
        Map<String, String> out = new HashMap<>();
        if (current != null) {
            out.putAll(current);
        }
        if (previous == null || previous.isEmpty()) {
            return out;
        }
        for (String key : new String[] {"category", "query", "days"}) {
            String existing = out.get(key);
            String prior = previous.get(key);
            if ((existing == null || existing.isBlank()) && prior != null && !prior.isBlank()) {
                out.put(key, prior);
            }
        }
        return out;
    }

    public static Map<String, String> mergeFollowUpSlots(
            String question, String previousIntent,
            Map<String, String> current, Map<String, String> previous) {
        if (!isRelativeFollowUp(question) || !isReportIntent(previousIntent)
                || "report_adhoc".equals(previousIntent)) {
            return current == null ? Map.of() : new HashMap<>(current);
        }
        Map<String, String> priorFilters = new HashMap<>();
        if (previous != null) {
            for (String key : new String[] {"category", "query"}) {
                String value = previous.get(key);
                if (value != null && !value.isBlank()) priorFilters.put(key, value);
            }
        }
        Map<String, String> out = mergeMissingSlots(current, priorFilters);
        if (isPreviousDayFollowUp(question)) {
            try {
                LocalDate dayBefore = LocalDate.parse(previous.get("from")).minusDays(1);
                out.put("from", dayBefore.toString());
                out.put("to", dayBefore.toString());
                out.remove("days");
            } catch (DateTimeParseException | NullPointerException ignored) {
                // Keep the current slots when the prior report has no valid date anchor.
            }
        }
        return out;
    }

    private static boolean isPreviousDayFollowUp(String question) {
        return question != null && PREVIOUS_DAY_FOLLOW_UP.matcher(question.trim()).matches();
    }

    public static String normalizeSurface(String surface) {
        if (surface == null || surface.isBlank()) {
            return "";
        }
        String s = surface.trim().toLowerCase(Locale.ROOT);
        return switch (s) {
            case "sell", "products", "stock", "customers", "reports", "sommelier", "invoices" -> s;
            default -> s.length() > 32 ? s.substring(0, 32) : s;
        };
    }
}
