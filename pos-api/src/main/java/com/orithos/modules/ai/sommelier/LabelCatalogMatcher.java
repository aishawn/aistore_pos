package com.orithos.modules.ai.sommelier;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;

/** Rank store SKUs against OCR/vision fields. No vector search. */
public final class LabelCatalogMatcher {

    private LabelCatalogMatcher() {}

    public static List<WineCandidate> rank(List<WineCandidate> catalog, WineLabelRead read, int limit) {
        if (catalog == null || catalog.isEmpty() || read == null) return List.of();
        String haystack = WineLexicon.normalize(join(read.brand(), read.name(), read.varietal(), read.vintage()));
        List<String> tokens = significantTokens(haystack);
        if (tokens.isEmpty() && (read.searchQueries().isEmpty())) return List.of();

        record Scored(WineCandidate wine, int score) {}
        List<Scored> scored = new ArrayList<>();
        for (WineCandidate wine : catalog) {
            if (wine == null || wine.name() == null) continue;
            int score = scoreName(wine.name(), tokens, haystack);
            if (score > 0) scored.add(new Scored(wine, score));
        }
        scored.sort(Comparator.comparingInt(Scored::score).reversed()
                .thenComparing(s -> s.wine().name(), String.CASE_INSENSITIVE_ORDER));
        List<WineCandidate> out = new ArrayList<>();
        for (Scored s : scored) {
            out.add(s.wine());
            if (out.size() >= limit) break;
        }
        return out;
    }

    static int scoreName(String productName, List<String> tokens, String labelNorm) {
        String n = WineLexicon.normalize(productName);
        if (n.isBlank()) return 0;
        int score = 0;
        int hits = 0;
        for (String token : tokens) {
            if (n.contains(token)) {
                hits++;
                score += Math.min(12, token.length());
            }
        }
        if (hits == 0) return 0;
        if (tokens.size() >= 2 && hits < 2 && score < 8) return 0;
        if (!labelNorm.isBlank() && n.contains(labelNorm)) score += 20;
        return score + hits;
    }

    static List<String> significantTokens(String normalized) {
        List<String> out = new ArrayList<>();
        if (normalized == null || normalized.isBlank()) return out;
        for (String raw : normalized.toLowerCase(Locale.ROOT).split(" ")) {
            String t = raw.trim();
            if (t.length() < 3) continue;
            if (STOP.contains(t)) continue;
            if (t.chars().allMatch(Character::isDigit) && t.length() != 4) continue;
            if (!out.contains(t)) out.add(t);
        }
        return out;
    }

    private static String join(String... parts) {
        StringBuilder sb = new StringBuilder();
        for (String p : parts) {
            if (p == null || p.isBlank()) continue;
            if (!sb.isEmpty()) sb.append(' ');
            sb.append(p);
        }
        return sb.toString();
    }

    private static final List<String> STOP = List.of(
            "the", "and", "wine", "wines", "red", "white", "rose", "rose", "bottle",
            "ml", "750ml", "750", "vint", "est", "ltd", "pty");
}
