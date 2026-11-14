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
            "qa", "unknown", "navigate", "report_adhoc"
    );

    /** Ticket / order counts are available via average-ticket (includes tickets). */
    private static final Pattern TICKET_COUNT = Pattern.compile(
            "几笔|笔订单|笔单|订单数|单数|多少单|"
                    + "how many tickets|how many orders|how many transactions|ticket count|transaction count|number of (?:tickets|orders|sales|transactions)",
            Pattern.CASE_INSENSITIVE
    );

    private static final Pattern SALES_COMPARISON = Pattern.compile(
            "(?is).*(?:对比|比较|差多少|compare(?:d|s|ing)?|comparison|versus|\\bvs\\b).*"
                    + "(?:销售额|营业额|收入|sales|revenue|takings|profit|gross profit|毛利|利润).*"
                    + "|.*(?:销售额|营业额|收入|sales|revenue|takings|profit|gross profit|毛利|利润).*"
                    + "(?:对比|比较|差多少|compare(?:d|s|ing)?|comparison|versus|\\bvs\\b).*",
            Pattern.CASE_INSENSITIVE
    );
    private static final Pattern MIXED_METRICS = Pattern.compile(
            "(?is).*(?:sales|revenue|takings|销售额|营业额|收入|profit|gross profit|毛利|利润).*"
                    + "(?:units|quantity|销量|件数|库存|stock).*|.*(?:units|quantity|销量|件数|库存|stock).*"
                    + "(?:sales|revenue|takings|销售额|营业额|收入|profit|gross profit|毛利|利润).*"
    );
    private static final Pattern RAW_SQL_STATEMENT = Pattern.compile(
            "(?is)\\b(?:select\\s+.+?\\s+from\\s+|insert\\s+into\\s+|update\\s+[\\w.]+\\s+set\\s+|"
                    + "delete\\s+from\\s+|drop\\s+(?:table|schema|database)\\s+|"
                    + "alter\\s+(?:table|schema)\\s+|truncate\\s+(?:table\\s+)?)[\\w.]+"
    );

    private static final Pattern ADHOC = Pattern.compile(
            "分别|混[合问]|"
                    + "哪个商品|卖得最多|卖得最好|销量最高|排行|top product|best seller|best-performing|"
                    + "sell(?:s|ing)? most|sold most|what (?:did we|was|were).*(?:sell|sold) most|"
                    + "sales\\s+and\\s+(?:units|quantit(?:y|ies))|(?:units|quantit(?:y|ies))\\s+and\\s+sales|"
                    + "对比|比较|差多少|compare(?:d|s|ing)?|comparison|versus|\\bvs\\b|"
                    + "how many .*invoices|invoice.*(?:received|total|count)|"
                    + "(?:pricing|price).*?(?:report|history)|(?:report|history).*?(?:pricing|price)|"
                    + "(?:pricing|price).*?suggestions?.*?(?:last|past|previous|yesterday|week|month)|"
                    + "(?:定价|价格).*?(?:报告|历史)|"
                    + "(?:上周|昨天|上个月|本月).*?(?:价格|定价).*?(?:建议|推荐)|"
                    + "(?:价格|定价).*?(?:建议|推荐).*?(?:上周|昨天|上个月|本月)|"
                    + "(?:how much|how many|what (?:was|were)).*(?:purchase|purchases|replenishment|restock(?:ing)?).*(?:report|history|cost|spend|spent|paid|last|past|previous|yesterday|week|month)|"
                    + "(?:purchase|purchases|replenishment|restock(?:ing)?).*?(?:report|history|cost|spend|spent|paid|last|past|previous|yesterday|week|month)|"
                    + "(?:spend|spent|paid|payment|cost).*?(?:purchase|purchases|replenishment|restock(?:ing)?)|"
                    + "(?:上周|昨天|上个月|本月|最近\\d+天).*?(?:采购|补货|进货).*?(?:记录|历史|花了|成本|多少钱|报告|支出|金额)|"
                    + "(?:采购|补货|进货).*?(?:记录|历史|花了|成本|多少钱|报告|支出|金额).*?(?:上周|昨天|上个月|本月|最近\\d+天)|"
                    + "supplier.*(?:pay|paid|payment|spend)|(?:pay|paid|payment|spend).*supplier|"
                    + "invoice.*(?:cost|price|paid|pay|spend|spent|total|amount)|"
                    + "(?:pay|paid|payment|cost|spend|spent).{0,40}invoice|"
                    + "(?:发票|账单).*(?:花了|多少钱|费用|成本)|(?:花了|支付了|付了).{0,12}(?:发票|账单)|"
                    + "发票.*(?:多少|数量|总额)|供应商.*(?:付款|支出)|"
                    + "\\bdrop\\b|\\balter\\b|\\btruncate\\b|"
                    + "why are sales|why .*down",
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
        if (isRawSqlStatement(question)) {
            return true;
        }
        // Exactly two explicit dates with one supported sales metric use the
        // native overview path rather than the unsupported-query gate.
        if (SALES_COMPARISON.matcher(q).matches() && !MIXED_METRICS.matcher(q).matches()
                && ExplicitReportDates.parsePair(question).isPresent()) {
            return false;
        }
        return ADHOC.matcher(q).find();
    }

    public static boolean isRawSqlStatement(String question) {
        return question != null && RAW_SQL_STATEMENT.matcher(question).find();
    }

    public static boolean canOverride(String intent) {
        return intent == null || OVERRIDE_FROM.contains(intent);
    }

    public static String maybeOverride(String question, String intent) {
        if (question == null || question.isBlank()) {
            return intent;
        }
        String q = question.toLowerCase(Locale.ROOT);
        if (SALES_COMPARISON.matcher(q).matches() && !MIXED_METRICS.matcher(q).matches()
                && ExplicitReportDates.parsePair(question).isPresent() && canOverride(intent)) {
            return "report_sales";
        }
        if (TICKET_COUNT.matcher(q).find() && canOverride(intent)) {
            return "report_aov";
        }
        // The native sales overview owns the audited gross-profit calculation.
        // Keep profit questions on that deterministic path instead of the
        // intentionally disabled arbitrary-query route.
        if (Pattern.compile("利润|毛利|profit|margin", Pattern.CASE_INSENSITIVE).matcher(q).find()
                && canOverride(intent)) {
            return "report_sales";
        }
        if (shouldUseNl2Sql(question) && canOverride(intent)) {
            return "report_adhoc";
        }
        return intent;
    }
}
