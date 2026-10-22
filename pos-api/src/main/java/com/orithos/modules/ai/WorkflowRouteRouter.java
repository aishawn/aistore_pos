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
            "reorder|replenish|restock|restock list|stock up|what should (?:i|we) buy|what should (?:i|we) purchase|what do (?:i|we) need to buy|what do (?:i|we) need to purchase|what should (?:i|we) restock|what should (?:i|we) order|what do (?:i|we) need to order|what should be ordered|what to order|what needs ordering|show (?:me )?(?:the )?replenishment|help me restock|purchase suggestion|suggested purchase|running low|what(?:'s| is) running low|low stock|show (?:me )?(?:the )?low[- ]stock|out of stock|stock alert|which products? (?:need|should) (?:reordering|restocking|buy|purchase|buying|purchasing)|which products? should (?:i|we) buy|which items? (?:need|should) (?:restocking|reordering|buy|purchase|buying|purchasing)|what needs restocking|which items? (?:are )?low|what is low on stock|items? to order|products? to buy|补货|补货清单|补货建议|帮我补货|缺货|快没货|库存不足|库存预警|库存低|哪些商品需要补货|哪些商品要进货|哪些商品要补|哪些商品快没货|哪些商品库存不足|哪些商品该买|需要补什么|该补什么|该进货|建议进货|采购建议",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern REPLENISHMENT_NATURAL = Pattern.compile(
            "top up(?: (?:stock|inventory))?|what needs a reorder|帮我看(?:看)?哪些要补货",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PRICING = Pattern.compile(
            "which prices|which prices need(?: checking| review)|price review|price check|pricing|reprice|which products? should (?:i|we) reprice|which products? need(?: a)? price check|which items? need(?:s)? (?:a )?price review|show (?:me )?(?:the )?price suggestions?|raise the price|lower the price|should (?:i|we) (?:raise|lower|change) .*price|prices? need attention|price suggestion|pricing suggestion|pricing recommendations|suggest(?: a)? price(?: for .*)?|what should (?:i|we) charge|how much should (?:i|we) charge|what should (?:i|we) price|what price should (?:i|we) set|review prices|调价|定价|价格建议|改价|价格调整|哪些价格需要复核|哪些商品需要复核价格|哪些商品需要改价|哪些商品价格不对",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PRICING_NATURAL = Pattern.compile(
            "prices? look(?:s)? off|what is a fair price for|which prices? need attention",
            Pattern.CASE_INSENSITIVE);
    /** Recommend / pair — not bare "red wine" (that often means a sales report). */
    private static final Pattern SOMMELIER = Pattern.compile(
            "recommend(?: a)? (?:red|white|rose|sparkling)? ?wine(?:\\s+for .*)?|suggest(?: a)? (?:red|white|rose|sparkling)? ?wine(?:\\s+for .*)?|recommend (?:something|a bottle)(?: in stock)? for .*|what should i serve with .*|pair(?:ing)? .*wine|"
                    + "what wine|wine recommendation|food pairing|"
                    + "(?:red|white|rose|sparkling)? ?wine for .*|suggest something(?: in stock)? for .*|something (?:light|fresh|crisp) under .*|"
                    + "suggest a wine|recommend a wine|find me (?:a )?wine|"
                    + "葡萄酒推荐|推荐.*葡萄酒|推荐.*红酒|推荐.*白酒|红酒配牛排|白酒配海鲜|"
                    + "配餐|搭配.*酒|.*配.*酒|适合.*酒|清爽.*酒|晚餐喝什么酒|红酒推荐|白葡萄酒推荐",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern INVOICE = Pattern.compile(
            "scan(?: (?:this|an?|the))? (?:supplier )?(?:invoice|bill)|read(?: (?:this|an?|the))? (?:supplier )?(?:invoice|bill)|can you (?:read|check) (?:this|an?|the) (?:supplier )?(?:invoice|bill)|upload(?: (?:this|an?|the))? (?:supplier )?(?:invoice|bill)|capture(?: (?:this|an?|the))? (?:supplier )?invoice|take a photo of (?:this|an?|the) (?:supplier )?(?:invoice|bill)|invoice capture|invoice scan|invoice photo|supplier bill|supplier document|发票|供应商单据|供应商账单|读取.*单据|识别.*发票|上传.*发票|上传.*账单|拍照.*(?:发票|账单)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern INVOICE_NATURAL = Pattern.compile(
            "snap (?:this|an?|the) (?:supplier )?(?:invoice|bill)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern INVOICE_MUTATION = Pattern.compile(
            "\\b(?:create|add|edit|update|delete|remove|import|receive|return|transfer|adjust|confirm|approve|save|start|begin|submit|send|publish|post|book|merge)\\b.*\\b(?:invoice|bill)\\b|"
                    + "\\b(?:invoice|bill)\\b.*\\b(?:create|add|edit|update|delete|remove|import|receive|return|transfer|adjust|confirm|approve|save|start|begin|submit|send|publish|post|book|merge)\\b|"
                    + "(?:创建|添加|编辑|修改|删除|移除|导入|收货|退货|调拨|调整|确认|批准|保存|开始|启动|提交|发送|发布|入账|登记|合并).*?(?:发票|账单)|"
                    + "(?:发票|账单).*?(?:创建|添加|编辑|修改|删除|移除|导入|收货|退货|调拨|调整|确认|批准|保存|开始|启动|提交|发送|发布|入账|登记|合并)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern REPORT_CONTEXT = Pattern.compile(
            "sales|sold|revenue|takings|units|quantity|how much .*sold|how many .*invoice|how many .*supplier bills?|(?:do we have|any) .*invoices?|(?:have we|did we) receive .*bills?|invoice.*(?:received|total|count|paid|cost|price|exist|available|left|还有|有没有|有吗)|bill.*(?:received|total|count|paid|cost|exist|available)|(?:paid|pay|cost).*invoice|supplier.*(?:paid|payment|spend)|销量|销售|卖了|营业额|发票.*(?:多少|数量|总额|花了|成本|价格|收到|存在|还有|有没有|有吗)|账单.*(?:多少|数量|总额|收到|存在|还有|有没有|有吗)|(?:付款|支付).*发票|供应商.*(?:付款|支出)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern WORKFLOW_REPORT_CONTEXT = Pattern.compile(
            "(?:how much|how many|what (?:was|were)) .*"
                    + "(?:purchase|purchases|reorder(?:ing)?|replenishment|restock(?:ing)?|pricing|price)"
                    + "|(?:purchase|purchases|reorder(?:ing)?|replenishment|restock(?:ing)?|pricing|price) .*"
                    + "(?:report|history|cost|spend|spent|paid|last|past|previous|yesterday|week|month)"
                    + "|(?:上个月|本月|上周|昨天).*?(?:采购|补货|定价|价格).*?(?:多少|花了|成本|报告|历史|建议|推荐)"
                    + "|(?:定价|价格).*?(?:建议|推荐).*?(?:上个月|本月|上周|昨天)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern READ_ONLY_ACTION = Pattern.compile(
            "\\b(?:create|add|edit|update|delete|remove|merge|import|upload|receive|return|transfer|adjust|confirm|approve|save|start|begin|submit|send|publish)\\b|"
                    + "新增|添加|创建|编辑|修改|更新|删除|移除|合并|导入|上传|收货|退货|调拨|调整|确认|批准|保存|开始|启动|提交|发送|发布",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern ENTITY_WRITE = Pattern.compile(
            "(?:create|add|edit|update|delete|remove|merge|import|upload|receive|return|transfer|adjust|save|confirm|approve|submit|send|publish)\\b.*\\b(?:customer|client|product|item|catalogue|catalog|supplier|vendor|order|stock|inventory)\\b|"
                    + "\\b(?:customer|client|product|item|catalogue|catalog|supplier|vendor|order|stock|inventory)\\b.*\\b(?:create|add|edit|update|delete|remove|merge|import|upload|receive|return|transfer|adjust|save|confirm|approve|submit|send|publish)\\b|"
                    + "(?:创建|添加|编辑|修改|更新|删除|移除|合并|导入|上传|收货|退货|调拨|调整|保存|确认|批准|提交|发送|发布).*?(?:客户|顾客|产品|商品|目录|供应商|采购单|订单|库存)|"
                    + "(?:客户|顾客|产品|商品|目录|供应商|采购单|订单|库存).*?(?:创建|添加|编辑|修改|更新|删除|移除|合并|导入|上传|收货|退货|调拨|调整|保存|确认|批准|提交|发送|发布)",
            Pattern.CASE_INSENSITIVE);
    /** Imperative purchase/price wording must fail closed before model routing. */
    private static final Pattern EXPLICIT_EXECUTION = Pattern.compile(
            "\\b(?:place|send|create|approve|apply|execute|finalize|commit)\\s+(?:the\\s+)?(?:purchase\\s+)?(?:order|replenishment|restock|suggestions?|prices?)\\b|"
                    + "\\b(?:submit|confirm|save|publish|approve|apply|send|create|set|change)\\s+(?:(?:this|the|these|a|an)\\s+)?(?:purchase\\s+)?(?:order|price changes?|prices?|replenishment|restock)\\b|"
                    + "\\b(?:buy|purchase|order)\\s+(?:these|those|the items?|the products?|it|them|now|today)\\b|"
                    + "(?:下单|采购这些|购买这些|执行补货|提交补货|提交采购订单|确认采购单|确认这些订单|确认这个订单|发送采购订单|保存价格变更|保存这些价格|应用这些价格|确认这些价格|发布价格|执行调价|设置这些价格|修改这些价格)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DIRECT_EXECUTION_ZH = Pattern.compile(
            "把这些建议下单|直接把价格改了|(?:直接\\s*)?把.+?(?:补到|补足|补至|加到)\\s*\\d+\\s*(?:件|个|瓶|箱)?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DIRECT_EXECUTION_EN = Pattern.compile(
            "(?:top up|restock|replenish|bring)\\s+(?:these|the)\\s+(?:items|products|lines|stock)\\s+(?:to|up to)\\s*\\d+\\s*(?:units?|items?|cases?|bottles?)?|"
                    + "(?:top up|restock|replenish|bring)\\s+(?:all(?:\\s+the)?|the)?\\s*[a-z][a-z -]*\\s+(?:to|up to)\\s*\\d+\\s*(?:units?|items?|cases?|bottles?)?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern NUMERIC_PURCHASE_EXECUTION = Pattern.compile(
            "\\b(?:order|buy|purchase)\\s+\\d+\\s+(?:units?|items?|cases?|bottles?)\\s+of\\s+[a-z][a-z0-9 -]*\\b",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern NUMERIC_PRICE_EXECUTION = Pattern.compile(
            "\\b(?:set|change|raise|lower|update|apply)\\s+(?:the\\s+)?[a-z][a-z0-9 -]*?(?:\\s+price)?\\s*(?:to|at)\\s*\\$?\\d+(?:\\.\\d{1,2})?\\b|"
                    + "(?:直接\\s*)?把.+?(?:价格|售价)\\s*(?:改成|调整为|设为)\\s*\\$?\\d+(?:\\.\\d{1,2})?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SUPPLIER_LOOKUP = Pattern.compile(
            "(?:show|open|view|list|search|find|look up|check)(?:\\s+me)?\\s+(?:the\\s+)?suppliers?|"
                    + "(?:supplier|suppliers)\\s+(?:list|directory|lookup)|who are (?:our|the) suppliers?|"
                    + "供应商(?:列表|目录|查询)|(?:查看|打开|查询|搜索)供应商",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern ORDER_LOOKUP = Pattern.compile(
            "(?:show|open|view|list|search|find|look up|check)(?:\\s+me)?\\s+(?:the\\s+)?(?:purchase\\s+)?orders?|"
                    + "(?:purchase\\s+orders?|P[.]?O[.]?s?)\\s*(?:list|lookup)?|"
                    + "(?:查看|打开|查询|搜索)(?:采购单|采购订单|订单)|采购(?:单|订单)(?:列表|历史)?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern STOCKTAKE_LOOKUP = Pattern.compile(
            "(?:show|open|view|list|check)(?:\\s+me)?\\s+(?:the\\s+)?(?:stocktake|stock take|inventory count)|"
                    + "(?:go to|open)\\s+stocktake|"
                    + "(?:查看|打开|进入|去)\\s*(?:库存)?盘点|库存盘点|盘点列表",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CLASSIFICATION_LOOKUP = Pattern.compile(
            "(?:show|open|view|list|search|find|check)(?:\\s+me)?\\s+(?:the\\s+)?classifications?|"
                    + "(?:查看|打开|查询|搜索)分类(?:列表|目录)?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CUSTOMER_GROUP_LOOKUP = Pattern.compile(
            "(?:show|open|view|list|search|find|check)(?:\\s+me)?\\s+(?:the\\s+)?customer groups?|"
                    + "(?:查看|打开|查询|搜索)客户分组|客户组(?:列表|目录)?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern PRICE_LIST_LOOKUP = Pattern.compile(
            "(?:show|open|view|list|search|find|check)(?:\\s+me)?\\s+(?:the\\s+)?price lists?|"
                    + "(?:查看|打开|查询|搜索)(?:价目表|价格表)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern GIFT_CARD_LOOKUP = Pattern.compile(
            "(?:show|open|view|list|search|find|check)(?:\\s+me)?\\s+(?:the\\s+)?gift cards?|"
                    + "(?:查看|打开|查询|搜索)礼品卡(?:列表)?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern BUYING_PERIOD_LOOKUP = Pattern.compile(
            "(?:show|open|view|list|search|find|check)(?:\\s+me)?\\s+(?:the\\s+)?buying periods?|"
                    + "(?:查看|打开|查询|搜索)采购周期",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern BALANCE_LOOKUP = Pattern.compile(
            "(?:show|open|view|list|search|find|check)(?:\\s+me)?\\s+(?:the\\s+)?customer balances?|"
                    + "(?:查看|打开|查询|搜索)客户余额|客户对账单(?:列表)?",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern BULK_PRICE_LOOKUP = Pattern.compile(
            "(?:show|open|view|list|search|find|check)(?:\\s+me)?\\s+(?:the\\s+)?bulk price edit(?:ing)?|"
                    + "(?:查看|打开|查询|搜索)批量改价",
            Pattern.CASE_INSENSITIVE);

    private WorkflowRouteRouter() {}

    public static Override maybeOverride(String question) {
        if (question == null || question.isBlank()) return null;
        if (hasWriteIntent(question)) return null;
        String normalized = question.trim().toLowerCase(Locale.ROOT);
        if (!READ_ONLY_ACTION.matcher(normalized).find() && SUPPLIER_LOOKUP.matcher(normalized).find()) {
            return new Override("navigate", "/suppliers/odoo");
        }
        if (!READ_ONLY_ACTION.matcher(normalized).find()
                && !WORKFLOW_REPORT_CONTEXT.matcher(normalized).find()
                && ORDER_LOOKUP.matcher(normalized).find()) {
            return new Override("navigate", "/orders");
        }
        if (!READ_ONLY_ACTION.matcher(normalized).find() && STOCKTAKE_LOOKUP.matcher(normalized).find()) {
            return new Override("navigate", "/stocktake");
        }
        if (!READ_ONLY_ACTION.matcher(normalized).find() && CLASSIFICATION_LOOKUP.matcher(normalized).find()) {
            return new Override("navigate", "/classifications");
        }
        if (!READ_ONLY_ACTION.matcher(normalized).find() && CUSTOMER_GROUP_LOOKUP.matcher(normalized).find()) {
            return new Override("navigate", "/customer-groups");
        }
        if (!READ_ONLY_ACTION.matcher(normalized).find() && PRICE_LIST_LOOKUP.matcher(normalized).find()) {
            return new Override("navigate", "/pricelists");
        }
        if (!READ_ONLY_ACTION.matcher(normalized).find() && GIFT_CARD_LOOKUP.matcher(normalized).find()) {
            return new Override("navigate", "/giftcards");
        }
        if (!READ_ONLY_ACTION.matcher(normalized).find() && BUYING_PERIOD_LOOKUP.matcher(normalized).find()) {
            return new Override("navigate", "/stock/buying-periods");
        }
        if (!READ_ONLY_ACTION.matcher(normalized).find() && BALANCE_LOOKUP.matcher(normalized).find()) {
            return new Override("navigate", "/customers/balances");
        }
        if (!READ_ONLY_ACTION.matcher(normalized).find() && BULK_PRICE_LOOKUP.matcher(normalized).find()) {
            return new Override("navigate", "/stock/bulk-price-edit");
        }
        if ((INVOICE.matcher(normalized).find() || INVOICE_NATURAL.matcher(normalized).find())
                && !INVOICE_MUTATION.matcher(normalized).find()
                && !REPORT_CONTEXT.matcher(normalized).find()) {
            return new Override("navigate", "/invoices/scan");
        }
        if ((REPLENISHMENT.matcher(normalized).find() || REPLENISHMENT_NATURAL.matcher(normalized).find())
                && !READ_ONLY_ACTION.matcher(normalized).find()
                && !WORKFLOW_REPORT_CONTEXT.matcher(normalized).find()) {
            return new Override("navigate", "/stock/replenishment");
        }
        if ((PRICING.matcher(normalized).find() || PRICING_NATURAL.matcher(normalized).find())
                && !READ_ONLY_ACTION.matcher(normalized).find()
                && !WORKFLOW_REPORT_CONTEXT.matcher(normalized).find()) {
            return new Override("navigate", "/stock/capped-pricing");
        }
        if (SOMMELIER.matcher(normalized).find() && !REPORT_CONTEXT.matcher(normalized).find()) {
            return new Override("navigate", "/sommelier");
        }
        return null;
    }

    /**
     * Returns true when an utterance explicitly asks the assistant to perform a
     * business mutation. Such questions must fail closed before model
     * classification so a model cannot turn them into a read-only page link.
     */
    public static boolean hasWriteIntent(String question) {
        if (question == null || question.isBlank()) return false;
        String normalized = question.trim().toLowerCase(Locale.ROOT);
        AssistantFastPathRouter.Match capabilityQuestion = AssistantFastPathRouter.maybeMatch(question);
        if (capabilityQuestion != null && "qa".equals(capabilityQuestion.intent())) return false;
        boolean historicalQuestion = normalized.matches(
                "^(?:what|how|did|were|was)\\b.*\\b(?:today|yesterday|last|past|previous|week|month)\\b.*$");
        if (historicalQuestion && !EXPLICIT_EXECUTION.matcher(normalized).find()) return false;
        if (INVOICE_MUTATION.matcher(normalized).find()
                || DIRECT_EXECUTION_ZH.matcher(normalized).find()
                || DIRECT_EXECUTION_EN.matcher(normalized).find()
                || NUMERIC_PRICE_EXECUTION.matcher(normalized).find()
                || NUMERIC_PURCHASE_EXECUTION.matcher(normalized).find()
                || ENTITY_WRITE.matcher(normalized).find()) return true;
        if (EXPLICIT_EXECUTION.matcher(normalized).find()
                && (REPLENISHMENT.matcher(normalized).find()
                || PRICING.matcher(normalized).find()
                || PRICING_NATURAL.matcher(normalized).find()
                || normalized.matches(".*\\b(?:order|purchase|buy|replenishment|restock|price|prices|pricing)\\b.*")
                || normalized.matches(".*(?:下单|订单|采购|购买|补货|价格|调价).*"))) {
            return true;
        }
        return READ_ONLY_ACTION.matcher(normalized).find()
                && (REPLENISHMENT.matcher(normalized).find() || PRICING.matcher(normalized).find()
                || REPLENISHMENT_NATURAL.matcher(normalized).find() || PRICING_NATURAL.matcher(normalized).find());
    }

    public record Override(String intent, String route) {}
}
