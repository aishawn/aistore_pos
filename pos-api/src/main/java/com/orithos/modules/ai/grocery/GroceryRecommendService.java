package com.orithos.modules.ai.grocery;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.OdooReportQueryService;
import com.orithos.modules.ai.report.TenantContext;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class GroceryRecommendService {

    private final OdooReportQueryService reports;

    public GroceryRecommendService(OdooReportQueryService reports) {
        this.reports = reports;
    }

    public GroceryRecommendResponse recommend(GroceryRecommendRequest request, TenantContext tenant) {
        GroceryRecommendRequest profile = normalize(request);
        OdooReportQueryService.ProductCatalogResult result = reports.listRecommendationProducts(tenant);
        if (result.error() != null) throw unavailable(result.error());

        List<GroceryRecommendCard> candidates = new ArrayList<>();
        for (Map<String, Object> row : result.rows()) {
            String name = string(row.get("name"));
            String sourceCategory = string(row.get("category"));
            String category = categoryFor(name + " " + sourceCategory);
            if (category == null || (!"not_sure".equals(profile.category())
                    && !profile.category().equals(category))) continue;

            BigDecimal sell = decimal(row.get("sell_price"));
            BigDecimal min = profile.budgetMin();
            BigDecimal max = profile.budgetMax();
            if (min != null && sell.compareTo(min) < 0 || max != null && sell.compareTo(max) > 0) continue;

            long id = row.get("id") instanceof Number n ? n.longValue() : 0L;
            if (id <= 0 || name.isBlank()) continue;
            String badge = "not_sure".equals(profile.category()) ? "In-stock pick" : label(category);
            String reason = reason(category, sell, profile);
            candidates.add(new GroceryRecommendCard(id, name, "", badge, category,
                    decimal(row.get("list_price")), sell, decimal(row.get("quantity")), null,
                    100, reason));
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
                    candidate.caseQuantity(), candidate.matchPct(), candidate.reason()));
        }
        return picks;
    }

    private static String categoryFor(String value) {
        String text = value.toLowerCase(Locale.ROOT);
        if (hasAny(text, "wine", "champagne", "葡萄酒", "红酒", "白葡萄酒", "香槟")) return null;
        if (hasAny(text, "beer", "lager", "ale", "stout", "ipa", "cider", "啤酒")) return "beer";
        if (hasAny(text, "vodka", "whisky", "whiskey", "gin", "rum", "tequila", "brandy", "spirit", "spirits", "liqueur",
                "白酒", "威士忌", "伏特加", "金酒", "朗姆")) return "spirits";
        if (hasAny(text, "snack", "chips", "crisps", "nuts", "cracker", "chocolate", "confection", "零食", "薯片")) return "snacks";
        if (hasAny(text, "soft drink", "soft_drink", "soda", "cola", "water", "juice", "energy drink", "mixer", "饮料", "矿泉水")) return "soft_drinks";
        return null;
    }

    private static boolean hasAny(String text, String... terms) {
        for (String term : terms) if (text.contains(term)) return true;
        return false;
    }

    private static String label(String category) {
        return switch (category) {
            case "beer" -> "Beer";
            case "spirits" -> "Spirits";
            case "soft_drinks" -> "Soft drinks";
            default -> "Snacks";
        };
    }

    private static String reason(String category, BigDecimal price, GroceryRecommendRequest profile) {
        String budget = profile.budgetMax() != null ? " within your budget"
                : profile.budgetMin() != null ? " above your minimum budget" : "";
        return label(category) + " with positive available stock at $" + price.stripTrailingZeros().toPlainString()
                + budget + ".";
    }

    private static BusinessException unavailable(String error) {
        return switch (error) {
            case "NO_PERMISSION" -> new BusinessException(40300, "You do not have permission to view product recommendations.");
            case "NO_STORE", "NO_OUTLET" -> new BusinessException(40000, "Sign in to a store before requesting recommendations.");
            case "ODOO_REPORT_STORE_UNLINKED" -> new BusinessException(50312, "This store is not connected to its product catalogue.");
            default -> new BusinessException(50312, "Product recommendations are temporarily unavailable. Please retry.");
        };
    }

    private static BigDecimal decimal(Object value) {
        if (value instanceof BigDecimal decimal) return decimal;
        if (value instanceof Number number) return new BigDecimal(number.toString());
        try { return value == null ? BigDecimal.ZERO : new BigDecimal(value.toString()); }
        catch (NumberFormatException ignored) { return BigDecimal.ZERO; }
    }

    private static String string(Object value) { return value == null ? "" : value.toString().trim(); }
}
