package com.orithos.modules.ai.report;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * JDBC date/time cells as ISO strings so JSON does not emit Jackson default-typing
 * arrays like {@code ["java.sql.Date", 1787068800000]}.
 */
public final class ReportJsonCells {

    private ReportJsonCells() {}

    public static Map<String, Object> copyRow(Map<String, ?> row) {
        Map<String, Object> line = new LinkedHashMap<>();
        if (row == null) {
            return line;
        }
        row.forEach((k, v) -> {
            if (k != null) {
                line.put(k, toJsonValue(v));
            }
        });
        return line;
    }

    public static Object toJsonValue(Object raw) {
        if (raw == null) {
            return null;
        }
        Object unwrapped = unwrapTyped(raw);
        if (unwrapped instanceof java.sql.Date d) {
            return d.toLocalDate().toString();
        }
        if (unwrapped instanceof Timestamp ts) {
            return ts.toLocalDateTime().toString();
        }
        if (unwrapped instanceof java.sql.Time t) {
            return t.toLocalTime().toString();
        }
        if (unwrapped instanceof LocalDate d) {
            return d.toString();
        }
        if (unwrapped instanceof LocalDateTime dt) {
            return dt.toString();
        }
        if (unwrapped instanceof LocalTime t) {
            return t.toString();
        }
        if (unwrapped instanceof BigDecimal || unwrapped instanceof Number || unwrapped instanceof Boolean
                || unwrapped instanceof String) {
            return unwrapped;
        }
        return unwrapped;
    }

    /** Jackson default-typing: {@code ["java.sql.Date", epochMillis]}. */
    static Object unwrapTyped(Object raw) {
        if (!(raw instanceof List<?> list) || list.size() != 2 || !(list.get(0) instanceof String type)) {
            return raw;
        }
        Object payload = list.get(1);
        if (!(payload instanceof Number n)) {
            return raw;
        }
        long millis = n.longValue();
        if (type.endsWith("sql.Date") || type.equals("java.sql.Date")) {
            return Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDate().toString();
        }
        if (type.contains("Timestamp") || type.equals("java.util.Date")) {
            return Instant.ofEpochMilli(millis).atZone(ZoneId.systemDefault()).toLocalDateTime()
                    .toString();
        }
        return raw;
    }
}
