package com.orithos.modules.ai.report;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Deterministic overrides for questions that templates cannot answer, plus
 * safe remaps (ticket counts → {@code report_aov}) so cashiers avoid the
 * unsupported {@code report_adhoc} dead end when a template fits.
 */
public final class ReportAdhocRouter {

    private static final Set<String> OVERRIDE_FROM = Set.of(
            "report_sales", "report_qty", "report_aov", "report_stock", "report_dead_stock",
            "qa", "unknown", "navigate"
    );

    /** Ticket / order counts are available via average-ticket (includes tickets). */
    private static final Pattern TICKET_COUNT = Pattern.compile(
            "几笔|笔订单|笔单|订单数|单数|多少单|"
                    + "how many tickets|how many orders|ticket count|number of (?:tickets|orders|sales)",
            Pattern.CASE_INSENSITIVE
    );

    private static final Pattern ADHOC = Pattern.compile(
            "分别|混[合问]|"
                    + "哪个商品|卖得最多|卖得最好|销量最高|排行|top product|best seller|best-performing|"
                    + "sell(?:s|ing)? most|sold most|what (?:did we|was|were).*(?:sell|sold) most|"
                    + "对比|差多少|compared|versus|\\bvs\\b|"
                    + "how many .*invoices|invoice.*(?:received|total|count)|"
                    + "supplier.*(?:pay|paid|payment|spend)|(?:pay|paid|payment|spend).*supplier|"
                    + "发票.*(?:多少|数量|总额)|供应商.*(?:付款|支出)|"
                    + "\\bdrop\\b|\\balter\\b|\\btruncate\\b|"
                    + "why are sales|why .*down|利润|profit|margin",
            Pattern.CASE_INSENSITIVE
    );

    private ReportAdhocRouter() {}

    public static boolean shouldUseNl2Sql(String question) {
        if (question == null || question.isBlank()) {
            return false;
        }
        String q = question.toLowerCase(Locale.ROOT);
        if (TICKET_COUNT.matcher(q).find()) {
            return false;
        }
        return ADHOC.matcher(q).find();
    }

    public static boolean canOverride(String intent) {
        return intent == null || OVERRIDE_FROM.contains(intent);
    }

    public static String maybeOverride(String question, String intent) {
        if (question == null || question.isBlank()) {
            return intent;
        }
        String q = question.toLowerCase(Locale.ROOT);
        if (TICKET_COUNT.matcher(q).find() && canOverride(intent)) {
            return "report_aov";
        }
        if (shouldUseNl2Sql(question) && canOverride(intent)) {
            return "report_adhoc";
        }
        return intent;
    }
}
