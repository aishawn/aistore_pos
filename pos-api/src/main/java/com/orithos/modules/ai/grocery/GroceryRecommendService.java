package com.orithos.modules.ai.grocery;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.NativeAiReportQueryService;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.product.ShopfrontProductOfferService;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class GroceryRecommendService {

    private final NativeAiReportQueryService reports;
    private final ShopfrontProductOfferService shopfrontOffers;

    public GroceryRecommendService(NativeAiReportQueryService reports) {
        this(reports, null);
    }

    @Autowired
    public GroceryRecommendService(NativeAiReportQueryService reports, ShopfrontProductOfferService shopfrontOffers) {
        this.reports = reports;
        this.shopfrontOffers = shopfrontOffers;
    }

    public GroceryRecommendResponse recommend(GroceryRecommendRequest request, TenantContext tenant) {
        GroceryRecommendRequest profile = normalize(request);
        NativeAiReportQueryService.ProductCatalogResult result = reports.listRecommendationProducts(tenant);
        if (result.error() != null) throw unavailable(result.error());
        var offerSnapshot = shopfrontOffers == null || result.rows().isEmpty()
                ? new ShopfrontProductOfferService.CheckoutOffers(Map.of(), true)
                : shopfrontOffers.checkoutOffers(tenant.vendorId(), tenant.requireOutletId(), result.rows().stream()
                        .map(row -> row.get("id")).filter(Number.class::isInstance).map(Number.class::cast)
                        .map(Number::longValue).toList());

        List<GroceryRecommendCard> candidates = new ArrayList<>();
        for (Map<String, Object> row : result.rows()) {
            String name = string(row.get("name"));
            String category = categoryFor(string(row.get("category")));
            if (category == null || (!"not_sure".equals(profile.category())
                    && !profile.category().equals(category))) continue;

            BigDecimal saleQuantity = row.get("sale_quantity") == null ? BigDecimal.ONE : decimal(row.get("sale_quantity"));
            if (saleQuantity.signum() <= 0) continue;
            BigDecimal listPrice = salePrice(row.get("list_price"), saleQuantity);
            var applicableOffer = applicableOffer(offerSnapshot, row, saleQuantity, listPrice);
            BigDecimal sell = applicableOffer == null ? salePrice(row.get("sell_price"), saleQuantity)
                    : applicableOffer.total().setScale(2, RoundingMode.HALF_UP);
            BigDecimal quantity = decimal(row.get("quantity")).divideToIntegralValue(saleQuantity).stripTrailingZeros();
            if (quantity.compareTo(BigDecimal.ZERO) <= 0) continue;
            BigDecimal min = profile.budgetMin();
            BigDecimal max = profile.budgetMax();
            if (min != null && sell.compareTo(min) < 0 || max != null && sell.compareTo(max) > 0) continue;

            long id = row.get("id") instanceof Number n ? n.longValue() : 0L;
            if (id <= 0 || name.isBlank()) continue;
            String badge = "not_sure".equals(profile.category()) ? "In-stock pick" : label(category);
            String reason = reason(category, sell, profile, applicableOffer);
            candidates.add(new GroceryRecommendCard(id, name, "", badge, category,
                    listPrice, sell, quantity, saleQuantity, null,
                    100, reason, applicableOffer == null ? null : applicableOffer.name(),
                    applicableOffer == null || applicableOffer.endsAt() == null ? null
                            : applicableOffer.endsAt().atZone(reports.businessTimezone(tenant)).toLocalDate().toString()));
        }

        if (candidates.isEmpty()) {
            return new GroceryRecommendResponse(profile, List.of(),
                    "No matching in-stock items. Try another category or widen the budget.");
        }
        candidates.sort(Comparator.comparing(GroceryRecommendCard::sellPrice)
                .thenComparing(GroceryRecommendCard::name, String.CASE_INSENSITIVE_ORDER)
                .thenComparingLong(GroceryRecommendCard::productId));
        List<GroceryRecommendCard> picks = pickPriceBands(candidates);
        return new GroceryRecommendResponse(profile, List.copyOf(picks), null);
    }

    private static GroceryRecommendRequest normalize(GroceryRecommendRequest request) {
        if (request == null) throw new BusinessException(40000, "Recommendation preferences are required.");
        String category = request.category() == null || request.category().isBlank()
                ? "not_sure" : request.category().trim().toLowerCase(Locale.ROOT);
        if (!List.of("beer", "spirits", "soft_drinks", "snacks", "not_sure").contains(category)) {
            throw new BusinessException(40000, "Choose a supported grocery category.");
        }
        if (request.budgetMin() != null && request.budgetMin().signum() < 0
                || request.budgetMax() != null && request.budgetMax().signum() < 0
                || request.budgetMin() != null && request.budgetMax() != null
                && request.budgetMin().compareTo(request.budgetMax()) > 0) {
            throw new BusinessException(40000, "Enter a valid budget range.");
        }
        return new GroceryRecommendRequest(category, request.budgetMin(), request.budgetMax(), request.occasion());
    }

    private static List<GroceryRecommendCard> pickPriceBands(List<GroceryRecommendCard> candidates) {
        int count = Math.min(3, candidates.size());
        List<GroceryRecommendCard> picks = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            int index = count == 1 ? 0 : (int) Math.round((double) i * (candidates.size() - 1) / (count - 1));
            GroceryRecommendCard candidate = candidates.get(index);
            String tier = count == 1 ? "match" : i == 0 ? "value" : i == count - 1 ? "premium" : "balanced";
            String badge = count == 1 ? candidate.badge()
                    : i == 0 ? "Lowest price" : i == count - 1 ? "Higher price" : "Mid-range";
            picks.add(new GroceryRecommendCard(candidate.productId(), candidate.name(), tier, badge,
                    candidate.category(), candidate.listPrice(), candidate.sellPrice(), candidate.stockQuantity(),
                    candidate.saleQuantity(), candidate.caseQuantity(), candidate.matchPct(), candidate.reason(),
                    candidate.promotionName(), candidate.promotionEndsAt()));
        }
        return picks;
    }

    private static String categoryFor(String sourceCategory) {
        return switch (sourceCategory.toLowerCase(Locale.ROOT)) {
            case "beer", "beers", "craft beer", "lager", "ale", "stout", "ipa", "cider", "啤酒" -> "beer";
            case "spirits", "spirit", "premix", "premix spirits", "ready to drink", "rtd", "soju",
                 "vodka", "whisky", "whiskey", "gin", "rum", "tequila", "brandy", "liqueur",
                 "烈酒", "白酒", "威士忌", "伏特加", "金酒", "朗姆" -> "spirits";
            case "soft drink", "soft drinks", "soft_drinks", "soda", "cola", "water", "juice",
                 "energy drink", "energy drinks", "mixer", "mixers", "饮料", "矿泉水" -> "soft_drinks";
            case "snack", "snacks", "nuts chips", "chips", "crisps", "nuts", "crackers", "chocolate",
                 "biscuits", "confectionery", "confectionry", "ice confec", "零食", "薯片" -> "snacks";
            default -> null;
        };
    }

    private static String label(String category) {
        return switch (category) {
            case "beer" -> "Beer";
            case "spirits" -> "Spirits";
            case "soft_drinks" -> "Soft drinks";
            default -> "Snacks";
        };
    }

    private static String reason(String category, BigDecimal price, GroceryRecommendRequest profile,
                                 ShopfrontProductOfferService.Offer offer) {
        String budget = profile.budgetMax() != null ? " within your budget"
                : profile.budgetMin() != null ? " above your minimum budget" : "";
        String promotion = offer == null ? "" : " Shopfront offer: " + offer.name() + ".";
        return label(category) + " with positive available stock at A$" + price.stripTrailingZeros().toPlainString()
                + " (AUD, GST-inclusive)" + budget + "." + promotion;
    }

    private static ShopfrontProductOfferService.Offer applicableOffer(
            ShopfrontProductOfferService.CheckoutOffers snapshot, Map<String, Object> row,
            BigDecimal saleQuantity, BigDecimal listPrice) {
        if (snapshot.snapshotExpired() || !(row.get("id") instanceof Number id)) return null;
        List<ShopfrontProductOfferService.Offer> matching = snapshot.offers().getOrDefault(id.longValue(), List.of())
                .stream().filter(offer -> offer.groupId() == null
                        && offer.requiredUnits().compareTo(saleQuantity) == 0
                        && offer.total().signum() > 0
                        && offer.total().compareTo(listPrice) < 0)
                .toList();
        List<BigDecimal> distinctPrices = matching.stream().map(ShopfrontProductOfferService.Offer::total)
                .map(price -> price.setScale(2, RoundingMode.HALF_UP)).distinct().toList();
        if (distinctPrices.size() != 1) return null;
        BigDecimal price = distinctPrices.getFirst();
        return matching.stream().filter(offer -> offer.total().setScale(2, RoundingMode.HALF_UP).equals(price))
                .min(Comparator.comparing(ShopfrontProductOfferService.Offer::name)).orElse(null);
    }

    private static BusinessException unavailable(String error) {
        return switch (error) {
            case "NO_PERMISSION" -> new BusinessException(40300, "You do not have permission to view product recommendations.");
            case "NO_STORE", "NO_OUTLET" -> new BusinessException(40000, "Sign in to a store before requesting recommendations.");
            case "NATIVE_REPORT_UNAVAILABLE" -> new BusinessException(50312, "The Orithos product catalogue is temporarily unavailable.");
            default -> new BusinessException(50312, "Product recommendations are temporarily unavailable. Please retry.");
        };
    }

    private static BigDecimal decimal(Object value) {
        if (value instanceof BigDecimal decimal) return decimal;
        if (value instanceof Number number) return new BigDecimal(number.toString());
        try { return value == null ? BigDecimal.ZERO : new BigDecimal(value.toString()); }
        catch (NumberFormatException ignored) { return BigDecimal.ZERO; }
    }

    private static BigDecimal salePrice(Object unitPrice, BigDecimal saleQuantity) {
        return decimal(unitPrice).multiply(saleQuantity).setScale(2, RoundingMode.HALF_UP);
    }

    private static String string(Object value) { return value == null ? "" : value.toString().trim(); }
}
