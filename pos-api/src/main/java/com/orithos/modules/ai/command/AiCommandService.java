package com.orithos.modules.ai.command;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.modules.customer.CustomerDetail;
import com.orithos.modules.customer.CustomerService;
import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.ProductPrice;
import com.orithos.modules.product.ProductService;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.ai.report.NativeAiReportQueryService;
import com.orithos.modules.ai.replenishment.NativeReplenishmentService;
import com.orithos.modules.ai.replenishment.ReplenishmentPlan;
import com.orithos.modules.ai.replenishment.ReplenishmentSuggestion;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.security.AdminAccess;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.*;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static com.orithos.modules.ai.command.AiCommandDtos.*;

@Service
public class AiCommandService {
    private static final long MAX_PRODUCTS = 50;
    private static final long MAX_CUSTOMERS = 20;
    private final AiCommandRepository repository;
    private final ObjectMapper mapper;
    private final TenantContextFactory tenantContextFactory;
    private final ProductMapper productMapper;
    private final ProductService productService;
    private final CustomerMapper customerMapper;
    private final CustomerService customerService;
    private final NativeAiReportQueryService nativeReports;
    private final NativeReplenishmentService replenishmentClient;
    private final JdbcTemplate jdbc;
    private final AiCommandParser commandParser;
    private final boolean enabled;
    private final boolean executionEnabled;

    public AiCommandService(AiCommandRepository repository, ObjectMapper mapper,
                            TenantContextFactory tenantContextFactory, ProductMapper productMapper,
                            ProductService productService, CustomerMapper customerMapper,
                            CustomerService customerService, JdbcTemplate jdbc,
                            NativeAiReportQueryService nativeReports,
                            NativeReplenishmentService replenishmentClient,
                            AiCommandParser commandParser,
                            @Value("${app.ai.commands.enabled:false}") boolean enabled,
                            @Value("${app.ai.commands.execution-enabled:false}") boolean executionEnabled) {
        this.repository = repository;
        this.mapper = mapper;
        this.tenantContextFactory = tenantContextFactory;
        this.productMapper = productMapper;
        this.productService = productService;
        this.customerMapper = customerMapper;
        this.customerService = customerService;
        this.jdbc = jdbc;
        this.nativeReports = nativeReports;
        this.replenishmentClient = replenishmentClient;
        this.commandParser = commandParser;
        this.enabled = enabled;
        this.executionEnabled = executionEnabled;
    }

    public CommandResponse parse(ParseRequest request) {
        requireEnabled();
        AdminAccess.requireAdmin();
        TenantContext tenant = tenantContextFactory.fromSecurity();
        Long outlet = tenant.requireOutletId();
        if (outlet == null) throw new BusinessException(40021, "Your account is not bound to a store.");
        String text = request.text().trim();
        Parsed parsed;
        try {
            // Resolve explicit, supported command phrases deterministically first.
            // This keeps manual preview commands available when the model provider is
            // slow or temporarily returns a non-conforming response. Orithos remains
            // the source of record for all resolved IDs and current values.
            parsed = parseText(tenant, text);
        } catch (BusinessException deterministic) {
            if (deterministic.getCode() != 40027) throw deterministic;
            try {
                parsed = commandParser.parse(tenant, text);
            } catch (BusinessException providerOrSchemaFailure) {
                // Keep a narrow deterministic fallback for provider failures on
                // phrases that were not recognized before the Gateway call.
                try {
                    parsed = parseText(tenant, text);
                } catch (BusinessException unsupportedText) {
                    throw providerOrSchemaFailure;
                }
            }
        }
        if (parsed.items() == null) parsed = new Parsed(parsed.type(), parsed.confidence(), parsed.summary(),
                List.of(), parsed.changes(), parsed.excluded() == null ? List.of() : parsed.excluded());
        AiCommandStatus initialStatus = initialStatus(parsed);
        UUID id = UUID.randomUUID();
        Instant expires = Instant.now().plus(10, ChronoUnit.MINUTES);
        String version = UUID.randomUUID().toString();
        String idempotency = id.toString();
        String payload = write(parsed);
        repository.insert(id, tenant.vendorId(), tenant.userId(), outlet, parsed.type.name(),
                initialStatus.name(), payload, text, request.threadId(), expires,
                version, idempotency);
        repository.audit(id, tenant.vendorId(), tenant.userId(), outlet, initialStatus.name(),
                "command parsed", null);
        return response(id, parsed, initialStatus, version, expires, List.of());
    }

