package com.orithos.modules.ai.sommelier;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Objects;
import java.util.Set;

/**
 * Hard-filter inventory then score taste / food / occasion. Picks Good / Better / Best.
 */
public final class WineMatcher {

    public record ScoredWine(
            WineCandidate wine,
            double match,
            double drynessMatch,
            double bodyMatch,
            double foodMatch,
            double tasteMatch,
            double businessFit,
            double confidence
    ) {}

    public record TierPick(ScoredWine goodValue, ScoredWine bestMatch, ScoredWine premium) {
        public List<ScoredWine> asList() {
            List<ScoredWine> out = new ArrayList<>();
            if (goodValue != null) out.add(goodValue);
            if (bestMatch != null && (goodValue == null
                    || !bestMatch.wine().productId().equals(goodValue.wine().productId()))) {
                out.add(bestMatch);
            }
            if (premium != null
                    && (goodValue == null || !premium.wine().productId().equals(goodValue.wine().productId()))
                    && (bestMatch == null || !premium.wine().productId().equals(bestMatch.wine().productId()))) {
                out.add(premium);
            }
            return out;
        }
    }

    public List<ScoredWine> match(List<WineCandidate> inventory, CustomerWineProfile profile) {
        List<WineCandidate> filtered = hardFilter(inventory, profile);
        List<ScoredWine> scored = new ArrayList<>(filtered.size());
        for (WineCandidate wine : filtered) {
            scored.add(score(wine, profile));
        }
        scored.sort(Comparator.comparingDouble(ScoredWine::match).reversed()
                .thenComparing(s -> s.wine().effectivePrice()));
        return scored;
    }

    public TierPick pickThree(List<ScoredWine> scored) {
        if (scored == null || scored.isEmpty()) {
            return new TierPick(null, null, null);
        }
        List<ScoredWine> unique = distinctProducts(scored);
        ScoredWine bestMatch = unique.get(0);

        List<ScoredWine> byPrice = new ArrayList<>(unique);
        byPrice.sort(Comparator.comparing(s -> s.wine().effectivePrice()));

        ScoredWine good = pickBestInPriceBand(byPrice, 0.0, 0.45, bestMatch);
        if (good == null) good = byPrice.get(0);

        ScoredWine premium = pickBestInPriceBand(byPrice, 0.55, 1.01, bestMatch);
        if (premium == null) premium = byPrice.get(byPrice.size() - 1);

        if (Objects.equals(good.wine().productId(), bestMatch.wine().productId()) && unique.size() > 1) {
            Long goodId = good.wine().productId();
            ScoredWine nextBest = null;
            for (ScoredWine s : unique) {
                if (!s.wine().productId().equals(goodId)) {
                    nextBest = s;
                    break;
                }
            }
            if (nextBest != null) bestMatch = nextBest;
        }
        if (Objects.equals(premium.wine().productId(), good.wine().productId())
                || Objects.equals(premium.wine().productId(), bestMatch.wine().productId())) {
            Long goodId = good.wine().productId();
            Long bestId = bestMatch.wine().productId();
            ScoredWine nextPremium = null;
            for (ScoredWine s : unique) {
                Long id = s.wine().productId();
                if (id.equals(goodId) || id.equals(bestId)) continue;
                if (nextPremium == null
                        || s.wine().effectivePrice().compareTo(nextPremium.wine().effectivePrice()) > 0) {
                    nextPremium = s;
                }
            }
            if (nextPremium != null) premium = nextPremium;
        }
        if (unique.size() == 1) {
            return new TierPick(unique.get(0), null, null);
        }
        if (unique.size() == 2) {
            ScoredWine cheaper = byPrice.get(0);
            ScoredWine dearer = byPrice.get(1);
            ScoredWine better = cheaper.match() >= dearer.match() ? cheaper : dearer;
            return new TierPick(cheaper, better, dearer);
        }
        return new TierPick(good, bestMatch, premium);
    }

