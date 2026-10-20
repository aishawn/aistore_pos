package com.orithos.modules.ai;

import java.util.Locale;
import java.util.regex.Pattern;

/**
 * Deterministic routing for explicit pilot workflow requests. The model still
 * supplies the answer and report slots, but an unambiguous page request must
 * not depend on probabilistic intent classification.
 */
public final class WorkflowRouteRouter {

    private static final Pattern REPLENISHMENT = Pattern.compile(
            "reorder|replenish|restock|running low|low stock|out of stock|补货|缺货|库存不足|该进货",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PRICING = Pattern.compile(
            "which prices|price review|pricing|reprice|raise the price|lower the price|price suggestion|调价|定价|价格建议|改价",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SOMMELIER = Pattern.compile(
            "recommend(?: a)? (?:red|white|rose|sparkling)? ?wine|wine recommendation|food pairing|red wine|white wine|葡萄酒|红酒|白葡萄酒|配餐|推荐.*酒",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern INVOICE = Pattern.compile(
            "scan(?: this)? supplier invoice|read(?: this)? invoice|invoice capture|invoice photo|发票|供应商单据|识别.*发票",
            Pattern.CASE_INSENSITIVE);

    private WorkflowRouteRouter() {}

    public static Override maybeOverride(String question) {
        if (question == null || question.isBlank()) return null;
        String normalized = question.trim().toLowerCase(Locale.ROOT);
        if (INVOICE.matcher(normalized).find()) return new Override("navigate", "/invoices/scan");
        if (REPLENISHMENT.matcher(normalized).find()) return new Override("navigate", "/stock/replenishment");
        if (PRICING.matcher(normalized).find()) return new Override("navigate", "/stock/capped-pricing");
        if (SOMMELIER.matcher(normalized).find()) return new Override("navigate", "/sommelier");
        return null;
    }

    public record Override(String intent, String route) {}
}