    public CommandResponse get(UUID id) {
        TenantContext tenant = tenantContextFactory.fromSecurity();
        AiCommandRepository.Row row = owned(id, tenant);
        Parsed parsed = read(row.payload());
        AiCommandStatus status = effectiveStatus(row);
        return response(id, parsed, status, row.version(), row.expiresAt(), List.of());
    }

    public CommandResponse cancel(UUID id) {
        TenantContext tenant = tenantContextFactory.fromSecurity();
        AiCommandRepository.Row row = owned(id, tenant);
        if (repository.cancelPreview(id, row.version()) != 1) {
            throw new BusinessException(40922, "This command is no longer awaiting confirmation.");
        }
        repository.audit(id, tenant.vendorId(), tenant.userId(), row.outletId(), "CANCELLED",
                "cancelled by user", null);
        return get(id);
    }

    @Transactional
    public CommandResponse confirm(UUID id, ConfirmRequest request) {
        requireEnabled();
        if (!executionEnabled) {
            throw new BusinessException(50303,
                    "AI command execution is disabled. Preview is available; enable the execution switch only after Orithos UAT.");
        }
        AdminAccess.requireAdmin();
        TenantContext tenant = tenantContextFactory.fromSecurity();
        AiCommandRepository.Row row = owned(id, tenant);
        if (!isConfirmation(request.confirmationText())) {
            throw new BusinessException(40022, "Say or type “confirm” to execute this change.");
        }
        if (row.expiresAt().isBefore(Instant.now())) {
            repository.updateStatus(id, AiCommandStatus.EXPIRED.name(), UUID.randomUUID().toString());
            throw new BusinessException(40921, "This change preview has expired. Create a new preview.");
        }
        if (AiCommandType.PREVIEW_REPLENISHMENT.name().equals(row.type())) {
            throw new BusinessException(40925,
                    "Replenishment is preview-only in this release and cannot be confirmed.");
        }
        if (!AiCommandStatus.PREVIEWED.name().equals(row.status())) {
            if (AiCommandStatus.APPLIED.name().equals(row.status())) return get(id);
            throw new BusinessException(40922, "This command is no longer awaiting confirmation.");
        }
        if (request.expectedVersion() != null && !request.expectedVersion().equals(row.version())) {
            throw new BusinessException(40923, "The preview version is stale. Create a new preview.");
        }
        Parsed parsed = read(row.payload());
        String executingVersion = UUID.randomUUID().toString();
        if (repository.claimForExecution(id, row.version(), executingVersion) != 1) {
            throw new BusinessException(40922, "This command is already being confirmed or is no longer pending.");
        }
        repository.audit(id, tenant.vendorId(), tenant.userId(), row.outletId(), "EXECUTING",
                "confirmed by user", null);
        List<String> writes = new ArrayList<>();
        try {
            execute(parsed, writes);
            repository.updateStatus(id, AiCommandStatus.APPLIED.name(), UUID.randomUUID().toString());
            repository.audit(id, tenant.vendorId(), tenant.userId(), row.outletId(), "APPLIED",
                    String.join(",", writes), null);
            return response(id, parsed, AiCommandStatus.APPLIED, row.version(), row.expiresAt(), writes);
        } catch (StaleException e) {
            repository.recordTerminalFailure(id, tenant.vendorId(), tenant.userId(), row.outletId(),
                    AiCommandStatus.STALE.name(), e.getMessage());
            throw new BusinessException(40924, e.getMessage());
        } catch (RuntimeException e) {
            repository.recordTerminalFailure(id, tenant.vendorId(), tenant.userId(), row.outletId(),
                    AiCommandStatus.FAILED.name(), e.getClass().getSimpleName());
            throw e;
        }
    }

    private AiCommandRepository.Row owned(UUID id, TenantContext tenant) {
        AiCommandRepository.Row row = repository.find(id);
        if (row == null || row.vendorId() != tenant.vendorId() || row.userId() != tenant.userId()
                || !Objects.equals(row.outletId(), tenant.requireOutletId())) {
            throw new BusinessException(40421, "AI command not found.");
        }
        return row;
    }