    public List<ScoredWine> similar(List<WineCandidate> inventory, WineCandidate current, String direction) {
        CustomerWineProfile profile = profileFrom(current);
        List<ScoredWine> scored = new ArrayList<>();
        for (WineCandidate wine : inventory) {
            if (wine.productId().equals(current.productId())) continue;
            if (!wine.inStock()) continue;
            if (profile.hasTypeFilter() && wine.profile() != null
                    && wine.profile().wineType() != null
                    && !profile.wineType().equalsIgnoreCase(wine.profile().wineType())) {
                continue;
            }
            BigDecimal price = wine.effectivePrice();
            BigDecimal currentPrice = current.effectivePrice();
            if ("cheaper".equalsIgnoreCase(direction) && price.compareTo(currentPrice) >= 0) continue;
            if ("upgrade".equalsIgnoreCase(direction) && price.compareTo(currentPrice) <= 0) continue;
            scored.add(score(wine, profile));
        }
        scored.sort(Comparator.comparingDouble(ScoredWine::match).reversed());
        if (scored.size() > 5) {
            return List.copyOf(scored.subList(0, 5));
        }
        return List.copyOf(scored);
    }

    List<WineCandidate> hardFilter(List<WineCandidate> inventory, CustomerWineProfile profile) {
        List<WineCandidate> out = new ArrayList<>();
        for (WineCandidate wine : inventory) {
            if (wine == null || wine.productId() == null) continue;
            if (!wine.inStock()) continue;
            if (profile.hasTypeFilter()) {
                String type = wine.profile() != null ? wine.profile().wineType() : null;
                if (type == null || !compatibleType(profile.wineType(), type)) continue;
            }
            if (profile.hasBudget()) {
                BigDecimal price = wine.effectivePrice();
                BigDecimal min = profile.budgetMin();
                BigDecimal max = profile.budgetMax();
                if (min != null && price.compareTo(min) < 0) continue;
                if (max != null && price.compareTo(max) > 0) continue;
            }
            out.add(wine);
        }
        return out;
    }

    ScoredWine score(WineCandidate wine, CustomerWineProfile profile) {
        WineProfile p = wine.profile() != null ? wine.profile() : WineProfile.empty("red");
        double dryness = closeness(profile.dryness(), p.dryness());
        double body = closeness(profile.body(), p.body());
        double fruit = closeness(profile.fruitiness(), p.fruitiness());
        double oak = closeness(profile.oak(), p.oak());
        double tannin = closeness(profile.tannin(), p.tannin());
        double food = foodMatch(profile.food(), p.foodTags());
        double taste = averagePresent(fruit, oak, tannin);

        double weight = 0;
        double acc = 0;
        if (profile.dryness() != null) { acc += 0.22 * dryness; weight += 0.22; }
        if (profile.body() != null) { acc += 0.22 * body; weight += 0.22; }
        if (!profile.food().isEmpty()) { acc += 0.26 * food; weight += 0.26; }
        if (profile.fruitiness() != null) { acc += 0.10 * fruit; weight += 0.10; }
        if (profile.oak() != null) { acc += 0.08 * oak; weight += 0.08; }
        if (profile.tannin() != null) { acc += 0.10 * tannin; weight += 0.10; }
        double occasion = occasionBoost(profile.occasion(), wine, p);
        acc += 0.08 * occasion;
        weight += 0.08;
        double match = weight == 0 ? 0.72 : acc / weight;

        double stockPenalty = stockFactor(wine.stock(), wine.trackInventory());
        match = clamp(match * stockPenalty);

        double business = clamp(0.55 + 0.45 * stockFactor(wine.stock(), wine.trackInventory()));
        if (wine.onPromotion()) business = clamp(business + 0.08);
        double confidence = clamp(0.55 + 0.2 * (p.inferred() ? 0.7 : 1.0) + 0.25 * match);
        return new ScoredWine(wine, match, dryness, body, food, taste, business, confidence);
    }

    private static CustomerWineProfile profileFrom(WineCandidate current) {
        WineProfile p = current.profile();
        if (p == null) {
            return new CustomerWineProfile("not_sure", null, null, null, null, null, null, null, List.of(), null);
        }
        return new CustomerWineProfile(
                p.wineType(),
                null,
                null,
                p.dryness(),
                p.body(),
                p.fruitiness(),
                p.oak(),
                p.tannin(),
                p.foodTags(),
                null
        );
    }

