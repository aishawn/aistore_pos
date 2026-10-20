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
            "reorder|replenish|restock|stock up|what should (?:i|we) buy|what to order|purchase suggestion|suggested purchase|running low|low stock|out of stock|stock alert|which products? (?:need|should) (?:reordering|restocking)|what needs restocking|补货|缺货|库存不足|库存预警|库存低|哪些商品需要补货|哪些商品要进货|该进货|建议进货|采购建议",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PRICING = Pattern.compile(
            "which prices|price review|pricing|reprice|raise the price|lower the price|price suggestion|pricing suggestion|pricing recommendations|what should (?:i|we) charge|review prices|调价|定价|价格建议|改价|价格调整",
            Pattern.CASE_INSENSITIVE);
    /** Recommend / pair — not bare "red wine" (that often means a sales report). */
    private static final Pattern SOMMELIER = Pattern.compile(
            "recommend(?: a)? (?:red|white|rose|sparkling)? ?wine|suggest(?: a)? (?:red|white|rose|sparkling)? ?wine|"
                    + "what wine|wine recommendation|food pairing|"
                    + "wine for (?:a|an)? ?(?:dinner|party|steak|occasion)|"
                    + "suggest a wine|recommend a wine|find me (?:a )?wine|"
                    + "葡萄酒推荐|推荐.*葡萄酒|推荐.*红酒|推荐.*白酒|"
                    + "配餐|适合.*酒|红酒推荐|白葡萄酒推荐",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern INVOICE = Pattern.compile(
            "scan(?: this)? supplier invoice|read(?: this)? invoice|upload(?: this)? invoice|capture(?: this)? invoice|invoice capture|invoice photo|supplier bill|supplier document|发票|供应商单据|供应商账单|识别.*发票|上传.*发票",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern REPORT_CONTEXT = Pattern.compile(
            "sales|sold|revenue|takings|units|quantity|how much .*sold|how many .*invoice|invoice.*(?:received|total|count)|supplier.*(?:paid|payment|spend)|销量|销售|卖了|营业额|发票.*(?:多少|数量|总额)|供应商.*(?:付款|支出)",
            Pattern.CASE_INSENSITIVE);

    private WorkflowRouteRouter() {}

    public static Override maybeOverride(String question) {
        if (question == null || question.isBlank()) return null;
        String normalized = question.trim().toLowerCase(Locale.ROOT);
        if (INVOICE.matcher(normalized).find() && !REPORT_CONTEXT.matcher(normalized).find()) {
            return new Override("navigate", "/invoices/scan");
        }
        if (REPLENISHMENT.matcher(normalized).find()) return new Override("navigate", "/stock/replenishment");
        if (PRICING.matcher(normalized).find()) return new Override("navigate", "/stock/capped-pricing");
        if (SOMMELIER.matcher(normalized).find() && !REPORT_CONTEXT.matcher(normalized).find()) {
            return new Override("navigate", "/sommelier");
        }
        return null;
    }

    public record Override(String intent, String route) {}
}