    private void requireEnabled() {
        if (!enabled) {
            throw new BusinessException(50302,
                    "AI change commands are disabled. Enable app.ai.commands.enabled after isolated UAT.");
        }
    }

    private void execute(Parsed parsed, List<String> writes) {
        switch (parsed.type) {
            case UPDATE_PRODUCT -> {
                if (parsed.items.size() > MAX_PRODUCTS) throw new BusinessException(40023, "Too many products.");
                for (CommandItem item : parsed.items) {
                    Product before = productMapper.findById(item.id());
                    if (before == null || !Objects.equals(String.valueOf(before.getName()), String.valueOf(item.before()))) {
                        throw new StaleException("Product “" + item.name() + "” changed after preview.");
                    }
                    if (!"name".equals(item.field())) throw new BusinessException(40024, "This product field is not enabled yet.");
                    before.setName(String.valueOf(item.after()));
                    productService.update(before);
                    writes.add("product:" + item.id());
                }
            }
            case UPDATE_CUSTOMER -> {
                if (parsed.items.size() > MAX_CUSTOMERS) throw new BusinessException(40025, "Too many customers.");
                for (CommandItem item : parsed.items) {
                    CustomerDetail before = customerMapper.findDetailById(item.id());
                    if (before == null || !Objects.equals(before.getName(), item.name())) {
                        throw new StaleException("Customer “" + item.name() + "” changed after preview.");
                    }
                    CustomerDetail update = customerService.getDetail(item.id());
                    applyCustomerChange(update, item.field(), String.valueOf(item.after()));
                    customerService.update(item.id(), update);
                    writes.add("customer:" + item.id());
                }
            }
            case PREVIEW_PRICE_CHANGE -> {
                for (CommandItem item : parsed.items) {
                    Product p = productMapper.findById(item.id());
                    if (p == null) throw new StaleException("Product no longer exists.");
                    BigDecimal before = firstPrice(item.id());
                    if (before == null || !before.toPlainString().equals(String.valueOf(item.before()))) {
                        throw new StaleException("Price for “" + item.name() + "” changed after preview.");
                    }
                    productMapper.updatePriceById(productMapper.findDefaultPriceId(item.id()),
                            new BigDecimal(String.valueOf(item.after())));
                    writes.add("price:" + item.id());
                }
            }
            case PREVIEW_REPLENISHMENT -> throw new BusinessException(40925,
                    "Replenishment is preview-only in this release and cannot be confirmed.");
        }
    }

    private static void applyCustomerChange(CustomerDetail detail, String field, String value) {
        switch (field) {
            case "name" -> detail.setName(value);
            case "phone" -> detail.setPhone(value);
            case "email" -> detail.setEmail(value);
            default -> throw new BusinessException(40026, "This customer field is not enabled yet.");
        }
    }

