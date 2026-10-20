package com.orithos.modules.ai;

import java.util.Locale;
import java.util.Map;
import java.util.regex.Pattern;

/**
 * Deterministic shortcuts for high-frequency cashier utterances.
 * Matched before the classify LLM so pill actions and common phrases skip model latency.
 */
public final class AssistantFastPathRouter {

    private static final Pattern TODAY_SALES = Pattern.compile(
            "^(today'?s?\\s+sales|sales\\s+today|今日销售额?|今天销售额?|今天卖了多少)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern YESTERDAY_SALES = Pattern.compile(
            "^(yesterday'?s?\\s+sales|sales\\s+yesterday|how much did we (?:take|sell) yesterday|昨天销售额?|昨天卖了多少)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SALES_RANGE = Pattern.compile(
            "^(?:(?:sales|revenue|takings|turnover)\\s+(?:last|past|previous)\\s+\\d+\\s+days?|(?:近|最近|过去)\\s*\\d+\\s*天(?:销售额?|营业额?)?)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern QUANTITY_RANGE = Pattern.compile(
            "^(?:(?:units|quantity)\\s+sold\\s+(?:last|past|previous)\\s+\\d+\\s+days?|(?:近|最近|过去)\\s*\\d+\\s*天(?:销量|销售数量))$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern OPEN_SELL = Pattern.compile(
            "^(open\\s*(the\\s*)?(sell|cashier|register)(\\s*screen)?|进入收银界面|进入收银|打开收银|收银界面)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern LOOKUP_PRODUCTS = Pattern.compile(
            "^(look\\s*up\\s*products?|search\\s*products?|查询产品|查找产品|产品查询)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CHECK_STOCK = Pattern.compile(
            "^(check\\s*(stock|inventory)|stock\\s*list|查询库存|查看库存|库存查询)$",
            Pattern.CASE_INSENSITIVE);

    private AssistantFastPathRouter() {}

    public static Match maybeMatch(String question) {
        if (question == null || question.isBlank()) {
            return null;
        }
        String normalized = question.trim().toLowerCase(Locale.ROOT);
        if (TODAY_SALES.matcher(normalized).matches()) {
            // Period comes from the utterance via ReportPeriodResolver (today).
            return new Match(
                    "report_sales",
                    "Today's sales",
                    Map.of(),
                    "",
                    "",
                    "",
                    "");
        }
        if (YESTERDAY_SALES.matcher(normalized).matches()) {
            return new Match(
                    "report_sales",
                    "Yesterday's sales",
                    Map.of(),
                    "",
                    "",
                    "",
                    "");
        }
        if (SALES_RANGE.matcher(normalized).matches()) {
            return new Match(
                    "report_sales",
                    "Sales report",
                    Map.of(),
                    "",
                    "",
                    "",
                    "");
        }
        if (QUANTITY_RANGE.matcher(normalized).matches()) {
            return new Match(
                    "report_qty",
                    "Quantity report",
                    Map.of(),
                    "",
                    "",
                    "",
                    "");
        }
        if (OPEN_SELL.matcher(normalized).matches()) {
            return new Match(
                    "navigate",
                    "Opening the sell screen.",
                    Map.of(),
                    "/",
                    "keys",
                    "",
                    "");
        }
        if (LOOKUP_PRODUCTS.matcher(normalized).matches()) {
            return new Match(
                    "search_product",
                    "Opened products.",
                    Map.of("query", ""),
                    "/products",
                    "products",
                    "",
                    "");
        }
        if (CHECK_STOCK.matcher(normalized).matches()) {
            return new Match(
                    "navigate",
                    "Opened stock list.",
                    Map.of(),
                    "/stock/list",
                    "",
                    "",
                    "");
        }
        return null;
    }

    public record Match(
            String intent,
            String summary,
            Map<String, String> slots,
            String route,
            String view,
            String panel,
            String action
    ) {}
}
