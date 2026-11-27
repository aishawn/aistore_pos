package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.dto.AskRequest;
import com.orithos.modules.ai.sommelier.dto.AskResponse;
import com.orithos.modules.ai.sommelier.dto.FeedbackRequest;
import com.orithos.modules.ai.sommelier.dto.IdentifyImageResponse;
import com.orithos.modules.ai.sommelier.dto.IdentifyResponse;
import com.orithos.modules.ai.sommelier.dto.PitchRequest;
import com.orithos.modules.ai.sommelier.dto.PitchResponse;
import com.orithos.modules.ai.sommelier.dto.RecommendCard;
import com.orithos.modules.ai.sommelier.dto.RecommendRequest;
import com.orithos.modules.ai.sommelier.dto.RecommendResponse;
import com.orithos.modules.ai.sommelier.dto.SimilarRequest;
import com.orithos.modules.ai.sommelier.dto.SimilarResponse;
import com.orithos.modules.ai.sommelier.dto.WineAssistantResponse;
import com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper;
import com.orithos.modules.product.ShopfrontProductOfferService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class SommelierService {

    private static final Logger log = LoggerFactory.getLogger(SommelierService.class);

    private final SommelierCatalogService catalog;
    private final WinePitchService pitchService;
    private final SommelierProductMapper mapper;
    private final ObjectMapper objectMapper;
    private final ShopfrontProductOfferService shopfrontOffers;
    private final BusinessTimezoneService timezones;
    private final WineKnowledgeClient wineKnowledgeClient;
    private final WineMatcher matcher = new WineMatcher();

    public SommelierService(SommelierCatalogService catalog,
                            WinePitchService pitchService,
                            SommelierProductMapper mapper,
                            ObjectMapper objectMapper) {
        this(catalog, pitchService, mapper, objectMapper, null, null, null);
    }

    public SommelierService(SommelierCatalogService catalog,
                            WinePitchService pitchService,
                            SommelierProductMapper mapper,
                            ObjectMapper objectMapper,
                            ShopfrontProductOfferService shopfrontOffers,
                            BusinessTimezoneService timezones) {
        this(catalog, pitchService, mapper, objectMapper, shopfrontOffers, timezones, null);
    }

    @Autowired
    public SommelierService(SommelierCatalogService catalog,
                            WinePitchService pitchService,
                            SommelierProductMapper mapper,
                            ObjectMapper objectMapper,
                            ShopfrontProductOfferService shopfrontOffers,
                            BusinessTimezoneService timezones,
                            WineKnowledgeClient wineKnowledgeClient) {
        this.catalog = catalog;
        this.pitchService = pitchService;
        this.mapper = mapper;
        this.objectMapper = objectMapper;
        this.shopfrontOffers = shopfrontOffers;
        this.timezones = timezones;
        this.wineKnowledgeClient = wineKnowledgeClient;
    }

    public RecommendResponse recommend(RecommendRequest request, TenantContext tenant) {
        CustomerWineProfile profile = toProfile(request);
        List<WineCandidate> wines = applySingleBottleOffers(catalog.listWines(tenant), tenant);
        List<WineMatcher.ScoredWine> scored = matcher.match(wines, profile);
        boolean knowledgeBased = false;
        int verifiedProfileCount = 0;
        if (wineKnowledgeClient != null && wineKnowledgeClient.enabled() && tenant != null) {
            try {
                List<WineCandidate> eligible = knowledgeCandidates(wines, profile);
                if (!eligible.isEmpty()) {
                    Map<String, Object> knowledge = wineKnowledgeClient.recommend(
                            tenant, knowledgePreferences(profile), knowledgeCandidatePayload(eligible));
                    KnowledgeRanking ranking = applyKnowledgeRanking(eligible, profile, knowledge);
                    if (ranking != null && !ranking.items().isEmpty()) {
                        scored = ranking.items();
                        knowledgeBased = ranking.verifiedProfileCount() > 0;
                        verifiedProfileCount = ranking.verifiedProfileCount();
                    }
                }
            } catch (RuntimeException unavailable) {
                log.info("Wine knowledge service unavailable; using catalogue wine matching");
            }
        }
        if (scored.isEmpty()) {
            String reason = wines.isEmpty()
                    ? "No wine products are in this store's catalogue yet."
                    : "Nothing in stock matches that type and budget. Try widening the price range.";
            return new RecommendResponse(profile, List.of(), reason, knowledgeBased, verifiedProfileCount);
        }
        WineMatcher.TierPick pick = matcher.pickThree(scored);
        List<RecommendCard> cards = new ArrayList<>();
        addCard(cards, pick.goodValue(), "good", "Great Value", profile, pick, tenant);
        addCard(cards, pick.bestMatch(), "best", "Best Match", profile, pick, tenant);
        addCard(cards, pick.premium(), "premium", "Premium Choice", profile, pick, tenant);
        return new RecommendResponse(profile, List.copyOf(cards), null, knowledgeBased, verifiedProfileCount);
    }

    private record KnowledgeRanking(List<WineMatcher.ScoredWine> items, int verifiedProfileCount) {}

    private List<WineCandidate> knowledgeCandidates(List<WineCandidate> wines, CustomerWineProfile profile) {
        return wines.stream().filter(WineCandidate::inStock).filter(wine -> {
            BigDecimal price = wine.effectivePrice();
            return (profile.budgetMin() == null || price.compareTo(profile.budgetMin()) >= 0)
                    && (profile.budgetMax() == null || price.compareTo(profile.budgetMax()) <= 0);
        }).toList();
    }

    private Map<String, Object> knowledgePreferences(CustomerWineProfile profile) {
        LinkedHashMap<String, Object> preferences = new LinkedHashMap<>();
        if (profile.hasTypeFilter()) preferences.put("wine_type", profile.wineType());
        if (profile.dryness() != null) preferences.put("dryness", profile.dryness());
        if (profile.body() != null) preferences.put("body", profile.body());
        if (profile.fruitiness() != null) preferences.put("fruitiness", profile.fruitiness());
        if (profile.oak() != null) preferences.put("oak", profile.oak());
        if (profile.tannin() != null) preferences.put("tannin", profile.tannin());
        if (!profile.food().isEmpty()) preferences.put("food_tags", profile.food());
        return preferences;
    }

    private List<Map<String, Object>> knowledgeCandidatePayload(List<WineCandidate> wines) {
        return wines.stream().<Map<String, Object>>map(wine -> {
            LinkedHashMap<String, Object> candidate = new LinkedHashMap<>();
            candidate.put("productId", wine.productId());
            candidate.put("gtin", wine.gtin());
            candidate.put("name", wine.name());
            candidate.put("price", wine.effectivePrice().doubleValue());
            return candidate;
        }).toList();
    }

    private KnowledgeRanking applyKnowledgeRanking(List<WineCandidate> candidates, CustomerWineProfile customer,
                                                    Map<String, Object> response) {
        if (response == null || !(response.get("recommendations") instanceof List<?> rows)) return null;
        Map<Long, WineCandidate> byId = new LinkedHashMap<>();
        candidates.forEach(wine -> byId.put(wine.productId(), wine));
        List<WineMatcher.ScoredWine> ranked = new ArrayList<>();
        int verified = 0;
        for (Object row : rows) {
            if (!(row instanceof Map<?, ?> item)) continue;
            Long productId = number(item.get("productId")) == null ? null : number(item.get("productId")).longValue();
            WineCandidate candidate = productId == null ? null : byId.get(productId);
            if (candidate == null) continue;
            boolean approved = "APPROVED".equals(item.get("profileStatus"));
            WineCandidate enriched = approved ? withVerifiedProfile(candidate, item.get("profile")) : candidate;
            WineMatcher.ScoredWine baseline = matcher.score(enriched, customer);
            double match = number(item.get("score")) == null ? 0 : number(item.get("score")).doubleValue() / 100.0;
            ranked.add(new WineMatcher.ScoredWine(enriched, match, baseline.drynessMatch(), baseline.bodyMatch(),
                    baseline.foodMatch(), baseline.tasteMatch(), baseline.businessFit(), baseline.confidence()));
            if (approved) verified++;
        }
        return ranked.isEmpty() ? null : new KnowledgeRanking(List.copyOf(ranked), verified);
    }

    private WineCandidate withVerifiedProfile(WineCandidate wine, Object rawProfile) {
        Map<?, ?> claims = rawProfile instanceof Map<?, ?> map ? map : Map.of();
        WineProfile old = wine.profile() == null ? WineProfile.empty(null) : wine.profile();
        String wineType = claimString(claims, "wine_type", old.wineType());
        String varietal = claimString(claims, "varietal", old.varietal());
        String region = claimString(claims, "region", old.region());
        String vintage = claimString(claims, "vintage", old.vintage());
        Double dryness = claimNumber(claims, "dryness", old.dryness());
        Double body = claimNumber(claims, "body", old.body());
        Double fruitiness = claimNumber(claims, "fruitiness", old.fruitiness());
        Double oak = claimNumber(claims, "oak", old.oak());
        Double tannin = claimNumber(claims, "tannin", old.tannin());
        List<String> aroma = claimTags(claims, "aroma_tags", old.aromaTags());
        List<String> palate = claimTags(claims, "palate_tags", old.palateTags());
        List<String> food = claimTags(claims, "food_tags", old.foodTags());
        String finish = claimString(claims, "finish_note", old.finishNote());
        boolean inferred = old.inferred() && !claims.keySet().containsAll(
                List.of("wine_type", "varietal", "region", "vintage", "dryness", "body", "fruitiness", "oak", "tannin"));
        WineProfile profile = new WineProfile(wineType, varietal, region, vintage, dryness, body, fruitiness,
                oak, tannin, aroma, palate, food, finish, inferred);
        return new WineCandidate(wine.productId(), wine.name(), wine.description(), wine.image(), wine.categoryName(),
                wine.familyName(), wine.brandName(), wine.listPrice(), wine.sellPrice(), wine.onPromotion(),
                wine.stockQuantity(), wine.trackInventory(), wine.caseQuantity(), profile, wine.gtin());
    }

    private static String claimString(Map<?, ?> claims, String field, String fallback) {
        Object claim = claims.get(field);
        return claim instanceof Map<?, ?> map && map.get("value") instanceof String value ? value : fallback;
    }

    private static Double claimNumber(Map<?, ?> claims, String field, Double fallback) {
        Object claim = claims.get(field);
        Object value = claim instanceof Map<?, ?> map ? map.get("value") : null;
        return value instanceof Number number ? number.doubleValue() : fallback;
    }

    private static List<String> claimTags(Map<?, ?> claims, String field, List<String> fallback) {
        Object claim = claims.get(field);
        Object value = claim instanceof Map<?, ?> map ? map.get("value") : null;
        if (!(value instanceof List<?> items)) return fallback;
        return items.stream().filter(String.class::isInstance).map(String.class::cast).toList();
    }

    private static Number number(Object value) {
        return value instanceof Number number ? number : null;
    }

    public IdentifyResponse identify(String q, TenantContext tenant) {
        List<WineCandidate> hits = applySingleBottleOffers(catalog.search(tenant, q), tenant);
        List<WineAssistantResponse> items = new ArrayList<>();
        for (WineCandidate wine : hits) {
            items.add(toAssistant(wine, null, true, tenant));
        }
        return new IdentifyResponse(List.copyOf(items));
    }

    public IdentifyImageResponse identifyFromLabel(WineLabelRead read, TenantContext tenant) {
        LinkedHashMap<Long, WineCandidate> unique = new LinkedHashMap<>();
        if (read.barcode() != null) {
            for (WineCandidate hit : catalog.search(tenant, read.barcode())) {
                unique.put(hit.productId(), hit);
            }
        }
        for (WineCandidate hit : LabelCatalogMatcher.rank(
                applySingleBottleOffers(catalog.listWines(tenant), tenant), read, 8)) {
            unique.putIfAbsent(hit.productId(), hit);
        }
        if (unique.size() < 3) {
            for (String q : read.searchQueries()) {
                for (WineCandidate hit : applySingleBottleOffers(catalog.search(tenant, q), tenant)) {
                    unique.putIfAbsent(hit.productId(), hit);
                    if (unique.size() >= 8) break;
                }
                if (unique.size() >= 8) break;
            }
        }
        List<WineAssistantResponse> items = new ArrayList<>();
        for (WineCandidate wine : applySingleBottleOffers(new ArrayList<>(unique.values()), tenant)) {
            items.add(toAssistant(wine, null, true, tenant));
            if (items.size() >= 8) break;
        }
        String note = items.isEmpty()
                ? "Read the label, but nothing in this store matched. Search by name instead."
                : null;
        return new IdentifyImageResponse(
                read.displayName(),
                read.brand(),
                read.vintage(),
                read.varietal(),
                read.barcode(),
                read.searchQueries(),
                List.copyOf(items),
                note
        );
    }

    public WineAssistantResponse wine(long id, TenantContext tenant) {
        WineCandidate wine = requireWine(id, tenant);
        return toAssistant(wine, null, true, tenant);
    }

    public PitchResponse pitch(PitchRequest request, TenantContext tenant) {
        WineCandidate wine = requireWine(request.productId(), tenant);
        CustomerWineProfile profile = request.profile() == null ? null : toProfile(request.profile());
        String text = pitchService.pitch(wine, profile, request.length(), tenant);
        return new PitchResponse(wine.productId(), request.length(), text);
    }

    public SimilarResponse similar(SimilarRequest request, TenantContext tenant) {
        WineCandidate current = requireWine(request.productId(), tenant);
        String direction = request.direction().trim().toLowerCase(Locale.ROOT);
        if (!direction.equals("cheaper") && !direction.equals("upgrade")) {
            throw new BusinessException(40000, "direction must be cheaper or upgrade");
        }
        List<WineCandidate> wines = applySingleBottleOffers(catalog.listWines(tenant), tenant);
        List<WineMatcher.ScoredWine> scored = matcher.similar(wines, current, direction);
        List<RecommendCard> cards = new ArrayList<>();
        String badge = direction.equals("cheaper") ? "Similar, cheaper" : "Upgrade";
        for (WineMatcher.ScoredWine s : scored) {
            cards.add(toCard(s, direction, badge, null, current, tenant));
        }
        return new SimilarResponse(current.productId(), direction, List.copyOf(cards));
    }

    public AskResponse ask(AskRequest request, TenantContext tenant) {
        WineCandidate wine = requireWine(request.productId(), tenant);
        String q = request.question().toLowerCase(Locale.ROOT);
        String direction = (q.contains("cheap") || q.contains("less") || q.contains("similar")
                || q.contains("便宜") || q.contains("实惠") || q.contains("相似") || q.contains("类似"))
                ? "cheaper"
                : ((q.contains("better") || q.contains("upgrade") || q.contains("premium")
                || q.contains("升级") || q.contains("更好")) ? "upgrade" : null);
        List<WineMatcher.ScoredWine> alts = List.of();
        if (direction != null) {
            alts = matcher.similar(applySingleBottleOffers(catalog.listWines(tenant), tenant), wine, direction);
        }
        String answer = pitchService.answer(wine, request.question(), alts, tenant);
        List<RecommendCard> cards = new ArrayList<>();
        for (WineMatcher.ScoredWine s : alts) {
            cards.add(toCard(s, direction == null ? "alt" : direction,
                    direction == null ? "Alternative" : ("cheaper".equals(direction) ? "Similar, cheaper" : "Upgrade"),
                    null, wine, tenant));
        }
        return new AskResponse(answer, List.copyOf(cards));
    }

    public void feedback(FeedbackRequest request, TenantContext tenant) {
        String reaction = request.reaction().trim().toLowerCase(Locale.ROOT);
        if (!List.of("liked", "rejected", "bought").contains(reaction)) {
            throw new BusinessException(40000, "reaction must be liked, rejected, or bought");
        }
        requireWine(request.productId(), tenant);
        if (wineKnowledgeClient != null && wineKnowledgeClient.enabled()) {
            String aggregateReaction = switch (reaction) {
                case "liked" -> "helpful";
                case "rejected" -> "not_fit";
                case "bought" -> "chosen";
                default -> throw new IllegalStateException("validated reaction is missing a mapping");
            };
            try {
                wineKnowledgeClient.feedback(tenant, request.productId(), aggregateReaction);
            } catch (RuntimeException unavailable) {
                log.info("Wine feedback aggregation unavailable");
            }
        }
    }

    private void addCard(List<RecommendCard> cards, WineMatcher.ScoredWine scored, String tier, String badge,
                         CustomerWineProfile profile, WineMatcher.TierPick pick, TenantContext tenant) {
        if (scored == null) return;
        for (RecommendCard existing : cards) {
            if (existing.productId().equals(scored.wine().productId())) return;
        }
        WineCandidate previous = null;
        if ("premium".equals(tier) && pick.bestMatch() != null) previous = pick.bestMatch().wine();
        else if ("best".equals(tier) && pick.goodValue() != null) previous = pick.goodValue().wine();
        cards.add(toCard(scored, tier, badge, profile, previous, tenant));
    }

    private RecommendCard toCard(WineMatcher.ScoredWine scored, String tier, String badge,
                                 CustomerWineProfile profile, WineCandidate previous, TenantContext tenant) {
        WineCandidate wine = scored.wine();
        WineProfile p = wine.profile();
        String why = previous == null ? null : WinePitchService.whyUpgrade(previous, wine);
        PromotionInfo promotion = promotionInfo(wine, tenant);
        return new RecommendCard(
                wine.productId(),
                wine.name(),
                tier,
                badge,
                wine.listPrice(),
                wine.sellPrice(),
                wine.onPromotion(),
                wine.stockQuantity(),
                wine.caseQuantity(),
                WineMatcher.pct(scored.match()),
                WineMatcher.pct(scored.drynessMatch()),
                WineMatcher.pct(scored.bodyMatch()),
                WineMatcher.pct(scored.foodMatch()),
                WineMatcher.pct(scored.businessFit()),
                WineMatcher.pct(scored.confidence()),
                p == null ? null : p.wineType(),
                p == null ? null : p.varietal(),
                WinePitchService.drynessLabel(p == null ? null : p.dryness()),
                WinePitchService.bodyLabel(p == null ? null : p.body()),
                p == null ? List.of() : p.aromaTags(),
                p == null ? List.of() : p.palateTags(),
                p == null ? List.of() : p.foodTags(),
                p == null ? null : p.finishNote(),
                pitchService.template(wine, profile, "card"),
                why,
                p == null || p.inferred(), promotion.endsAt(), promotion.endDateStatus()
        );
    }

    private WineAssistantResponse toAssistant(WineCandidate wine, CustomerWineProfile profile,
                                              boolean withLongPitch, TenantContext tenant) {
        WineProfile p = wine.profile();
        PromotionInfo promotion = promotionInfo(wine, tenant);
        return new WineAssistantResponse(
                wine.productId(),
                wine.name(),
                wine.brandName(),
                wine.categoryName(),
                wine.image(),
                wine.listPrice(),
                wine.sellPrice(),
                wine.onPromotion(),
                wine.stockQuantity(),
                wine.caseQuantity(),
                p == null ? null : p.wineType(),
                p == null ? null : p.varietal(),
                p == null ? null : p.region(),
                p == null ? null : p.vintage(),
                WinePitchService.drynessLabel(p == null ? null : p.dryness()),
                WinePitchService.bodyLabel(p == null ? null : p.body()),
                p == null ? List.of() : p.aromaTags(),
                p == null ? List.of() : p.palateTags(),
                p == null ? List.of() : p.foodTags(),
                p == null ? null : p.finishNote(),
                pitchService.template(wine, profile, "card"),
                withLongPitch ? pitchService.template(wine, profile, "10s") : null,
                withLongPitch ? pitchService.template(wine, profile, "30s") : null,
                p == null || p.inferred(), promotion.endsAt(), promotion.endDateStatus()
        );
    }

    private PromotionInfo promotionInfo(WineCandidate wine, TenantContext tenant) {
        if (!wine.onPromotion() || shopfrontOffers == null || timezones == null || tenant == null
                || wine.productId() == null || wine.sellPrice() == null) return PromotionInfo.unverified();
        try {
            var snapshot = shopfrontOffers.checkoutOffers(tenant.vendorId(), tenant.requireOutletId(),
                    List.of(wine.productId()));
            if (snapshot == null || snapshot.snapshotExpired()) return PromotionInfo.unverified();
            BigDecimal sellPrice = wine.sellPrice().setScale(2, RoundingMode.HALF_UP);
            List<ShopfrontProductOfferService.Offer> singleBottleOffers = snapshot.offers()
                    .getOrDefault(wine.productId(), List.of()).stream()
                    .filter(offer -> offer.groupId() == null && offer.requiredUnits().compareTo(BigDecimal.ONE) == 0)
                    .toList();
            List<BigDecimal> distinctTotals = singleBottleOffers.stream()
                    .map(offer -> offer.total().setScale(2, RoundingMode.HALF_UP)).distinct().toList();
            if (distinctTotals.size() != 1 || distinctTotals.getFirst().compareTo(sellPrice) != 0) {
                return PromotionInfo.unverified();
            }
            List<Instant> endDates = singleBottleOffers.stream()
                    .filter(offer -> offer.total().setScale(2, RoundingMode.HALF_UP).compareTo(sellPrice) == 0)
                    .map(ShopfrontProductOfferService.Offer::endsAt).distinct().toList();
            if (endDates.size() != 1) return PromotionInfo.unverified();
            Instant end = endDates.getFirst();
            if (end == null) return new PromotionInfo(null, "NO_END_DATE");
            return new PromotionInfo(
                    end.atZone(timezones.zoneForVendor(tenant.vendorId())).toLocalDate().toString(),
                    "VERIFIED_END_DATE");
        } catch (RuntimeException unavailable) {
            return PromotionInfo.unverified();
        }
    }

    private record PromotionInfo(String endsAt, String endDateStatus) {
        private static PromotionInfo unverified() {
            return new PromotionInfo(null, "UNVERIFIED");
        }
    }

    private List<WineCandidate> applySingleBottleOffers(List<WineCandidate> wines, TenantContext tenant) {
        if (wines == null || wines.isEmpty() || shopfrontOffers == null || tenant == null) return wines;
        try {
            List<Long> productIds = wines.stream().map(WineCandidate::productId).filter(id -> id != null).distinct().toList();
            if (productIds.isEmpty()) return wines;
            var snapshot = shopfrontOffers.checkoutOffers(tenant.vendorId(), tenant.requireOutletId(), productIds);
            if (snapshot == null || snapshot.snapshotExpired()) return wines;
            return wines.stream().map(wine -> applySingleBottleOffer(wine,
                    snapshot.offers().getOrDefault(wine.productId(), List.of()))).toList();
        } catch (RuntimeException unavailable) {
            return wines;
        }
    }

    private WineCandidate applySingleBottleOffer(WineCandidate wine,
                                                   List<ShopfrontProductOfferService.Offer> offers) {
        if (wine == null || wine.productId() == null || wine.sellPrice() == null || offers == null) return wine;
        List<ShopfrontProductOfferService.Offer> singleBottleOffers = offers.stream()
                .filter(offer -> offer.groupId() == null && offer.requiredUnits().compareTo(BigDecimal.ONE) == 0)
                .toList();
        List<BigDecimal> distinctTotals = singleBottleOffers.stream()
                .map(offer -> offer.total().setScale(2, RoundingMode.HALF_UP)).distinct().toList();
        if (distinctTotals.size() != 1) return wine;
        BigDecimal offerPrice = distinctTotals.getFirst();
        BigDecimal currentSellPrice = wine.sellPrice().setScale(2, RoundingMode.HALF_UP);
        if (offerPrice.compareTo(currentSellPrice) >= 0) return wine;
        return new WineCandidate(wine.productId(), wine.name(), wine.description(), wine.image(),
                wine.categoryName(), wine.familyName(), wine.brandName(), wine.listPrice(), offerPrice, true,
                wine.stockQuantity(), wine.trackInventory(), wine.caseQuantity(), wine.profile(), wine.gtin());
    }

    private WineCandidate requireWine(Long id, TenantContext tenant) {
        WineCandidate wine = catalog.findById(id, tenant);
        if (wine == null) {
            throw new BusinessException(40400, "Product not found");
        }
        return applySingleBottleOffers(List.of(wine), tenant).getFirst();
    }

    static CustomerWineProfile toProfile(RecommendRequest request) {
        if (request == null) {
            return new CustomerWineProfile("not_sure", null, null, null, null, null, null, null, List.of(), null);
        }
        return new CustomerWineProfile(
                request.wineType(),
                request.budgetMin(),
                request.budgetMax(),
                request.dryness(),
                request.body(),
                request.fruitiness(),
                request.oak(),
                request.tannin(),
                WineLexicon.canonicalFood(request.food()),
                request.occasion()
        );
    }
}