    private Parsed parseText(TenantContext tenant, String text) {
        String lower = text.toLowerCase(Locale.ROOT);
        if (lower.contains("补货") || lower.contains("replenish") || lower.contains("restock")) {
            return replenishmentPreview(text, replenishmentClient == null
                    ? null : replenishmentClient.plan(tenant, 21, 50));
        }
        Parsed broadPrice = broadPricePreviewRequest(tenant, text);
        if (broadPrice != null) return broadPrice;
        Matcher price = Pattern.compile("(?i)(?:raise|increase|lower|decrease|提高|降低|上调|下调).*?([A-Za-z0-9][A-Za-z0-9 ._-]{1,80}?).*?(\\d+(?:\\.\\d+)?)\\s*%").matcher(text);
        if (price.find()) {
            NativeProductMatch p = findNativeProduct(tenant, price.group(1).trim());
            BigDecimal before = p.price();
            if (before == null) throw new BusinessException(40926, "This product has no current price.");
            BigDecimal pct = new BigDecimal(price.group(2)).divide(BigDecimal.valueOf(100));
            boolean down = lower.contains("lower") || lower.contains("decrease") || lower.contains("降低") || lower.contains("下调");
            BigDecimal after = before.multiply(down ? BigDecimal.ONE.subtract(pct) : BigDecimal.ONE.add(pct))
                    .setScale(2, RoundingMode.HALF_UP);
            CommandItem item = new CommandItem(p.id(), p.name(), "price", before.toPlainString(),
                    after.toPlainString(), "current store price preview", "READY");
            return new Parsed(AiCommandType.PREVIEW_PRICE_CHANGE, BigDecimal.valueOf(.94),
                    "将调整 1 个商品的当前销售价；确认后才会写入。", List.of(item),
                    Map.of("percent", price.group(2), "direction", down ? "decrease" : "increase"),
                    List.of());
        }
        Parsed unresolvedPrice = unresolvedPricePreviewRequest(text);
        if (unresolvedPrice != null) return unresolvedPrice;
        Matcher product = Pattern.compile("(?i)(?:把|将|rename|change|update)\\s*(.+?)\\s*(?:的)?\\s*(?:显示名称|员工显示名|名称|name)\\s*(?:改成|设置为|to)\\s*(.+)").matcher(text);
        boolean productMatched = product.find();
        if (!productMatched) {
            product = Pattern.compile("(?i)(?:rename|change|update)\\s+(.+?)\\s+to\\s+(.+)").matcher(text);
            productMatched = product.find();
        }
        if (productMatched) {
            NativeProductMatch p = findNativeProduct(tenant, product.group(1).trim());
            CommandItem item = new CommandItem(p.id(), p.name(), "name", p.name(),
                    product.group(2).trim(), "exact product name match", "READY");
            return new Parsed(AiCommandType.UPDATE_PRODUCT, BigDecimal.valueOf(.98),
                    "将修改 1 个商品的显示名称。", List.of(item), Map.of("field", "name"), List.of());
        }
        Matcher barcode = Pattern.compile("(?i)(?:把|将|change|update|set)?\\s*(.+?)\\s*(?:的)?\\s*(?:条码|条形码|barcode|ean)\\s*(?:改成|设置为|to|as)\\s*([0-9A-Za-z-]{4,})").matcher(text);
        if (barcode.find()) {
            NativeProductMatch p = findNativeProduct(tenant, barcode.group(1).trim());
            CommandItem item = new CommandItem(p.id(), p.name(), "barcode", p.barcode(),
                    barcode.group(2).trim(), "exact product name or barcode match", "READY");
            return new Parsed(AiCommandType.UPDATE_PRODUCT, BigDecimal.valueOf(.98),
                    "将修改 1 个商品的条码。", List.of(item), Map.of("field", "barcode"), List.of());
        }
        Matcher customer = Pattern.compile("(?i)(?:客户|customer)\\s+(.+?)\\s+(?:的)?\\s*(电话|手机|phone|邮箱|email|姓名|name)\\s*(?:改成|设置为|to)\\s*(.+)").matcher(text);
        if (customer.find()) {
            List<Long> ids = jdbc.queryForList("SELECT id FROM customer WHERE deleted_at IS NULL AND LOWER(TRIM(name)) = LOWER(TRIM(?)) LIMIT 2", Long.class, customer.group(1).trim());
            if (ids.size() != 1) throw new BusinessException(40423, "Customer name must match exactly one customer.");
            CustomerDetail c = customerMapper.findDetailById(ids.getFirst());
            String field = switch (customer.group(2).toLowerCase(Locale.ROOT)) {
                case "电话", "手机", "phone" -> "phone";
                case "邮箱", "email" -> "email";
                default -> "name";
            };
            Object before = "phone".equals(field) ? c.getPhone() : "email".equals(field) ? c.getEmail() : c.getName();
            CommandItem item = new CommandItem(c.getId(), c.getName(), field, before,
                    customer.group(3).trim(), "exact customer name match", "READY");
            return new Parsed(AiCommandType.UPDATE_CUSTOMER, BigDecimal.valueOf(.98),
                    "将修改 1 个客户资料字段。", List.of(item), Map.of("field", field), List.of());
        }
        Parsed unresolved = unresolvedProductRequest(text);
        if (unresolved != null) return unresolved;
        throw new BusinessException(40027,
                "请说明明确对象和变更，例如：把 VB Cans 的显示名称改成 Victoria Bitter。");
    }

