package com.orithos.common;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.Arrays;
import java.util.stream.Collectors;

/** Minimal CSV builder with RFC 4180-style escaping. */
public final class CsvUtils {

    private static final DateTimeFormatter DATE = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter DATETIME = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private CsvUtils() {}

    public static String escape(Object value) {
        if (value == null) return "";
        String s;
        if (value instanceof LocalDate d) {
            s = d.format(DATE);
        } else if (value instanceof LocalDateTime dt) {
            s = dt.format(DATETIME);
        } else if (value instanceof Boolean b) {
            s = b ? "Yes" : "No";
        } else {
            s = String.valueOf(value);
        }
        if (s.contains(",") || s.contains("\"") || s.contains("\n") || s.contains("\r")) {
            return "\"" + s.replace("\"", "\"\"") + "\"";
        }
        return s;
    }

    /** Build a CSV row; null values are allowed and exported as empty cells. */
    public static String row(Object... values) {
        return Arrays.stream(values).map(CsvUtils::escape).collect(Collectors.joining(","));
    }

    public static String headerRow(String... headers) {
        return row((Object[]) headers);
    }

    /** Prefix UTF-8 BOM so Excel opens the file with the correct encoding. */
    public static byte[] toUtf8Bytes(String csv) {
        return ("\uFEFF" + csv).getBytes(java.nio.charset.StandardCharsets.UTF_8);
    }
}
