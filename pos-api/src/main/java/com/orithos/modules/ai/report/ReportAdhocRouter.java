package com.orithos.modules.ai.report;

import java.util.Locale;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Deterministic override: questions the sales templates cannot answer
 * must go to {@code report_adhoc} / NL2SQL, even if the classifier
 * stuffed them into {@code report_qty}.
 */
public final class ReportAdhocRouter {

    private static final Set<String> OVERRIDE_FROM = Set.of(
            "report_sales", "report_qty", "report_aov", "report_stock", "report_dead_stock",
            "qa", "unknown", "navigate"
    );

    private static final Pattern ADHOC = Pattern.compile(
            "几笔|笔订单|笔单|订单数|单数|多少单|"
                    + "how many tickets|how many orders|ticket count|"
                    + "分别|混[合问]|"
                    + "哪个商品|卖得最多|销量最高|排行|top product|best seller|"
                    + "对比|差多少|compared|versus|\\bvs\\b|"
                    + "how many .*invoices|invoice.*(?:received|total|count)|"
                    + "supplier.*(?:pay|paid|payment|spend)|(?:pay|paid|payment|spend).*supplier|"
                    + "发票.*(?:多少|数量|总额)|供应商.*(?:付款|支出)|"
                    + "\\bdrop\\b|\\balter\\b|\\btruncate\\b",
            Pattern.CASE_INSENSITIVE
    );

    private ReportAdhocRouter() {}

    public static boolean shouldUseNl2Sql(String question) {
        if (question == null || question.isBlank()) {
            return false;
        }
        return ADHOC.matcher(question.toLowerCase(Locale.ROOT)).find();
    }

    public static boolean canOverride(String intent) {
        return intent == null || OVERRIDE_FROM.contains(intent);
    }

    public static String maybeOverride(String question, String intent) {
        if (shouldUseNl2Sql(question) && canOverride(intent)) {
            return "report_adhoc";
        }
        return intent;
    }
}