    static Parsed replenishmentPreview(String request, ReplenishmentPlan plan) {
        if (plan == null) {
            throw new BusinessException(50320, "Replenishment data is temporarily unavailable.");
        }
        boolean chinese = request != null && request.matches("(?s).*[\\u3400-\\u9fff].*");
        List<CommandItem> items = plan.top().stream()
                .map(item -> replenishmentItem(item, plan, chinese))
                .toList();
        List<CommandItem> excluded = new ArrayList<>();
        for (String gap : plan.dataGaps()) {
            excluded.add(new CommandItem(null, gap, "replenishment", null, null,
                    gap, "EXCLUDED"));
        }
        int omitted = Math.max(0, plan.itemsNeedingOrder() - items.size());
        if (omitted > 0) {
            excluded.add(new CommandItem(null, omitted + " additional suggestions", "replenishment",
                    null, null, "Open the replenishment page to review the remaining items", "EXCLUDED"));
        }
        String asOf = plan.dataAsOf().toString();
        boolean incomplete = "DATA_INCOMPLETE".equalsIgnoreCase(plan.dataQualityStatus());
        String summary;
        if (incomplete && plan.itemsNeedingOrder() == 0) {
            summary = chinese
                    ? "补货建议数据不完整，无法给出完整结果（覆盖 " + plan.coverageDays() + " 天；数据时间 " + asOf + "）。"
                    : "Replenishment data is incomplete, so a complete result cannot be generated ("
                            + plan.coverageDays() + "-day coverage, data as of " + asOf + ").";
        } else if (plan.itemsNeedingOrder() == 0) {
            summary = chinese
                    ? "当前没有商品需要补货建议（覆盖 " + plan.coverageDays() + " 天；数据时间 " + asOf + "）。"
                    : "No replenishment quantities are currently suggested (" + plan.coverageDays()
                            + "-day coverage, data as of " + asOf + ").";
        } else {
            summary = chinese
                    ? "只读补货建议：" + plan.itemsNeedingOrder() + " 个商品需要审核，覆盖 "
                            + plan.coverageDays() + " 天；当前显示 " + items.size() + " 项。数据时间 " + asOf + "。"
                    : "Read-only replenishment preview: " + plan.itemsNeedingOrder()
                            + " products need review for " + plan.coverageDays()
                            + "-day coverage; showing " + items.size() + ". Data as of " + asOf + ".";
        }
        if (incomplete && plan.itemsNeedingOrder() > 0) {
            summary += chinese ? " 部分商品因库存或供应商数据不全而被排除。"
                    : " Some items were excluded because required data is incomplete.";
        }
        return new Parsed(AiCommandType.PREVIEW_REPLENISHMENT,
                "VALID".equalsIgnoreCase(plan.dataQualityStatus())
                        ? BigDecimal.valueOf(.96) : BigDecimal.valueOf(.70),
                summary, items, Map.of("request", request, "target", "current outlet",
                        "quantity", plan.itemsNeedingOrder()), excluded);
    }

    private static CommandItem replenishmentItem(ReplenishmentSuggestion item, ReplenishmentPlan plan,
                                                 boolean chinese) {
        String daysOfStock = item.daysOfStock() == null ? "unknown" :
                BigDecimal.valueOf(item.daysOfStock()).setScale(1, RoundingMode.HALF_UP).toPlainString();
        String reason = (chinese ? "覆盖 " : "coverage=") + plan.coverageDays()
                + (chinese ? " 天；日均销量 " : " days; sales=")
                + BigDecimal.valueOf(item.unitsPerDay()).setScale(3, RoundingMode.HALF_UP).toPlainString()
                + (chinese ? " 件/天；库存覆盖约 " : " units/day; stock cover ≈")
                + daysOfStock + (chinese ? " 天" : " days");
        if (item.caseQuantity() != null && Double.isFinite(item.caseQuantity()) && item.caseQuantity() > 1) {
            double cases = item.suggestedQuantity() / item.caseQuantity();
            if (Math.abs(cases - Math.rint(cases)) < 0.000001) {
                reason += chinese
                        ? "；采购包装 " + formatQuantity(item.caseQuantity()) + " 件/箱，共 " + (long) Math.rint(cases) + " 箱"
                        : "; " + (long) Math.rint(cases) + (Math.rint(cases) == 1 ? " case of " : " cases of ")
                                + formatQuantity(item.caseQuantity()) + " units";
            } else {
                reason += chinese
                        ? "；箱规每箱 " + formatQuantity(item.caseQuantity()) + " 件"
                        : "; case size " + formatQuantity(item.caseQuantity()) + " units";
            }
        }
        String before;
        if (item.forecastAvailable() == null) {
            before = daysOfStock + (chinese ? " 天库存" : " days cover");
        } else {
            String stock = BigDecimal.valueOf(item.forecastAvailable()).setScale(2, RoundingMode.HALF_UP)
                    .stripTrailingZeros().toPlainString();
            String onHand = item.onHand() == null ? "unknown" : BigDecimal.valueOf(item.onHand())
                    .setScale(2, RoundingMode.HALF_UP).stripTrailingZeros().toPlainString();
            before = chinese
                    ? "现有 " + onHand + " " + item.unit() + "；预计可用 " + stock + " " + item.unit()
                            + "；约 " + daysOfStock + " 天覆盖"
                    : onHand + " " + item.unit() + " on hand; " + stock + " " + item.unit()
                            + " projected available; " + daysOfStock + "d cover";
        }
        return new CommandItem(item.productId(), item.name(), "quantity", before,
                BigDecimal.valueOf(item.suggestedQuantity()).stripTrailingZeros().toPlainString(),
                reason, "READY");
    }

