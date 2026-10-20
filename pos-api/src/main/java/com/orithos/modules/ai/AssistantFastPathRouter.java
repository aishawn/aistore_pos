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
            "^(?:today'?s?\\s+sales|sales\\s+today|show(?:\\s+me)?\\s+today'?s?\\s+sales|"
                    + "what were today'?s?\\s+sales|today'?s?\\s+takings|how did we do today|"
                    + "how much did we (?:make|take|sell) today|"
                    + "what(?:'s| is) (?:our )?(?:sales|revenue|takings|turnover) today|"
                    + "今日销售额?|今天销售额?|今天卖了多少|今天营业额?)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern YESTERDAY_SALES = Pattern.compile(
            "^(?:yesterday'?s?\\s+sales|sales\\s+yesterday|show(?:\\s+me)?\\s+yesterday'?s?\\s+sales|"
                    + "what were yesterday'?s?\\s+sales|yesterday'?s?\\s+takings|"
                    + "how much did we (?:make|take|sell) yesterday|"
                    + "what(?:'s| is) (?:our )?(?:sales|revenue|takings|turnover) yesterday|"
                    + "昨天销售额?|昨天卖了多少|昨天营业额?)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SALES_RANGE = Pattern.compile(
            "^(?:(?:sales|revenue|takings|turnover)\\s+(?:last|past|previous)\\s+\\d+\\s+days?|(?:近|最近|过去)\\s*\\d+\\s*天(?:销售额?|营业额?)?)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DATE_TOKEN = Pattern.compile(
            "(?:\\b\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}\\b|\\b\\d{1,2}/\\d{1,2}/\\d{4}\\b|"
                    + "\\b\\d{1,2}(?:st|nd|rd|th)?[\\s,./-]+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|"
                    + "jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
                    + "(?:[\\s,./-]+\\d{4})?\\b|"
                    + "\\b(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|"
                    + "sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\\s,./-]+\\d{1,2}"
                    + "(?:st|nd|rd|th)?(?:[\\s,./-]+\\d{4})?\\b|\\d{1,2}月\\d{1,2}[日号])",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SALES_MARKER = Pattern.compile(
            "\\b(?:sales|revenue|takings|turnover)\\b|销售额|营业额|流水",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern QUANTITY_RANGE = Pattern.compile(
            "^(?:(?:units|quantity)\\s+sold\\s+(?:last|past|previous)\\s+\\d+\\s+days?|(?:近|最近|过去)\\s*\\d+\\s*天(?:销量|销售数量))$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CATEGORY_QUANTITY = Pattern.compile(
            "^how much\\s+(.+?)\\s+sold\\s+(?:this|last)\\s+week\\??$|^本周(.+?)(?:卖了多少|销量(?:是多少)?)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern OPEN_SELL = Pattern.compile(
            "^(open\\s*(the\\s*)?(sell|cashier|register)(\\s*screen)?|进入收银界面|进入收银|打开收银|收银界面)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern LOOKUP_PRODUCTS = Pattern.compile(
            "^(look\\s*up\\s*products?|search\\s*products?|查询产品|查找产品|产品查询)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern LOOKUP_PRODUCT_QUERY = Pattern.compile(
            "^(?:look\\s*up|search(?:\\s+for)?|find(?:\\s+me)?)\\s+(?:the\\s+)?products?\\s+(?:for\\s+)?(.+?)[?.!]*$|"
                    + "^(?:帮我)?(?:查询|查找|搜索)(?:商品|产品)\\s*(.+?)[。！？]*$|"
                    + "^(?:帮我)?(?:搜一下|找一下)\\s*(?!产品[。！？?！]*$|商品[。！？?！]*$|库存[。！？?！]*$)(.+?)[。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CHECK_STOCK = Pattern.compile(
            "^(check\\s*(stock|inventory)|stock\\s*list|查询库存|查看库存|库存查询)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CLOSE_REGISTER_HELP = Pattern.compile(
            "^(?:how do i|how can i|where do i)\\s+(?:close|shut)\\s+(?:the\\s+)?register[?.!]*$|"
                    + "^(?:怎么|如何|怎样)(?:关闭|关掉|结算)收银台[？?。！!]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern FORGED_ROUTE = Pattern.compile(
            "(?:ignore\\s+(?:all\\s+)?previous instructions|忽略之前的指令).*(?:/admin/|admin/secret|后台秘密)|"
                    + "(?:/admin/secret|后台秘密)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern GIBBERISH = Pattern.compile("^(?:asdfghjkl|qwertyuiop|啊啊啊+)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern STOCK_QUERY = Pattern.compile(
            "^how much\\s+(.+?)\\s+(?:is|are)\\s+in\\s+stock[?.!]*$|"
                    + "^(?:stock (?:level|quantity) of)\\s+(.+?)[?.!]*$|"
                    + "^what(?:'s| is)\\s+the\\s+stock(?:\\s+level)?\\s+(?:of|for)\\s+(.+?)[?.!]*$|"
                    + "^(?:what(?:'s| is)\\s+the\\s+)?inventory(?:\\s+level)?\\s+(?:of|for)\\s+(.+?)[?.!]*$|"
                    + "^is\\s+(.+?)\\s+in\\s+stock[?.!]*$|"
                    + "^how many\\s+(.+?)\\s+do we have(?:\\s+in stock)?[?.!]*$|"
                    + "^do we have (?:any )?(.+?)\\s+(?:left|remaining)(?:\\s+in stock)?[?.!]*$|"
                    + "^how many\\s+(.+?)\\s+(?:are )?(?:left|remaining)(?:\\s+in stock)?[?.!]*$|"
                    + "^have we got\\s+(?:any\\s+)?(.+?)(?:\\s+in (?:the )?(?:shop|store))?[?.!]*$|"
                    + "^(?:查一下|查询|查看)\\s*(.+?)(?:还有多少|有多少)?库存[？?。]*$|"
                    + "^(.+?)库存(?:还有多少|有多少)[？?。]*$|"
                    + "^(?!(?:帮我)?(?:查下|查一下|看看|看下)\\s)(.+?)(?:还剩多少|剩多少)(?:库存)?[？?。]*$|"
                    + "^(?:店里|我们店里|门店)还有\\s*(.+?)(?:\\s*(?:吗|没有|没了))?[？?。]*$|"
                    + "^(?:帮我)?(?:查下|查一下|看看|看下)\\s*(.+?)\\s*(?:还剩几件|还剩多少|剩下多少|还有多少|库存)[？?。]*$",
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
        if (SALES_MARKER.matcher(normalized).find() && DATE_TOKEN.matcher(normalized).find()) {
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
        var categoryQuantity = CATEGORY_QUANTITY.matcher(normalized);
        if (categoryQuantity.matches()) {
            String category = categoryQuantity.group(1) != null
                    ? categoryQuantity.group(1).trim()
                    : categoryQuantity.group(2).trim();
            return new Match(
                    "report_qty",
                    "Quantity report",
                    Map.of("category", category),
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
        var productQuery = LOOKUP_PRODUCT_QUERY.matcher(question.trim());
        if (productQuery.matches()) {
            String query = cleanQuery(firstNonNull(productQuery.group(1), productQuery.group(2), productQuery.group(3)));
            if (query != null) {
                return new Match(
                        "search_product",
                        "Opened products.",
                        Map.of("query", query),
                        "/products",
                        "products",
                        "",
                        "");
            }
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
        if (FORGED_ROUTE.matcher(question.trim()).find()) {
            return new Match(
                    "unknown",
                    "I can only help with supported store tasks. I cannot open that route.",
                    Map.of(),
                    "",
                    "",
                    "",
                    "");
        }
        if (CLOSE_REGISTER_HELP.matcher(normalized).matches()) {
            return new Match(
                    "qa",
                    "To close the register, open the register screen, count the cash, and submit the closing count for review.",
                    Map.of(),
                    "",
                    "",
                    "",
                    "");
        }
        if (GIBBERISH.matcher(normalized).matches()) {
            return new Match(
                    "unknown",
                    "I did not understand that. Try asking about sales, stock, products, replenishment, pricing, wine, or invoices.",
                    Map.of(),
                    "",
                    "",
                    "",
                    "");
        }
        var stockQuery = STOCK_QUERY.matcher(question.trim());
        if (stockQuery.matches()) {
            String query = cleanQuery(firstNonNull(
                    stockQuery.group(1), stockQuery.group(2), stockQuery.group(3), stockQuery.group(4),
                    stockQuery.group(5), stockQuery.group(6), stockQuery.group(7), stockQuery.group(8),
                    stockQuery.group(9), stockQuery.group(10), stockQuery.group(11), stockQuery.group(12),
                    stockQuery.group(13), stockQuery.group(14)));
            if (query != null) {
                return new Match(
                        "report_stock",
                        "Stock report",
                        Map.of("query", query),
                        "",
                        "",
                        "",
                        "");
            }
        }
        return null;
    }

    private static String firstNonNull(String... values) {
        for (String value : values) {
            if (value != null) return value;
        }
        return null;
    }

    private static String cleanQuery(String value) {
        if (value == null) return null;
        String query = value.trim().replaceAll("[?.!。！？]+$", "").trim();
        return query.isEmpty() ? null : query;
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
