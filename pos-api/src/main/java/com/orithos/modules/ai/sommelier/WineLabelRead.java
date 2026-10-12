package com.orithos.modules.ai.sommelier;

import java.util.ArrayList;
import java.util.List;

/** Structured fields extracted from a bottle-label photo. */
public record WineLabelRead(
        String brand,
        String name,
        String vintage,
        String varietal,
        String barcode,
        List<String> queries
) {
    public WineLabelRead {
        queries = queries == null ? List.of() : List.copyOf(queries);
    }

    public String displayName() {
        List<String> parts = new ArrayList<>();
        if (notBlank(brand)) parts.add(brand.trim());
        if (notBlank(name) && (brand == null || !name.trim().equalsIgnoreCase(brand.trim()))) {
            parts.add(name.trim());
        }
        if (notBlank(vintage)) parts.add(vintage.trim());
        if (parts.isEmpty() && notBlank(varietal)) parts.add(varietal.trim());
        return String.join(" ", parts);
    }

    public List<String> searchQueries() {
        List<String> out = new ArrayList<>();
        addQuery(out, name);
        addQuery(out, brand);
        if (notBlank(brand) && notBlank(varietal)) {
            addQuery(out, brand + " " + varietal);
        }
        if (notBlank(name) && notBlank(vintage)) {
            addQuery(out, name + " " + vintage);
        }
        if (queries != null) {
            for (String q : queries) addQuery(out, q);
        }
        addQuery(out, barcode);
        return out;
    }

    private static void addQuery(List<String> out, String q) {
        if (!notBlank(q)) return;
        String t = q.trim();
        if (t.length() < 2) return;
        for (String existing : out) {
            if (existing.equalsIgnoreCase(t)) return;
        }
        out.add(t);
    }

    private static boolean notBlank(String s) {
        return s != null && !s.isBlank();
    }
}