    private static String formatQuantity(double quantity) {
        return BigDecimal.valueOf(quantity).stripTrailingZeros().toPlainString();
    }

    /**
     * Keep broad price requests reviewable when the request contains a valid
     * percentage and direction but no single product can be resolved safely.
     * The draft is intentionally non-confirmable until the price page resolves
     * the category/range against the current store pricelist.
     */
    private Parsed unresolvedPricePreviewRequest(String text) {
        Matcher matcher = Pattern.compile("(?i).*?(?:raise|increase|lower|decrease|提高|降低|上调|下调).*?(\\d+(?:\\.\\d+)?)\\s*%.*").matcher(text.trim());
        if (!matcher.matches()) return null;
        String lower = text.toLowerCase(Locale.ROOT);
        boolean down = lower.contains("lower") || lower.contains("decrease")
                || text.contains("降低") || text.contains("下调");
        String direction = down ? "decrease" : "increase";
        String target = text.trim();
        CommandItem excluded = new CommandItem(null, target, "price", null, null,
                "需要在价格页面按分类或价格区间解析当前生效价目表后才能预览",
                "EXCLUDED");
        return new Parsed(AiCommandType.PREVIEW_PRICE_CHANGE, BigDecimal.valueOf(.80),
                "已识别价格调整方向和百分比，但需要在价格页面确认匹配商品后才能生成预览。",
                List.of(), Map.of("percent", matcher.group(1), "direction", direction),
                List.of(excluded));
    }

