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
                    + "how much did we (?:make|take|sell) today|what did we (?:make|take|sell) today|how were (?:sales|we) today|"
                    + "what(?:'s| is) (?:our )?(?:sales|revenue|takings|turnover) today|"
                    + "what(?:'s| is) today'?s? (?:sales|revenue|takings|turnover)|"
                    + "今日销售额?|今天销售额?|今天卖了多少(?:钱|金额)?|今天营业额?|今天流水|今天收入多少|今日收入多少|今天赚了多少)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern YESTERDAY_SALES = Pattern.compile(
            "^(?:yesterday'?s?\\s+sales|sales\\s+yesterday|show(?:\\s+me)?\\s+yesterday'?s?\\s+sales|"
                    + "what were yesterday'?s?\\s+sales|yesterday'?s?\\s+takings|"
                    + "how much did we (?:make|take|sell) yesterday|what did we (?:make|take|sell) yesterday|how were (?:sales|we) yesterday|"
                    + "what(?:'s| is) (?:our )?(?:sales|revenue|takings|turnover) yesterday|"
                    + "what(?:'s| is) yesterday'?s? (?:sales|revenue|takings|turnover)|"
                    + "昨天销售额?|昨天卖了多少|昨天营业额?|昨天收入多少)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern SALES_RANGE = Pattern.compile(
            "^(?:(?:sales|revenue|takings|turnover)\\s+(?:for\\s+)?(?:last|past|previous)\\s+\\d+\\s+days?|(?:近|最近|过去)\\s*\\d+\\s*天(?:销售额?|营业额?)?)$",
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
    private static final Pattern DATED_SALES_AMOUNT_QUESTION = Pattern.compile(
            "\\bhow much did (?:we|the store) (?:make|take|sell)\\b|"
                    + "\\bwhat did (?:we|the store) (?:make|take|sell)\\b|"
                    + "\\bwhat were (?:our|the store'?s) takings\\b|"
                    + "卖了多少(?:钱|金额)?(?:[?？]|$)|收入多少|营业额多少|流水多少",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern QUANTITY_RANGE = Pattern.compile(
            "^(?:(?:units|quantity)\\s+sold\\s+(?:(?:last|past|previous)\\s+\\d+\\s+days?|this\\s+week)|(?:近|最近|过去)\\s*\\d+\\s*天\\s*(?:销量|销售数量)|这周(?:卖了多少件?|销量(?:是多少)?)|本周(?:卖了多少件?|销量(?:是多少)?))$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DEAD_STOCK_RANGE = Pattern.compile(
            "^(?:(?:dead\\s+stock|dead\\s+inventory|slow\\s+moving\\s+stock)\\s+(?:for\\s+)?(?:last|past|previous)\\s+(\\d+)\\s+days?|"
                    + "(?:which\\s+)?products?\\s+(?:have\\s+had\\s+)?no\\s+sales\\s+(?:for\\s+)?(?:last\\s+)?(\\d+)\\s+days?|"
                    + "(?:which\\s+)?products?\\s+(?:have\\s+had\\s+)?no\\s+sales\\s+(?:for\\s+)?(\\d+)\\s+days?|"
                    + "(?:连续|近|最近|过去)\\s*(\\d+)\\s*天(?:没有销售|无销售|没销售|未销售)的?(?:商品|产品)?(?:有哪些|有哪一些|列表)?|"
                    + "(?:哪些|什么)(?:商品|产品)(?:连续|近|最近|过去)\\s*(\\d+)\\s*天(?:没有销售|无销售|没销售|未销售)(?:的)?(?:有哪些|有哪一些|列表)?|"
                    + "(?:连续|近|最近|过去)\\s*(\\d+)\\s*天(?:没有销售|无销售|没销售|未销售)(?:的)?(?:商品|产品)(?:有哪些|有哪一些|列表)?)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern DEAD_STOCK_DEFAULT = Pattern.compile(
            "^(?:dead\\s+stock|dead\\s+inventory|slow\\s+moving\\s+stock|"
                    + "which\\s+products?\\s+have\\s+had\\s+no\\s+sales|"
                    + "哪些商品连续没有销售|哪些商品没有销售|滞销商品|死库存|哪些是滞销品)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern STOCK_VALUE = Pattern.compile(
            "^(?:(?:which\\s+)?(?:inventory|stock)(?:\\s+items?)?\\s+(?:tie|ties)\\s+up\\s+(?:the\\s+)?most\\s+(?:cash|money|capital)|"
                    + "(?:which\\s+)?(?:inventory|stock)\\s+(?:items?\\s+)?(?:use|hold)\\s+(?:the\\s+)?most\\s+(?:cash|money|capital)|"
                    + "(?:which\\s+)?products?\\s+(?:have\\s+)?the\\s+(?:highest|most)\\s+(?:inventory\\s+)?value|"
                    + "how\\s+much\\s+(?:cash|money|capital)\\s+is\\s+tied\\s+up\\s+in\\s+(?:current\\s+)?(?:inventory|stock)|"
                    + "(?:哪些|什么)(?:库存|商品|产品)(?:占用|占用了|占着|压着)(?:最多|最高)(?:现金|资金|钱)|"
                    + "(?:当前|现在)(?:库存|存货)(?:占用|占了|压了)(?:多少|多少钱)(?:现金|资金|钱)?|"
                    + "库存(?:现金|资金)占用(?:最多|最高|排名)?)[?.!。！？]*$",
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
    private static final Pattern LOOKUP_CUSTOMERS = Pattern.compile(
            "^(look\\s*up\\s*customers?|search\\s*customers?|find\\s*customers?|查询客户|查找客户|搜索客户|客户查询)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern LOOKUP_SUPPLIERS = Pattern.compile(
            "^(?:show|open|view|list|search|find|look up|check)(?:\\s+me)?\\s+(?:the\\s+)?suppliers?(?:\\s+(?:list|directory|lookup))?$|"
                    + "^(?:supplier|suppliers)\\s+(?:list|directory|lookup)$|"
                    + "^(?:查看|打开|查询|搜索)供应商(?:列表|目录)?$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern LOOKUP_PRICE_LISTS = Pattern.compile(
            "^(?:show|open|view|list|search|find|check)(?:\\s+me)?\\s+(?:the\\s+)?price lists?|"
                    + "^(?:查看|打开|查询|搜索)(?:价目表|价格表)$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern LOOKUP_CUSTOMER_QUERY = Pattern.compile(
            "^(?:look\\s*up|search(?:\\s+for)?|find(?:\\s+me)?)\\s+(?:the\\s+)?customers?\\s+(?:for\\s+)?(.+?)[?.!]*$|"
                    + "^(?:can you|could you|please)\\s+(?:find|look\\s+for|search\\s+for)\\s+(?:the\\s+)?customer\\s+(.+?)[?.!]*$|"
                    + "^(?:帮我)?(?:查询|查找|搜索)(?:一下)?(?:客户|顾客)\\s*(.+?)[。！？?！]*$|"
                    + "^(?:帮我)?(?:查一下|查下)\\s*(?:客户|顾客)\\s+(.+?)[。！？?！]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern LOOKUP_PRODUCT_QUERY = Pattern.compile(
            "^(?:look\\s*up|search(?:\\s+for)?)\\s+(?:the\\s+)?(?:products?\\s+(?:for\\s+)?)?(?!(?:products?|product)[?.!]*$)(.+?)[?.!]*$|"
                    + "^find(?:\\s+me)?(?:\\s+the)?(?:\\s+product)?\\s+(?!me\\s+a\\s+wine\\b|products?$|a\\s+wine\\b|wine\\b)(.+?)[?.!]*$|"
                    + "^(?:can you|could you|please)\\s+(?:find|look\\s+for|search\\s+for)\\s+(?:the\\s+)?(?:product\\s+)?(?!a\\s+wine\\b|wine\\b)(.+?)[?.!]*$|"
                    + "^(?:帮我)?(?:查询|查找|搜索)(?:商品|产品)\\s*(.+?)[。！？]*$|"
                    + "^(?:帮我)?(?:查一下|查下)\\s*(?!(?:库存|商品|产品)\\b)(?!.*(?:库存|还有|剩|有多少))(.+?)[。！？?！]*$|"
                    + "^(?:帮我)?(?:搜一下|找一下)\\s*(?!产品[。！？?！]*$|商品[。！？?！]*$|库存[。！？?！]*$)(.+?)[。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CHECK_STOCK = Pattern.compile(
            "^(?:stock|inventory|check\\s*(?:stock|inventory)|stock\\s*list|show(?:\\s+me)?\\s+(?:the\\s+)?(?:stock|inventory)|"
                    + "what(?:'s| is)\\s+(?:in\\s+)?stock|what(?:'s| is)\\s+(?:our\\s+)?inventory|"
                    + "what\\s+stock\\s+do\\s+we\\s+have|what\\s+products?\\s+(?:do\\s+we\\s+have|are\\s+in\\s+stock)|"
                    + "how\\s+many\\s+(?:products?|items?)\\s+(?:do\\s+we\\s+have|are\\s+in\\s+stock)|"
                    + "show(?:\\s+me)?\\s+(?:the\\s+)?products?\\s+in\\s+stock|"
                    + "how(?:'s| is)\\s+(?:our\\s+)?stock(?:\\s+looking)?|inventory\\s+status|"
                    + "库存情况(?:怎么样|如何)?|现在库存怎么样|店里有什么库存|有什么现货|库存列表|查询库存|查看库存|库存查询)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern LOW_STOCK = Pattern.compile(
            "^(?:(?:what|which)\\s+products?\\s+(?:are|is)\\s+(?:low|running low)\\s+(?:in stock|on stock)|"
                    + "(?:what|which)\\s+items?\\s+(?:are|is)\\s+(?:low|running low)\\s+(?:in stock|on stock)|"
                    + "(?:which|what)\\s+products?\\s+(?:may|might|could)\\s+(?:stock\\s*out|run\\s*out)\\s+(?:in|within)\\s+(?:the\\s+)?(?:next\\s+)?\\d+\\s+days?|"
                    + "(?:which|what)\\s+(?:products?|items?)\\s+(?:are\\s+)?(?:at\\s+)?risk\\s+of\\s+(?:stocking\\s+out|running\\s+out)\\s+(?:in|within)\\s+(?:the\\s+)?(?:next\\s+)?\\d+\\s+days?|"
                    + "(?:which|what)\\s+(?:products?|items?)\\s+(?:may|might|could)\\s+be\\s+out\\s+of\\s+stock\\s+(?:in|within)\\s+(?:the\\s+)?(?:next\\s+)?\\d+\\s+days?|"
                    + "(?:哪些|什么)商品(?:库存)?(?:偏低|快断货|需要补货)|低库存商品(?:有哪些|列表)?)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern STOCK_CLARIFICATION = Pattern.compile(
            "^(?:why (?:can'?t|cannot) (?:you|we|i) find (?:the )?(?:stock|inventory|products?)|"
                    + "why (?:is|isn't|is not) (?:the )?(?:stock|inventory|product) (?:not )?(?:showing|appearing)|"
                    + "why (?:can't|cannot) i see (?:the )?(?:stock|inventory|results?)|"
                    + "why (?:can't|cannot) (?:i|we) find (?:the )?(?:stock|inventory|results?)|"
                    + "why (?:can't|cannot) (?:i|we) find (?:anything|anything in stock)|"
                    + "why (?:can't|cannot) (?:i|we) (?:see|find) anything(?: in (?:the )?(?:stock|inventory))?|"
                    + "why (?:is|isn't|is not) (?:the )?(?:stock|inventory) missing|"
                    + "why is nothing showing (?:for|in) (?:the )?(?:stock|inventory)|"
                    + "why (?:are|is) there no (?:stock|inventory|results?)(?: for (?:the )?(?:stock|inventory))?(?: showing| available)?|"
                    + "why can'?t i find anything(?: in stock)?|"
                    + "nothing comes up(?: for (?:the )?(?:stock|inventory))?|"
                    + "no results?(?: for (?:the )?(?:stock|inventory))?|"
                    + "(?:the )?(?:stock|inventory) has no results?|"
                    + "(?:the )?(?:stock|inventory) search is (?:blank|empty)|"
                    + "nothing is showing (?:for|in) (?:the )?(?:stock|inventory)|"
                    + "nothing (?:appears|is appearing) (?:for|in) (?:the )?(?:stock|inventory)|"
                    + "(?:i )?can'?t find (?:the )?(?:stock|inventory)|"
                    + "(?:the )?(?:stock|inventory) (?:isn't|is not) showing|"
                    + "no (?:stock|inventory) (?:is )?showing|"
                    + "为什么(?:查不到|找不到|没有查到|没有找到)(?:库存|商品|产品)?(?:结果)?|"
                    + "为什么(?:库存|商品|产品)(?:查不到|找不到|没有结果)|"
                    + "(?:库存|商品|产品)(?:怎么|为什么)(?:查不到|找不到|没有结果)|"
                    + "(?:查不到|找不到)库存|"
                    + "(?:查不到|找不到)(?:库存|商品|产品)|"
                    + "(?:怎么|为何|为什么)(?:查不到|找不到|看不到|没有显示)库存|"
                    + "库存(?:怎么|为何|为什么)(?:查不到|找不到|看不到|没有显示)|"
                    + "(?:为什么|怎么|为何)(?:没有结果|什么都查不到|什么都找不到)|"
                    + "(?:什么都查不到|什么都找不到|什么也查不到|什么也找不到)|"
                    + "(?:库存|商品|产品)(?:搜索|查询)(?:是)?(?:空白|空的)|"
                    + "(?:库存|商品|产品)(?:没显示|没有显示|查不到|找不到|看不到)|"
                    + "(?:库存|商品|产品)没有显示)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern CLOSE_REGISTER_HELP = Pattern.compile(
            "^(?:how do i|how can i|where do i|what is the way to|how to)\\s+(?:close|shut)\\s+(?:(?:my|the)\\s+)?(?:register|till|cash register)[?.!]*$|"
                    + "^(?:how do i|how can i)\\s+cash up(?: the register| the till)?[?.!]*$|"
                    + "^(?:怎么|如何|怎样)(?:关闭|关掉|结算)(?:收银台|收银机|班次)[？?。！!]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern FORGED_ROUTE = Pattern.compile(
            "(?:ignore\\s+(?:all\\s+)?previous instructions|忽略之前的指令).*(?:/(?:admin|platform|internal|debug)(?:/|\\b)|后台秘密)|"
                    + "(?:/(?:admin|platform|internal|debug)(?:/|\\b)|后台秘密)",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern GIBBERISH = Pattern.compile("^(?:asdfghjkl|qwertyuiop|啊啊啊+)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern HELP = Pattern.compile(
            "^(?:help|what can you do(?: for me)?|what are you able to do|what can i ask you|what can i ask|"
                    + "what are your capabilities|what do you support|what can you help with|how can you help|"
                    + "what does the assistant do|what data do you use for suggestions|"
                    + "will you (?:place|submit|create) orders?|(?:can|will) you (?:directly )?(?:create|place|submit) (?:an? |the )?(?:purchase )?order|"
                    + "(?:can|will|does) (?:the )?ai (?:create|place|submit) (?:(?:a|the) )?(?:purchase )?orders?(?: automatically)?|"
                    + "(?:can|could|will|does) (?:the )?(?:ai|assistant) (?:automatically )?(?:change|adjust|set) prices?|"
                    + "(?:can|could|will|does) (?:the )?(?:ai|assistant) recommend (?:a )?(?:wine|wines|products?)|"
                    + "(?:can|could|will|does) (?:the )?(?:ai|assistant) (?:read|scan|capture) (?:supplier )?(?:invoices?|bills?)|"
                    + "(?:can|could|will|does) (?:the )?(?:ai|assistant) answer (?:store )?(?:sales|stock|inventory) questions?|"
                    + "你能做什么|你会做什么|你能干什么|能做些什么|可以帮我做什么|能帮我做什么|有什么功能|你能帮我什么|"
                    + "ai\\s*(?:(?:会|能)(?:不|否)?|可不可以|可以不可以|能不能|会不会)\\s*(?:帮我\\s*)?(?:直接|自动)?\\s*(?:下(?:采购)?单|下订单|提交(?:采购)?订单?|生成(?:采购)?订单?|改价|调价|推荐(?:什么酒|商品|葡萄酒|红酒)|(?:识别|读取|扫描)(?:供应商)?(?:发票|账单)|回答(?:销售|库存)问题)\\s*(?:吗)?)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern TICKET_COUNT = Pattern.compile(
            "^(?:(?:what was|what's|what is) (?:our )?average (?:sale|ticket) (?:today|yesterday)|how many (?:transactions?|tickets?|orders?)(?: did we have)? (?:today|yesterday)|"
                    + "(?:today|yesterday)\\s+(?:transaction|ticket|order) count|今天(?:有)?多少笔(?:交易|订单)|"
                    + "今天(?:有)?几笔(?:交易|订单)?)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern INVOICE_REPORT = Pattern.compile(
            "^(?:do we have (?:any )?invoices?|any invoices?|are there (?:any )?invoices?|"
                    + "(?:have we receiv(?:e|ed)|did we receive|did (?:we|you) get) (?:any )?(?:our |the |(?:the )?supplier )?invoices?|did (?:our|the) invoices? arrive|have (?:our |the )?(?:supplier )?invoices? arrived|was the invoice received|how many invoices?(?: did we receive)?|"
                    + "(?:how many (?:supplier )?bills?(?: did we receive)?|(?:have we|did we) receiv(?:e|ed) (?:any )?bills?)|"
                    + "发票(?:还有吗|还有没有|有没有|有吗|多少|数量|收到多少|收到了吗|到(?:了)?吗|有没有到)|收到发票了吗|(?:有没有|有)收到(?:供应商)?发票(?:吗|[?？])|(?:供应商)?发票(?:到|送到)(?:了)?吗|"
                    + "账单(?:还有吗|还有没有|有没有|有吗|多少|数量|收到多少)|收到(?:了)?账单了吗)[?.!。！？]*$",
            Pattern.CASE_INSENSITIVE);
    private static final Pattern STOCK_QUERY = Pattern.compile(
            "^how much\\s+(.+?)\\s+(?:is|are)\\s+in\\s+stock[?.!]*$|"
                    + "^(?:stock (?:level|quantity) of)\\s+(.+?)[?.!]*$|"
                    + "^what(?:'s| is)\\s+the\\s+stock(?:\\s+level)?\\s+(?:of|for)\\s+(.+?)[?.!]*$|"
                    + "^(?:what(?:'s| is)\\s+the\\s+)?inventory(?:\\s+level)?\\s+(?:of|for)\\s+(.+?)[?.!]*$|"
                    + "^is\\s+(.+?)\\s+in\\s+stock[?.!]*$|"
                    + "^how many\\s+(.+?)\\s+do we have(?:\\s+in stock)?[?.!]*$|"
                    + "^how many\\s+do we have\\s+of\\s+(.+?)[?.!]*$|"
                    + "^do we have (?:any )?(.+?)\\s+(?:left|remaining)(?:\\s+in stock)?[?.!]*$|"
                    + "^how many\\s+(.+?)\\s+(?:are )?(?:left|remaining)(?:\\s+in stock)?[?.!]*$|"
                    + "^have we got\\s+(?:any\\s+)?(.+?)(?:\\s+in (?:the )?(?:shop|store))?[?.!]*$|"
                    + "^do we have\\s+(?!(?:any\\s+)?(?:customers?|suppliers?|orders?|invoices?|sales|revenue|takings)\\b)(?:any\\s+)?(.+?)(?:\\s+in stock)?[?.!]*$|"
                    + "^any\\s+(.+?)\\s+in stock[?.!]*$|"
                    + "^is there (?:any )?(.+?)\\s+(?:left|remaining)(?:\\s+in stock)?[?.!]*$|"
                    + "^do we still have (?:any )?(.+?)(?:\\s+in stock)?[?.!]*$|"
                    + "^(?:查一下|查询|查看)\\s*(.+?)(?:还有多少|有多少)?库存[？?。]*$|"
                    + "^(?!(?:帮我)?(?:查下|查一下|看看|看下)\\s)(.+?)库存(?:还有多少|有多少)[？?。]*$|"
                    + "^(?!(?:帮我)?(?:查下|查一下|看看|看下)\\s)(.+?)(?:还剩多少|剩多少)(?:库存)?[？?。]*$|"
                    + "^(?:店里|我们店里|门店)还有\\s*(.+?)(?:\\s*(?:吗|没有|没了))?[？?。]*$|"
                    + "^(?:店里|我们店里|门店)有\\s*(.+?)吗[？?。]*$|"
                    + "^(?!(?:订单|客户|供应商|发票))(.+?)(?:还有吗|还有没有|有吗)[？?。]*$|"
                    + "^(?:帮我)?(?:查下|查一下|看看|看下)\\s*(.+?)\\s*(?:还剩几件|还剩多少|剩下多少|还有多少|库存)[？?。]*$",
            Pattern.CASE_INSENSITIVE);
    /**
     * Explicit "stock of/for <product>" wording must extract only the product.
     * Keep this ahead of the broader "do we have <thing>" fallback so "stock
     * of VB Cans" is never sent to Odoo as the product name.
     */
    private static final Pattern STOCK_QUERY_DIRECT = Pattern.compile(
            "^(?:do we have|is there|can you check)\\s+(?:any\\s+)?stock\\s+(?:of|for)\\s+(.+?)[?.!]*$|"
                    + "^how much\\s+stock\\s+do we have\\s+(?:of|for)\\s+(.+?)[?.!]*$|"
                    + "^what\\s+stock\\s+do we have\\s+(?:of|for)\\s+(.+?)[?.!]*$|"
                    + "^(?:库存里有|库存中有)\\s*(.+?)(?:的)?(?:库存|现货)?\\s*吗[？?。.!]*$|"
                    + "^有没有\\s*(.+?)(?:的)?(?:库存|现货)(?:吗)?[？?。.!]*$|"
                    + "^(.+?)(?:有库存吗|有货吗)[？?。]*$|"
                    + "^(?:查|搜索|查询)(?:一下)?\\s*(?:条码|barcode)\\s*[:：]?\\s*([A-Za-z0-9-]{4,})[？?。.!]*$|"
                    + "^(?:找|搜索|查询)(?:一下)?\\s*(?:SKU|sku)\\s*[:：]?\\s*([A-Za-z0-9_-]{2,})[？?。.!]*$|"
                    + "^(?:check|look up|search|find)(?:\\s+the)?\\s+(?:barcode)\\s*[:#]?\\s*([A-Za-z0-9-]{4,})[?.!]*$|"
                    + "^(?:check|look up|search|find)(?:\\s+the)?\\s+(?:SKU|sku)\\s*[:#]?\\s*([A-Za-z0-9_-]{2,})[?.!]*$",
            Pattern.CASE_INSENSITIVE);

    private AssistantFastPathRouter() {}

    public static Match maybeMatch(String question) {
        if (question == null || question.isBlank()) {
            return null;
        }
        String normalized = normalize(question);
        // Reject forged routes before any entity/report shortcut can extract a
        // harmless-looking search term from the same malicious utterance.
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
        if ((SALES_MARKER.matcher(normalized).find() || DATED_SALES_AMOUNT_QUESTION.matcher(normalized).find())
                && DATE_TOKEN.matcher(normalized).find()) {
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
        var deadStockRange = DEAD_STOCK_RANGE.matcher(normalized);
        if (deadStockRange.matches()) {
            String days = firstNonNull(
                    deadStockRange.group(1), deadStockRange.group(2),
                    deadStockRange.group(3), deadStockRange.group(4),
                    deadStockRange.group(5));
            return new Match(
                    "report_dead_stock",
                    "Dead stock report",
                    Map.of("days", days),
                    "",
                    "",
                    "",
                    "");
        }
        if (DEAD_STOCK_DEFAULT.matcher(normalized).matches()) {
            return new Match(
                    "report_dead_stock",
                    "Dead stock report",
                    Map.of("days", "30"),
                    "",
                    "",
                    "",
                    "");
        }
        if (STOCK_VALUE.matcher(normalized).matches()) {
            return new Match(
                    "report_stock_value",
                    "Inventory cash value report",
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
        var customerQuery = LOOKUP_CUSTOMER_QUERY.matcher(question.trim());
        if (customerQuery.matches()) {
            String query = cleanQuery(firstNonNull(
                    customerQuery.group(1), customerQuery.group(2), customerQuery.group(3), customerQuery.group(4)));
            if (query != null) {
                return new Match(
                        "search_customer",
                        "Opened customers.",
                        Map.of("query", query),
                        "",
                        "",
                        "",
                        "");
            }
        }
        if (LOOKUP_CUSTOMERS.matcher(normalized).matches()) {
            return new Match(
                    "search_customer",
                    "Opened customers.",
                    Map.of("query", ""),
                    "",
                    "",
                    "",
                    "");
        }
        if (LOOKUP_SUPPLIERS.matcher(normalized).matches()) {
            return new Match(
                    "navigate",
                    "Opened suppliers.",
                    Map.of(),
                    "/suppliers/odoo",
                    "",
                    "",
                    "");
        }
        if (LOOKUP_PRICE_LISTS.matcher(normalized).matches()) {
            return new Match(
                    "navigate",
                    "Opened price lists.",
                    Map.of(),
                    "/pricelists",
                    "",
                    "",
                    "");
        }
        var directStockQuery = STOCK_QUERY_DIRECT.matcher(question.trim());
        if (directStockQuery.matches()) {
            String query = cleanQuery(firstNonNull(
                    directStockQuery.group(1), directStockQuery.group(2), directStockQuery.group(3),
                    directStockQuery.group(4), directStockQuery.group(5), directStockQuery.group(6),
                    directStockQuery.group(7), directStockQuery.group(8), directStockQuery.group(9),
                    directStockQuery.group(10)));
            if (query != null) {
                return new Match("report_stock", "Stock report", Map.of("query", query), "", "", "", "");
            }
        }
        var productQuery = LOOKUP_PRODUCT_QUERY.matcher(question.trim());
        if (productQuery.matches()) {
            String query = cleanQuery(firstNonNull(
                    productQuery.group(1), productQuery.group(2), productQuery.group(3),
                    productQuery.group(4), productQuery.group(5), productQuery.group(6)));
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
        if (LOW_STOCK.matcher(normalized).matches()) {
            return new Match(
                    "navigate",
                    "Opened replenishment review.",
                    Map.of(),
                    "/stock/replenishment",
                    "replenishment",
                    "",
                    "");
        }
        if (STOCK_CLARIFICATION.matcher(normalized).matches()) {
            boolean chinese = normalized.matches(".*[\\u3400-\\u9fff].*");
            return new Match(
                    "qa",
                    chinese
                            ? "请告诉我具体商品名称或条码，我会查询本门店库存；查无匹配和库存数据暂不可用是两种不同情况。"
                            : "Please give me the exact product name or barcode so I can check this store's stock. No catalogue match and temporarily unavailable stock data are different results.",
                    Map.of(),
                    "",
                    "",
                    "",
                    "");
        }
        if (HELP.matcher(normalized).matches()) {
            return new Match(
                    "qa",
                    "I can help with sales, stock, products, replenishment, pricing, wine recommendations and invoice previews. I only prepare suggestions and previews; staff confirm business actions.",
                    Map.of(),
                    "",
                    "",
                    "",
                    "");
        }
        if (TICKET_COUNT.matcher(normalized).matches()) {
            return new Match(
                    "report_aov",
                    "Transaction count",
                    Map.of(),
                    "",
                    "",
                    "",
                    "");
        }
        if (INVOICE_REPORT.matcher(normalized).matches()) {
            return new Match(
                    "report_adhoc",
                    "Invoice counts and existence stay in reporting; invoice scanning is for a specific uploaded document.",
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
                    stockQuery.group(13), stockQuery.group(14), stockQuery.group(15), stockQuery.group(16),
                    stockQuery.group(17), stockQuery.group(18), stockQuery.group(19), stockQuery.group(20),
                    stockQuery.group(21)));
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

    /** Normalize cashier text before deterministic matching without changing query casing. */
    static String normalize(String question) {
        return question.trim()
                .toLowerCase(Locale.ROOT)
                .replaceAll("[\\u3000\\s]+", " ")
                .replace('？', '?')
                .replace('！', '!')
                .replace('。', '.');
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
