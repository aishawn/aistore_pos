package com.orithos.common;

import java.util.ArrayList;
import java.util.List;

/** RFC 4180-style CSV parser (quoted fields, escaped quotes). */
public final class CsvParser {

    private CsvParser() {}

    public static List<String[]> parse(String raw) {
        if (raw == null || raw.isBlank()) return List.of();
        String text = raw;
        if (text.charAt(0) == '\uFEFF') text = text.substring(1);

        List<String[]> rows = new ArrayList<>();
        List<String> fields = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;

        for (int i = 0; i < text.length(); i++) {
            char c = text.charAt(i);
            if (inQuotes) {
                if (c == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                        field.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field.append(c);
                }
            } else if (c == '"') {
                inQuotes = true;
            } else if (c == ',') {
                fields.add(field.toString());
                field.setLength(0);
            } else if (c == '\r') {
                // skip
            } else if (c == '\n') {
                fields.add(field.toString());
                field.setLength(0);
                if (!fields.isEmpty() && fields.stream().anyMatch(s -> !s.isBlank())) {
                    rows.add(fields.toArray(String[]::new));
                }
                fields = new ArrayList<>();
            } else {
                field.append(c);
            }
        }

        fields.add(field.toString());
        if (!fields.isEmpty() && fields.stream().anyMatch(s -> !s.isBlank())) {
            rows.add(fields.toArray(String[]::new));
        }
        return rows;
    }
}