    /** Resolve bounded category/range price requests against the tenant-scoped Orithos catalogue. */
    private Parsed broadPricePreviewRequest(TenantContext tenant, String text) {
        Matcher percent = Pattern.compile("(?i).*?(?:raise|increase|lower|decrease|提高|降低|上调|下调).*?(\\d+(?:\\.\\d+)?)\\s*%.*").matcher(text.trim());
        if (!percent.matches()) return null;
        Matcher bound = Pattern.compile("(?i)(?:低于|少于|不到|under|below|less than|超过|高于|大于|over|above)\\s*(?:AUD\\s*|\\$)?(\\d+(?:\\.\\d+)?|十|二十|三十|五十|一百)").matcher(text);
        if (!bound.find()) return null;
        BigDecimal threshold = parsePriceNumber(bound.group(1));
        if (threshold == null) return null;
        boolean lowerBound = !bound.group(0).matches("(?i).*(?:超过|高于|大于|over|above).*" );
        String lower = text.toLowerCase(Locale.ROOT);
        boolean down = lower.contains("lower") || lower.contains("decrease")
                || text.contains("降低") || text.contains("下调");
        String categoryToken = null;
        if (text.matches("(?is).*?(红酒|葡萄酒|啤酒|白酒|烈酒).*")) {
            categoryToken = text.replaceAll("(?is).*?(红酒|葡萄酒|啤酒|白酒|烈酒).*", "$1");
        } else if (lower.matches("(?s).*?(red wine|white wine|wine|beer|spirits|liquor).*")) {
            Matcher category = Pattern.compile("(?i)(red wine|white wine|wine|beer|spirits|liquor)").matcher(text);
            if (category.find()) categoryToken = category.group(1);
        }
        if (nativeReports == null) return unresolvedPricePreviewRequest(text);
        NativeAiReportQueryService.ProductCatalogResult catalog = nativeReports.searchPriceProducts(
                tenant, threshold, lowerBound, categoryToken);
        if (catalog.error() != null) return unresolvedPricePreviewRequest(text);
        BigDecimal pct = new BigDecimal(percent.group(1)).divide(BigDecimal.valueOf(100));
        List<CommandItem> items = new ArrayList<>();
        for (Map<String, Object> row : catalog.rows()) {
            BigDecimal price = decimalValue(row.get("list_price"));
            String category = String.valueOf(row.getOrDefault("category", ""));
            if (price == null || price.signum() <= 0
                    || (lowerBound ? price.compareTo(threshold) > 0 : price.compareTo(threshold) < 0)) continue;
            if (categoryToken != null && !categoryMatches(category, categoryToken)) continue;
            Object idValue = row.get("id");
            Long id = idValue instanceof Number number ? number.longValue() : null;
            String name = String.valueOf(row.getOrDefault("name", "")).trim();
            if (id == null || id <= 0 || name.isBlank()) continue;
            BigDecimal after = price.multiply(down ? BigDecimal.ONE.subtract(pct) : BigDecimal.ONE.add(pct))
                    .setScale(2, RoundingMode.HALF_UP);
            if (items.size() < MAX_PRODUCTS) {
                items.add(new CommandItem(id, name, "price", price.toPlainString(), after.toPlainString(),
                        "current Orithos catalogue price; bounded preview", "READY"));
            }
        }
        if (items.isEmpty()) return unresolvedPricePreviewRequest(text);
        return new Parsed(AiCommandType.PREVIEW_PRICE_CHANGE, BigDecimal.valueOf(.92),
                "将预览 " + items.size() + " 个商品的当前销售价变化；确认后才会写入。", items,
                Map.of("percent", percent.group(1), "direction", down ? "decrease" : "increase",
                        "amount", threshold.toPlainString()), List.of());
    }

    private static BigDecimal parsePriceNumber(String value) {
        return switch (value) {
            case "十" -> BigDecimal.TEN;
            case "二十" -> BigDecimal.valueOf(20);
            case "三十" -> BigDecimal.valueOf(30);
            case "五十" -> BigDecimal.valueOf(50);
            case "一百" -> BigDecimal.valueOf(100);
            default -> decimalValue(value);
        };
    }

    private static BigDecimal decimalValue(Object value) {
        if (value == null) return null;
        try { return new BigDecimal(String.valueOf(value)); }
        catch (NumberFormatException ignored) { return null; }
    }

    private static boolean categoryMatches(String category, String token) {
        String value = category.toLowerCase(Locale.ROOT);
        String wanted = token.toLowerCase(Locale.ROOT);
        if (wanted.contains("红酒") || wanted.contains("red wine")) return value.contains("wine") || value.contains("red");
        if (wanted.contains("葡萄酒") || wanted.equals("wine")) return value.contains("wine");
        if (wanted.contains("啤酒") || wanted.equals("beer")) return value.contains("beer");
        if (wanted.contains("烈酒") || wanted.contains("白酒") || wanted.equals("spirits") || wanted.equals("liquor")) return value.contains("spirit") || value.contains("liquor");
        return value.contains(wanted);
    }

    /** Keep an unresolved product change as a non-confirmable draft when the
     * provider is unavailable or returns a malformed command shape. */
    private Parsed unresolvedProductRequest(String text) {
        Matcher matcher = Pattern.compile("(?i)(?:product|商品)\\s+(.+?)(?:\\s+(?:to|改成|设置为)\\s+(.+))?$").matcher(text.trim());
        boolean changeIntent = text.matches("(?is).*?(?:修改|编辑|更改|改成|rename|change|update|edit).*?");
        if (!changeIntent || !matcher.find()) return null;
        String name = matcher.group(1) == null ? "" : matcher.group(1).trim();
        String after = matcher.group(2) == null ? null : matcher.group(2).trim();
        if (name.isBlank()) return null;
        CommandItem excluded = new CommandItem(null, name, "name", null, after,
                "No unique product matched; please provide an exact product name or barcode", "EXCLUDED");
        return new Parsed(AiCommandType.UPDATE_PRODUCT, BigDecimal.valueOf(.35),
                "未找到唯一商品，无法生成可确认的修改预览。请提供准确商品名称或条码。",
                List.of(), Map.of("field", "name"), List.of(excluded));
    }

