package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;

@Service
public class SommelierService {

    private static final Logger log = LoggerFactory.getLogger(SommelierService.class);

    private final SommelierCatalogService catalog;
    private final WinePitchService pitchService;
    private final SommelierProductMapper mapper;
    private final ObjectMapper objectMapper;
    private final WineMatcher matcher = new WineMatcher();

    public SommelierService(SommelierCatalogService catalog,
                            WinePitchService pitchService,
                            SommelierProductMapper mapper,
                            ObjectMapper objectMapper) {
        this.catalog = catalog;
        this.pitchService = pitchService;
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public RecommendResponse recommend(RecommendRequest request, TenantContext tenant) {
        CustomerWineProfile profile = toProfile(request);
        List<WineCandidate> wines = catalog.listWines(tenant);
        List<WineMatcher.ScoredWine> scored = matcher.match(wines, profile);
        if (scored.isEmpty()) {
            String reason = wines.isEmpty()
                    ? "No wine products are in this store's catalogue yet."
                    : "Nothing in stock matches that type and budget. Try widening the price range.";
            return new RecommendResponse(profile, List.of(), reason);
        }
        WineMatcher.TierPick pick = matcher.pickThree(scored);
        List<RecommendCard> cards = new ArrayList<>();
        addCard(cards, pick.goodValue(), "good", "Great Value", profile, pick);
        addCard(cards, pick.bestMatch(), "best", "Best Match", profile, pick);
        addCard(cards, pick.premium(), "premium", "Premium Choice", profile, pick);
        return new RecommendResponse(profile, List.copyOf(cards), null);
    }

    public IdentifyResponse identify(String q, TenantContext tenant) {
        List<WineCandidate> hits = catalog.search(tenant, q);
        List<WineAssistantResponse> items = new ArrayList<>();
        for (WineCandidate wine : hits) {
            items.add(toAssistant(wine, null, true));
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
        for (WineCandidate hit : LabelCatalogMatcher.rank(catalog.listWines(tenant), read, 8)) {
            unique.putIfAbsent(hit.productId(), hit);
        }
        if (unique.size() < 3) {
            for (String q : read.searchQueries()) {
                for (WineCandidate hit : catalog.search(tenant, q)) {
                    unique.putIfAbsent(hit.productId(), hit);
                    if (unique.size() >= 8) break;
                }
                if (unique.size() >= 8) break;
            }
        }
        List<WineAssistantResponse> items = new ArrayList<>();
        for (WineCandidate wine : unique.values()) {
            items.add(toAssistant(wine, null, true));
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
        return toAssistant(wine, null, true);
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
        List<WineCandidate> wines = catalog.listWines(tenant);
        List<WineMatcher.ScoredWine> scored = matcher.similar(wines, current, direction);
        List<RecommendCard> cards = new ArrayList<>();
        String badge = direction.equals("cheaper") ? "Similar, cheaper" : "Upgrade";
        for (WineMatcher.ScoredWine s : scored) {
            cards.add(toCard(s, direction, badge, null, current));
        }
        return new SimilarResponse(current.productId(), direction, List.copyOf(cards));
    }

    public AskResponse ask(AskRequest request, TenantContext tenant) {
        WineCandidate wine = requireWine(request.productId(), tenant);
        String q = request.question().toLowerCase(Locale.ROOT);
        String direction = (q.contains("cheap") || q.contains("less") || q.contains("similar"))
                ? "cheaper"
                : ((q.contains("better") || q.contains("upgrade") || q.contains("premium")) ? "upgrade" : null);
        List<WineMatcher.ScoredWine> alts = List.of();
        if (direction != null) {
            alts = matcher.similar(catalog.listWines(tenant), wine, direction);
        }
        String answer = pitchService.answer(wine, request.question(), alts, tenant);
        List<RecommendCard> cards = new ArrayList<>();
        for (WineMatcher.ScoredWine s : alts) {
            cards.add(toCard(s, direction == null ? "alt" : direction,
                    direction == null ? "Alternative" : ("cheaper".equals(direction) ? "Similar, cheaper" : "Upgrade"),
                    null, wine));
        }
        return new AskResponse(answer, List.copyOf(cards));
    }

    public void feedback(FeedbackRequest request, TenantContext tenant) {
        String reaction = request.reaction().trim().toLowerCase(Locale.ROOT);
        if (!List.of("liked", "rejected", "bought").contains(reaction)) {
            throw new BusinessException(40000, "reaction must be liked, rejected, or bought");
        }
        requireWine(request.productId(), tenant);
        String json = null;
        try {
            if (request.profile() != null) {
                json = objectMapper.writeValueAsString(request.profile());
            }
        } catch (Exception e) {
            log.debug("Could not serialize sommelier profile type={}", e.getClass().getSimpleName());
        }
        mapper.insertFeedback(tenant.requireOutletId(), tenant.userId(), request.productId(), reaction, json);
    }

    private void addCard(List<RecommendCard> cards, WineMatcher.ScoredWine scored, String tier, String badge,
                         CustomerWineProfile profile, WineMatcher.TierPick pick) {
        if (scored == null) return;
        for (RecommendCard existing : cards) {
            if (existing.productId().equals(scored.wine().productId())) return;
        }
        WineCandidate previous = null;
        if ("premium".equals(tier) && pick.bestMatch() != null) previous = pick.bestMatch().wine();
        else if ("best".equals(tier) && pick.goodValue() != null) previous = pick.goodValue().wine();
        cards.add(toCard(scored, tier, badge, profile, previous));
    }

    private RecommendCard toCard(WineMatcher.ScoredWine scored, String tier, String badge,
                                 CustomerWineProfile profile, WineCandidate previous) {
        WineCandidate wine = scored.wine();
        WineProfile p = wine.profile();
        String why = previous == null ? null : WinePitchService.whyUpgrade(previous, wine);
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
                why
        );
    }

    private WineAssistantResponse toAssistant(WineCandidate wine, CustomerWineProfile profile, boolean withLongPitch) {
        WineProfile p = wine.profile();
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
                p == null || p.inferred()
        );
    }

    private WineCandidate requireWine(Long id, TenantContext tenant) {
        WineCandidate wine = catalog.findById(id, tenant);
        if (wine == null) {
            throw new BusinessException(40400, "Product not found");
        }
        return wine;
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
