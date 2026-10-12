package com.orithos.modules.ai.report;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Maps cashier Chinese category words onto English catalogue names
 * (seed data uses "Beer Local", not "啤酒").
 */
public final class CategoryLexicon {

    private static final Pattern LIKE_PRED = Pattern.compile(
            "(?i)((?:[a-z_][\\w$]*\\.)?(?:category_name|name))\\s+LIKE\\s+'%([^%']+)%'");

    private static final List<Set<String>> GROUPS = List.of(
            Set.of("啤酒", "beer", "ale", "lager"),
            Set.of("可乐", "cola", "coke", "coca"),
            Set.of("威士忌", "whisky", "whiskey")
    );

    private static final Map<String, Set<String>> INDEX = index();

    private CategoryLexicon() {}

    public static List<String> searchTerms(String raw) {
        String token = normalize(raw);
        if (token == null) {
            return List.of();
        }
        Set<String> out = new LinkedHashSet<>();
        out.add(token);
        Set<String> group = INDEX.get(token.toLowerCase(Locale.ROOT));
        if (group != null) {
            out.addAll(group);
        }
        return List.copyOf(out);
    }

    /**
     * Rewrites {@code col LIKE '%啤酒%'} into {@code (col LIKE '%啤酒%' OR col LIKE '%beer%' ...)}
     * so NL2SQL that only emitted the Chinese token still hits English categories.
     */
    public static String expandLikePredicates(String sql) {
        if (sql == null || sql.isBlank()) {
            return sql;
        }
        Matcher m = LIKE_PRED.matcher(sql);
        StringBuilder sb = new StringBuilder();
        while (m.find()) {
            String col = m.group(1);
            List<String> terms = searchTerms(m.group(2));
            if (terms.size() <= 1) {
                m.appendReplacement(sb, Matcher.quoteReplacement(m.group(0)));
                continue;
            }
            List<String> parts = new ArrayList<>();
            for (String term : terms) {
                parts.add(col + " LIKE '%" + term.replace("'", "''") + "%'");
            }
            m.appendReplacement(sb, Matcher.quoteReplacement("(" + String.join(" OR ", parts) + ")"));
        }
        m.appendTail(sb);
        return sb.toString();
    }

    static String normalize(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String v = raw.trim();
        if (v.endsWith("类") && v.length() > 1) {
            v = v.substring(0, v.length() - 1).trim();
        }
        return v.isBlank() ? null : v;
    }

    private static Map<String, Set<String>> index() {
        Map<String, Set<String>> map = new java.util.HashMap<>();
        for (Set<String> group : GROUPS) {
            for (String term : group) {
                map.put(term.toLowerCase(Locale.ROOT), group);
            }
        }
        return Map.copyOf(map);
    }
}