    private BigDecimal firstPrice(Long productId) {
        List<ProductPrice> prices = productMapper.findPricesByProductId(productId);
        return prices == null || prices.isEmpty() ? null : prices.getFirst().getPrice();
    }

    private NativeProductMatch findNativeProduct(TenantContext tenant, String query) {
        if (nativeReports == null) throw new BusinessException(50320, "Orithos product source is unavailable.");
        NativeAiReportQueryService.ProductSearchResult result = nativeReports.searchProducts(tenant, query, 3);
        if (result.error() != null) throw new BusinessException(50320, "Orithos product source is unavailable.");
        if (result.rows().size() != 1) {
            throw new BusinessException(40422, "Product name must match exactly one Orithos product.");
        }
        Map<String, Object> row = result.rows().getFirst();
        Object id = row.get("id");
        if (!(id instanceof Number number) || number.longValue() <= 0) {
            throw new BusinessException(40422, "Orithos product has no valid record ID.");
        }
        Object rawPrice = row.get("list_price");
        BigDecimal price = null;
        if (rawPrice != null) {
            try { price = new BigDecimal(rawPrice.toString()); }
            catch (NumberFormatException ignored) { }
        }
        Object rawBarcode = row.get("barcode");
        String barcode = rawBarcode == null || Boolean.FALSE.equals(rawBarcode) ? null : String.valueOf(rawBarcode);
        return new NativeProductMatch(number.longValue(), String.valueOf(row.getOrDefault("name", query)), price, barcode);
    }

    private record NativeProductMatch(Long id, String name, BigDecimal price, String barcode) { }

    private boolean isConfirmation(String text) {
        String value = text == null ? "" : text.trim().toLowerCase(Locale.ROOT);
        return value.matches("(?s).*(confirm|confirmed|确认|确认修改|确认执行|执行).*")
                && !value.matches("(?s).*(cancel|取消|不要|不执行).*");
    }

    private AiCommandStatus effectiveStatus(AiCommandRepository.Row row) {
        if (row.expiresAt().isBefore(Instant.now())
                && AiCommandStatus.PREVIEWED.name().equals(row.status())) return AiCommandStatus.EXPIRED;
        return AiCommandStatus.valueOf(row.status());
    }

    private CommandResponse response(UUID id, Parsed parsed, AiCommandStatus status, String version,
                                     Instant expires, List<String> writes) {
        boolean requiresConfirmation = requiresConfirmation(parsed.type, status);
        return new CommandResponse(id, parsed.type, status, parsed.confidence, requiresConfirmation,
                parsed.summary, parsed.items, parsed.excluded, parsed.changes, expires, version, writes);
    }

    static boolean requiresConfirmation(AiCommandType type, AiCommandStatus status) {
        return status == AiCommandStatus.PREVIEWED && type != AiCommandType.PREVIEW_REPLENISHMENT;
    }

    static AiCommandStatus initialStatus(Parsed parsed) {
        return parsed.type() == AiCommandType.PREVIEW_REPLENISHMENT || !parsed.items().isEmpty()
                ? AiCommandStatus.PREVIEWED : AiCommandStatus.DRAFT;
    }

    private String write(Parsed parsed) {
        try { return mapper.writeValueAsString(parsed); }
        catch (Exception e) { throw new BusinessException(50021, "Could not save AI command preview."); }
    }

    private Parsed read(String json) {
        try { return mapper.readValue(json, Parsed.class); }
        catch (Exception e) { throw new BusinessException(50022, "AI command preview is unreadable."); }
    }

    public record Parsed(AiCommandType type, BigDecimal confidence, String summary,
                         List<CommandItem> items, Map<String, Object> changes,
                         List<CommandItem> excluded) {}

    private static class StaleException extends RuntimeException {
        StaleException(String message) { super(message); }
    }
}