    static boolean compatibleType(String wanted, String actual) {
        if (wanted.equals(actual)) return true;
        if ("sparkling".equals(wanted) && "champagne".equals(actual)) return true;
        if ("champagne".equals(wanted) && "sparkling".equals(actual)) return false;
        return false;
    }

    static double closeness(Double wanted, Double actual) {
        if (wanted == null) return 1.0;
        if (actual == null) return 0.45;
        return clamp(1.0 - Math.abs(wanted - actual) / 0.9);
    }

    static double foodMatch(List<String> wanted, List<String> have) {
        if (wanted == null || wanted.isEmpty()) return 1.0;
        if (have == null || have.isEmpty()) return 0.45;
        Set<String> haveSet = new HashSet<>();
        for (String h : have) {
            String c = WineLexicon.canonicalFoodOne(h);
            if (c != null) haveSet.add(c);
        }
        int hits = 0;
        for (String w : wanted) {
            String c = WineLexicon.canonicalFoodOne(w);
            if (c != null && haveSet.contains(c)) hits++;
        }
        if (hits == 0) return 0.38;
        return clamp(0.72 + 0.28 * ((double) hits / wanted.size()));
    }

    static double occasionBoost(String occasion, WineCandidate wine, WineProfile profile) {
        if (occasion == null || occasion.isBlank()) return 0.8;
        String o = occasion.toLowerCase(Locale.ROOT);
        String type = profile.wineType() == null ? "" : profile.wineType();
        double price = wine.effectivePrice().doubleValue();
        return switch (o) {
            case "gift", "special", "special occasion" -> {
                double v = type.equals("champagne") || type.equals("sparkling") ? 1.0 : 0.72;
                if (price >= 25) v += 0.08;
                yield clamp(v);
            }
            case "party" -> clamp(type.equals("sparkling") || type.equals("rose") ? 1.0 : 0.75);
            case "bbq" -> foodMatch(List.of("bbq", "steak"), profile.foodTags());
            case "date", "date night" -> clamp((profile.body() != null && profile.body() >= 0.6) ? 0.9 : 0.78);
            case "relaxing", "relaxing at home" -> clamp((profile.tannin() == null || profile.tannin() <= 0.55) ? 0.92 : 0.7);
            default -> 0.82;
        };
    }

    static double stockFactor(double stock, boolean track) {
        if (!track) return 1.0;
        if (stock <= 0) return 0.0;
        if (stock <= 2) return 0.90;
        if (stock <= 5) return 0.96;
        return 1.0;
    }

    private static ScoredWine pickBestInPriceBand(List<ScoredWine> byPrice, double fromFrac, double toFrac,
                                                 ScoredWine preferNot) {
        if (byPrice.isEmpty()) return null;
        int n = byPrice.size();
        int from = Math.min(n - 1, Math.max(0, (int) Math.floor(fromFrac * n)));
        int to = Math.min(n, Math.max(from + 1, (int) Math.ceil(toFrac * n)));
        ScoredWine best = null;
        for (int i = from; i < to; i++) {
            ScoredWine s = byPrice.get(i);
            if (best == null || s.match() > best.match()) best = s;
        }
        if (best != null && preferNot != null
                && Objects.equals(best.wine().productId(), preferNot.wine().productId())
                && to - from > 1) {
            ScoredWine alt = null;
            for (int i = from; i < to; i++) {
                ScoredWine s = byPrice.get(i);
                if (Objects.equals(s.wine().productId(), preferNot.wine().productId())) continue;
                if (alt == null || s.match() > alt.match()) alt = s;
            }
            if (alt != null) return alt;
        }
        return best;
    }

    private static List<ScoredWine> distinctProducts(List<ScoredWine> scored) {
        List<ScoredWine> out = new ArrayList<>();
        Set<Long> seen = new HashSet<>();
        for (ScoredWine s : scored) {
            if (seen.add(s.wine().productId())) out.add(s);
        }
        return out;
    }

    private static double averagePresent(double... values) {
        double sum = 0;
        for (double v : values) sum += v;
        return values.length == 0 ? 1.0 : sum / values.length;
    }

    static double clamp(double v) {
        if (v < 0) return 0;
        if (v > 1) return 1;
        return v;
    }

    public static int pct(double v) {
        return (int) Math.round(clamp(v) * 100);
    }
}
