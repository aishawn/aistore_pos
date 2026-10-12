package com.orithos.modules.supplychain;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.modules.order.Order;
import com.orithos.modules.order.OrderMapper;
import com.orithos.modules.order.OrderProduct;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

@Service
public class SupplyChainService {

    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final DateTimeFormatter WEEK = DateTimeFormatter.BASIC_ISO_DATE;
    private static final int INSERT_BATCH = 200;
    private final ConcurrentHashMap<Long, Object> outletLocks = new ConcurrentHashMap<>();

    private final SupplyChainMapper mapper;
    private final OrderMapper orderMapper;
    private final ObjectMapper json;

    public SupplyChainService(SupplyChainMapper mapper, OrderMapper orderMapper, ObjectMapper json) {
        this.mapper = mapper;
        this.orderMapper = orderMapper;
        this.json = json;
    }

    public record CartResult(Long orderId, SupplyPlanView plan) {
    }

    @Transactional
    public SupplyPlanView currentPlan() {
        synchronized (outletLocks.computeIfAbsent(outletId(), id -> new Object())) {
            return loadOrCreatePlan();
        }
    }

    private SupplyPlanView loadOrCreatePlan() {
        long outletId = outletId();
        LocalDate week = weekStart(LocalDate.now());
        Long id = mapper.findPlanId(outletId, week);
        if (id == null) {
            return regenerateLocked();
        }
        return loadView(id);
    }

    @Transactional
    public SupplyPlanView regenerate() {
        synchronized (outletLocks.computeIfAbsent(outletId(), id -> new Object())) {
            return regenerateLocked();
        }
    }

    private SupplyPlanView regenerateLocked() {
        long outletId = outletId();
        LocalDate today = LocalDate.now();
        LocalDate week = weekStart(today);
        Long existing = mapper.findPlanId(outletId, week);
        if (existing != null && mapper.countOrdered(existing) > 0) {
            throw new BusinessException("This week already has a cart created from the plan. Review that order before generating again.");
        }

        LocalDate lastWeek = week.minusWeeks(1);
        Map<Long, BigDecimal> sales = new HashMap<>();
        for (SupplyChainRows.SalesRow row : mapper.listSales(outletId, lastWeek.atStartOfDay(), week.atStartOfDay())) {
            if (row.getProductId() != null) {
                sales.put(row.getProductId(), nz(row.getQty()));
            }
        }

        Map<Long, SupplyChainRows.SupplierRow> suppliers = new HashMap<>();
        for (SupplyChainRows.SupplierRow row : mapper.listSuppliers(outletId)) {
            suppliers.put(row.getId(), row);
        }
        Map<Long, List<SupplyChainRows.LinkRow>> links = new HashMap<>();
        for (SupplyChainRows.LinkRow link : mapper.listLinks(outletId)) {
            links.computeIfAbsent(link.getProductId(), key -> new ArrayList<>()).add(link);
        }
        Map<String, SupplyChainRows.PriceRow> prices = new HashMap<>();
        for (SupplyChainRows.PriceRow price : mapper.listActivePrices(outletId, today)) {
            prices.putIfAbsent(price.getProductId() + ":" + price.getSupplierId(), price);
        }
        Map<Long, List<SupplyChainRows.DealRow>> deals = new HashMap<>();
        for (SupplyChainRows.DealRow deal : mapper.listActiveDeals(outletId, today)) {
            deals.computeIfAbsent(deal.getSupplierId(), key -> new ArrayList<>()).add(deal);
        }
        Map<Long, SupplyChainRows.PrefRow> prefs = new HashMap<>();
        for (SupplyChainRows.PrefRow pref : mapper.listPrefs(outletId)) {
            prefs.put(pref.getSupplierId(), pref);
        }
        Map<Long, SupplyChainRows.RuleRow> rules = new HashMap<>();
        for (SupplyChainRows.RuleRow rule : mapper.listRules(outletId)) {
            rules.put(rule.getProductId(), rule);
        }

        List<SupplyChainRows.EventRow> events = mapper.listEvents(outletId, today, today.plusDays(7));
        BigDecimal lift = BigDecimal.ZERO;
        List<String> eventNames = new ArrayList<>();
        for (SupplyChainRows.EventRow event : events) {
            if (event.getName() != null && !event.getName().isBlank()) {
                eventNames.add(event.getName().trim());
            }
            if (event.getDemandAdjustment() != null && event.getDemandAdjustment().compareTo(lift) > 0) {
                lift = event.getDemandAdjustment();
            }
        }
        String holidayNote = null;
        if (!eventNames.isEmpty() && lift.signum() > 0) {
            String pct = lift.multiply(HUNDRED).stripTrailingZeros().toPlainString();
            holidayNote = clip(String.join(", ", eventNames) + " +" + pct + "%", 255);
        }

        List<BuiltLine> built = new ArrayList<>();
        List<PurchaseOptimizer.Pick> picks = new ArrayList<>();
        List<Pending> pending = new ArrayList<>();
        List<PurchaseOptimizer.BasketDeal> baskets = basketDeals(deals);

        for (SupplyChainRows.DemandRow product : mapper.listDemand(outletId)) {
            BigDecimal sold = sales.getOrDefault(product.getProductId(), BigDecimal.ZERO);
            PurchaseOptimizer.DemandResult demand = PurchaseOptimizer.demand(
                    sold, product.getCurrentStock(), product.getIncomingStock(), product.getReorderLevel(), lift);
            if (demand == null) {
                continue;
            }
            Long locked = lockedSupplier(rules.get(product.getProductId()));
            List<PurchaseOptimizer.SupplierOption> options = quoteOptions(product, demand.rawQty(), locked, links, prices, deals, suppliers);
            PurchaseOptimizer.Pick pick;
            if (locked != null && options.stream().noneMatch(option -> option.supplierId() == locked)) {
                PurchaseOptimizer.Normalized qty = PurchaseOptimizer.normalize(demand.rawQty(), product.getCaseQuantity(), null);
                SupplyChainRows.SupplierRow supplier = suppliers.get(locked);
                pick = PurchaseOptimizer.Pick.unpriced(product.getProductId(), qty.units(), qty.cases(), qty.caseSize(),
                        locked, supplier == null ? "Supplier " + locked : supplier.getName(),
                        "Locked supplier has no price on file");
            } else if (options.isEmpty()) {
                PurchaseOptimizer.Normalized qty = PurchaseOptimizer.normalize(demand.rawQty(), product.getCaseQuantity(), null);
                pick = PurchaseOptimizer.Pick.unpriced(product.getProductId(), qty.units(), qty.cases(), qty.caseSize(),
                        null, null, "No supplier price on file");
            } else {
                SupplyChainRows.PrefRow preferred = preferred(options, prefs);
                Long preferredId = preferred == null ? null : preferred.getSupplierId();
                BigDecimal threshold = preferred == null ? null : preferred.getSwitchThreshold();
                pick = PurchaseOptimizer.choose(product.getProductId(), options, locked, preferredId, threshold);
            }
            picks.add(pick);
            pending.add(new Pending(product, sold, demand, pick));
        }

        List<PurchaseOptimizer.Pick> optimised = PurchaseOptimizer.applyBaskets(picks, baskets);
        for (int i = 0; i < pending.size(); i++) {
            built.add(toLine(outletId, holidayNote, pending.get(i), optimised.get(i), prefs, suppliers));
        }
        built.sort(Comparator.comparing((BuiltLine line) -> nz(line.row().getLineCost())).reversed());

        BigDecimal spend = BigDecimal.ZERO;
        BigDecimal saving = BigDecimal.ZERO;
        BigDecimal units = BigDecimal.ZERO;
        for (BuiltLine line : built) {
            spend = spend.add(nz(line.row().getLineCost()));
            saving = saving.add(nz(line.row().getSaving()));
            units = units.add(nz(line.row().getOrderQty()));
        }

        SupplyChainRows.PlanRow plan = new SupplyChainRows.PlanRow();
        plan.setOutletId(outletId);
        plan.setWeekStart(week);
        plan.setWeekEnd(week.plusDays(6));
        plan.setStatus(built.isEmpty() ? "EMPTY" : "READY");
        plan.setProductCount(built.size());
        plan.setTotalUnits(units);
        plan.setEstimatedSpend(spend.setScale(2, RoundingMode.HALF_UP));
        plan.setEstimatedSaving(saving.setScale(2, RoundingMode.HALF_UP));
        plan.setHolidayNote(holidayNote);
        if (existing == null) {
            mapper.insertPlan(plan);
        } else {
            plan.setId(existing);
            mapper.deleteDrafts(existing);
            mapper.deleteLines(existing);
            mapper.updatePlan(plan);
        }

        List<SupplyChainRows.LineRow> rows = new ArrayList<>(built.size());
        for (BuiltLine line : built) {
            line.row().setPlanId(plan.getId());
            rows.add(line.row());
        }
        for (int offset = 0; offset < rows.size(); offset += INSERT_BATCH) {
            mapper.insertLines(rows.subList(offset, Math.min(offset + INSERT_BATCH, rows.size())));
        }
        insertDrafts(outletId, plan.getId(), built);
        return loadView(plan.getId());
    }

    @Transactional
    public SupplyPlanView decide(long lineId, String status) {
        if (!"APPROVED".equals(status) && !"REJECTED".equals(status)) {
            throw new BusinessException("Decision must be APPROVED or REJECTED.");
        }
        long outletId = outletId();
        SupplyChainRows.LineRow line = mapper.findLine(lineId);
        if (line == null || line.getOutletId() == null || line.getOutletId() != outletId) {
            throw new BusinessException("Purchase line not found.");
        }
        if ("ORDERED".equals(line.getStatus())) {
            throw new BusinessException("This line is already on a cart.");
        }
        mapper.updateLineStatus(lineId, outletId, status);
        return loadView(line.getPlanId());
    }

    @Transactional
    public CartResult createCart(long supplierId) {
        long outletId = outletId();
        SupplyPlanView plan = currentPlan();
        List<SupplyChainRows.LineRow> rows = mapper.listLines(plan.getId()).stream()
                .filter(line -> "API".equals(line.getChannel()))
                .filter(line -> line.getSupplierId() != null && line.getSupplierId() == supplierId)
                .toList();
        if (rows.isEmpty()) {
            throw new BusinessException("This supplier has no ready-to-order lines.");
        }
        List<SupplyChainRows.LineRow> eligible = rows.stream()
                .filter(line -> "AI_RECOMMENDED".equals(line.getStatus()) || "APPROVED".equals(line.getStatus()))
                .toList();
        if (eligible.isEmpty()) {
            throw new BusinessException("Nothing is ready to order. Approve unusual quantities first, or the cart was already created.");
        }

        String invoice = invoiceNumber(plan.getWeekStart(), supplierId);
        Order order = new Order();
        order.setType("ORDER");
        order.setStatus("OPEN");
        order.setFromId(supplierId);
        order.setToId(outletId);
        order.setOrderDate(LocalDate.now());
        order.setDueDate(LocalDate.now().plusDays(7));
        order.setInvoiceNumber(invoice);
        order.setReference("AI Supply Chain");
        order.setNotes("Draft cart prepared by Orion AI. Nothing has been paid. Review the lines, then place the order yourself.");
        order.setIncludeFreight(false);
        order.setTotalCost(BigDecimal.ZERO);
        order.setExpectedTotal(BigDecimal.ZERO);
        order.setCreatedById(CurrentUser.id());
        orderMapper.insert(order);

        BigDecimal total = BigDecimal.ZERO;
        for (SupplyChainRows.LineRow line : eligible) {
            OrderProduct product = new OrderProduct();
            product.setOrderId(order.getId());
            product.setProductId(line.getProductId());
            product.setSupplierId(supplierId);
            product.setSupplierCode(line.getSupplierSku());
            product.setCaseQuantity(line.getCaseSize());
            product.setOrderedQuantity(line.getOrderQty());
            product.setBaseCost(perUnit(line));
            product.setOrderedCost(perUnit(line));
            orderMapper.insertProduct(product);
            mapper.markLineOrdered(line.getId(), outletId, order.getId());
            total = total.add(nz(line.getLineCost()));
        }
        total = total.setScale(2, RoundingMode.HALF_UP);
        orderMapper.updateTotals(order.getId(), total, total, eligible.size(), null);
        return new CartResult(order.getId(), loadView(plan.getId()));
    }

    @Transactional
    public SupplyPlanView reviewDraft(long draftId) {
        long outletId = outletId();
        SupplyChainRows.DraftRow draft = mapper.findDraft(draftId);
        if (draft == null || draft.getOutletId() == null || draft.getOutletId() != outletId) {
            throw new BusinessException("Email draft not found.");
        }
        mapper.reviewDraft(draftId, outletId);
        return loadView(draft.getPlanId());
    }

    public SupplySettingsView settings() {
        long outletId = outletId();
        SupplySettingsView view = new SupplySettingsView();
        view.setSuppliers(mapper.listSuppliers(outletId));
        view.setPreferences(mapper.listPrefDetails(outletId));
        view.setPrices(mapper.listPrices(outletId));
        view.setDeals(mapper.listDeals(outletId));
        view.setRules(mapper.listRuleDetails(outletId));
        List<SupplyChainRows.EventRow> events = mapper.listAllEvents(outletId);
        for (SupplyChainRows.EventRow event : events) {
            event.setAdjustmentPercent(nz(event.getDemandAdjustment()).multiply(HUNDRED).stripTrailingZeros());
        }
        view.setEvents(events);
        return view;
    }

    @Transactional
    public SupplySettingsView savePreference(Long supplierId, Integer priority, BigDecimal switchThreshold, String channel) {
        long outletId = outletId();
        requireSupplier(outletId, supplierId);
        String normalized = normalizeChannel(channel);
        int rank = priority == null ? 100 : Math.max(1, priority);
        if (switchThreshold != null && switchThreshold.signum() < 0) {
            throw new BusinessException("Switch threshold cannot be negative.");
        }
        mapper.upsertPref(outletId, supplierId, rank, switchThreshold, normalized);
        return settings();
    }

    @Transactional
    public SupplySettingsView deletePreference(long id) {
        if (mapper.deletePref(id, outletId()) == 0) {
            throw new BusinessException("Preference not found.");
        }
        return settings();
    }

    @Transactional
    public SupplySettingsView addPrice(Long productId, Long supplierId, String supplierSku, BigDecimal basePrice,
                                      BigDecimal caseSize, LocalDate effectiveFrom, LocalDate effectiveTo) {
        long outletId = outletId();
        requireProduct(outletId, productId);
        requireSupplier(outletId, supplierId);
        if (basePrice == null || basePrice.signum() <= 0) {
            throw new BusinessException("Case price must be greater than zero.");
        }
        SupplyChainRows.PriceRow row = new SupplyChainRows.PriceRow();
        row.setOutletId(outletId);
        row.setProductId(productId);
        row.setSupplierId(supplierId);
        row.setSupplierSku(blankToNull(supplierSku));
        row.setBasePrice(basePrice);
        row.setCaseSize(caseSize == null || caseSize.signum() <= 0 ? BigDecimal.ONE : caseSize);
        row.setEffectiveFrom(effectiveFrom == null ? LocalDate.now() : effectiveFrom);
        row.setEffectiveTo(effectiveTo);
        row.setSource("MANUAL");
        mapper.insertPrice(row);
        return settings();
    }

    @Transactional
    public SupplySettingsView deletePrice(long id) {
        if (mapper.deletePrice(id, outletId()) == 0) {
            throw new BusinessException("Price not found.");
        }
        return settings();
    }

    @Transactional
    public SupplySettingsView addDeal(Long supplierId, String name, String dealType, Integer buyQuantity,
                                     Integer freeQuantity, BigDecimal discountPercent, BigDecimal discountAmount,
                                     String eligibleProducts, Boolean requiresRep, Boolean mixMatch,
                                     LocalDate validFrom, LocalDate validTo) {
        long outletId = outletId();
        requireSupplier(outletId, supplierId);
        String type = dealType == null ? "" : dealType.trim().toUpperCase();
        if (!Set.of("BUY_X_GET_Y", "PERCENT", "AMOUNT_OFF").contains(type)) {
            throw new BusinessException("Deal type must be BUY_X_GET_Y, PERCENT, or AMOUNT_OFF.");
        }
        if (name == null || name.isBlank()) {
            throw new BusinessException("Deal name is required.");
        }
        SupplyChainRows.DealRow row = new SupplyChainRows.DealRow();
        row.setOutletId(outletId);
        row.setSupplierId(supplierId);
        row.setName(name.trim());
        row.setDealType(type);
        row.setBuyQuantity(buyQuantity == null ? 0 : Math.max(0, buyQuantity));
        row.setFreeQuantity(freeQuantity == null ? 0 : Math.max(0, freeQuantity));
        row.setDiscountPercent(discountPercent);
        row.setDiscountAmount(discountAmount);
        row.setEligibleProducts(blankToNull(eligibleProducts));
        row.setRequiresRep(Boolean.TRUE.equals(requiresRep));
        row.setMixMatch(Boolean.TRUE.equals(mixMatch));
        row.setValidFrom(validFrom);
        row.setValidTo(validTo);
        mapper.insertDeal(row);
        return settings();
    }

    @Transactional
    public SupplySettingsView deleteDeal(long id) {
        if (mapper.deleteDeal(id, outletId()) == 0) {
            throw new BusinessException("Deal not found.");
        }
        return settings();
    }

    @Transactional
    public SupplySettingsView saveRule(Long productId, String supplierMode, Long supplierId) {
        long outletId = outletId();
        requireProduct(outletId, productId);
        String mode = supplierMode == null ? "" : supplierMode.trim().toUpperCase();
        if (!Set.of("LOCKED", "OPTIMIZE").contains(mode)) {
            throw new BusinessException("Supplier mode must be LOCKED or OPTIMIZE.");
        }
        if ("LOCKED".equals(mode)) {
            requireSupplier(outletId, supplierId);
        }
        mapper.upsertRule(outletId, productId, mode, "LOCKED".equals(mode) ? supplierId : null);
        return settings();
    }

    @Transactional
    public SupplySettingsView deleteRule(long id) {
        if (mapper.deleteRule(id, outletId()) == 0) {
            throw new BusinessException("Rule not found.");
        }
        return settings();
    }

    @Transactional
    public SupplySettingsView addEvent(LocalDate eventDate, String name, BigDecimal adjustmentPercent) {
        long outletId = outletId();
        if (eventDate == null) {
            throw new BusinessException("Event date is required.");
        }
        if (name == null || name.isBlank()) {
            throw new BusinessException("Event name is required.");
        }
        BigDecimal percent = adjustmentPercent == null ? BigDecimal.ZERO : adjustmentPercent;
        if (percent.signum() < 0 || percent.compareTo(HUNDRED) > 0) {
            throw new BusinessException("Demand lift must be between 0 and 100.");
        }
        SupplyChainRows.EventRow row = new SupplyChainRows.EventRow();
        row.setOutletId(outletId);
        row.setEventDate(eventDate);
        row.setName(name.trim());
        row.setDemandAdjustment(percent.divide(HUNDRED, 4, RoundingMode.HALF_UP));
        mapper.insertEvent(row);
        return settings();
    }

    @Transactional
    public SupplySettingsView deleteEvent(long id) {
        if (mapper.deleteEvent(id, outletId()) == 0) {
            throw new BusinessException("Event not found.");
        }
        return settings();
    }

    private void insertDrafts(long outletId, long planId, List<BuiltLine> lines) {
        Map<Long, List<BuiltLine>> grouped = new LinkedHashMap<>();
        for (BuiltLine line : lines) {
            if (!"EMAIL".equals(line.row().getChannel()) || line.row().getSupplierId() == null) {
                continue;
            }
            grouped.computeIfAbsent(line.row().getSupplierId(), key -> new ArrayList<>()).add(line);
        }
        for (List<BuiltLine> group : grouped.values()) {
            BuiltLine first = group.get(0);
            String supplier = first.row().getSupplierName() == null ? "Supplier" : first.row().getSupplierName();
            String email = first.email();
            StringBuilder body = new StringBuilder();
            body.append("Hi");
            body.append(",\n\nPlease see below our order:\n\n");
            for (BuiltLine line : group) {
                body.append(line.row().getProductName())
                        .append("  ")
                        .append(strip(line.row().getCaseQty()))
                        .append(" cases (")
                        .append(strip(line.row().getOrderQty()))
                        .append(" units)\n");
            }
            body.append("\nThis draft was prepared by Orion Hub. Please review it before sending.\nThanks");
            SupplyChainRows.DraftRow draft = new SupplyChainRows.DraftRow();
            draft.setPlanId(planId);
            draft.setOutletId(outletId);
            draft.setSupplierId(first.row().getSupplierId());
            draft.setSupplierName(supplier);
            draft.setToEmail(email);
            draft.setSubject("Orion Hub Purchase Order – " + supplier);
            draft.setBody(email == null || email.isBlank()
                    ? "No sales-rep email is on file for this supplier.\n\n" + body
                    : body.toString());
            draft.setStatus("DRAFT");
            draft.setSkuCount(group.size());
            mapper.insertDraft(draft);
        }
    }

    private BuiltLine toLine(long outletId, String holidayNote, Pending pending, PurchaseOptimizer.Pick pick,
                             Map<Long, SupplyChainRows.PrefRow> prefs, Map<Long, SupplyChainRows.SupplierRow> suppliers) {
        SupplyChainRows.DemandRow product = pending.product();
        PurchaseOptimizer.SupplierOption chosen = pick.chosen();
        boolean hasSales = pending.sold().signum() > 0;
        boolean unusual = PurchaseOptimizer.unusual(pending.sold(), pick.units());
        String source = chosen == null ? null : chosen.priceSource();
        int confidence = PurchaseOptimizer.confidence(hasSales, source, unusual, pick.options().size());
        BigDecimal saving = savingOf(pick);
        String channel = channelOf(pick, prefs);
        SupplyChainRows.SupplierRow directory = pick.supplierId() == null ? null : suppliers.get(pick.supplierId());
        String email = chosen != null && chosen.email() != null ? chosen.email() : directory == null ? null : directory.getEmail();

        SupplyChainRows.LineRow row = new SupplyChainRows.LineRow();
        row.setOutletId(outletId);
        row.setProductId(product.getProductId());
        row.setProductName(clip(product.getProductName(), 255));
        row.setSupplierId(pick.supplierId());
        row.setSupplierName(pick.supplierName() == null ? null : clip(pick.supplierName(), 255));
        row.setSupplierSku(chosen == null ? null : chosen.sku());
        row.setChannel(channel);
        row.setLastWeekSales(pending.sold());
        row.setCurrentStock(nz(product.getCurrentStock()));
        row.setIncomingStock(nz(product.getIncomingStock()));
        row.setExpectedDemand(pending.demand().expectedDemand());
        row.setSafetyStock(pending.demand().safetyStock());
        row.setOrderQty(BigDecimal.valueOf(pick.units()));
        row.setCaseQty(BigDecimal.valueOf(pick.cases()));
        row.setCaseSize(BigDecimal.valueOf(pick.caseSize()));
        row.setUnitCost(chosen == null ? null : chosen.cost().effectivePerCase());
        row.setLineCost(chosen == null ? null : chosen.cost().total());
        row.setSaving(saving);
        row.setConfidence(confidence);
        row.setUnusual(unusual);
        row.setReason(reason(pending, holidayNote, pick, unusual));
        row.setDecision(clip(pick.decision(), 512));
        row.setComparisonJson(quotesJson(pick));
        row.setStatus(unusual ? "NEEDS_REVIEW" : "AI_RECOMMENDED");
        return new BuiltLine(row, email);
    }

    private String channelOf(PurchaseOptimizer.Pick pick, Map<Long, SupplyChainRows.PrefRow> prefs) {
        if (pick.chosen() == null) {
            return "OTHER";
        }
        if (pick.chosen().cost().requiresRep()) {
            return "EMAIL";
        }
        SupplyChainRows.PrefRow pref = pick.supplierId() == null ? null : prefs.get(pick.supplierId());
        if (pref != null && pref.getChannel() != null && !pref.getChannel().isBlank()) {
            return normalizeChannel(pref.getChannel());
        }
        return "API";
    }

    private BigDecimal savingOf(PurchaseOptimizer.Pick pick) {
        if (pick.chosen() == null) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        PurchaseOptimizer.SupplierOption chosen = pick.chosen();
        BigDecimal list = nz(chosen.casePrice()).multiply(BigDecimal.valueOf(chosen.orderCases()))
                .add(nz(chosen.freightPerCase()).multiply(BigDecimal.valueOf(chosen.orderCases())))
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal dealSaving = list.subtract(chosen.cost().total()).max(BigDecimal.ZERO);
        BigDecimal next = null;
        for (PurchaseOptimizer.SupplierOption option : pick.options()) {
            if (option.supplierId() == chosen.supplierId()) {
                continue;
            }
            if (next == null || option.cost().total().compareTo(next) < 0) {
                next = option.cost().total();
            }
        }
        BigDecimal alternate = next == null ? BigDecimal.ZERO : next.subtract(chosen.cost().total()).max(BigDecimal.ZERO);
        return dealSaving.max(alternate).setScale(2, RoundingMode.HALF_UP);
    }

    private String reason(Pending pending, String holidayNote, PurchaseOptimizer.Pick pick, boolean unusual) {
        List<String> parts = new ArrayList<>();
        if (holidayNote != null && pending.demand().expectedDemand().compareTo(pending.sold()) > 0) {
            parts.add(holidayNote);
        }
        if (pending.demand().safetyStock().signum() > 0
                && nz(pending.product().getCurrentStock()).compareTo(pending.demand().safetyStock()) < 0) {
            parts.add("Low stock");
        } else if (pending.demand().expectedDemand().compareTo(pending.sold()) > 0) {
            parts.add("Forecast up");
        }
        if (pick.units() > pending.demand().rawQty().intValue()) {
            parts.add("Rounded to case / MOQ");
        }
        if (unusual) {
            parts.add("Unusual quantity");
        }
        if (parts.isEmpty()) {
            parts.add("Replenish forecast");
        }
        return clip(String.join(" · ", parts), 255);
    }

    private String quotesJson(PurchaseOptimizer.Pick pick) {
        List<Map<String, Object>> quotes = new ArrayList<>();
        for (PurchaseOptimizer.SupplierOption option : pick.options()) {
            boolean selected = pick.chosen() != null && option.supplierId() == pick.chosen().supplierId();
            PurchaseOptimizer.CostQuote cost = selected ? pick.chosen().cost() : option.cost();
            Map<String, Object> quote = new LinkedHashMap<>();
            quote.put("supplierId", option.supplierId());
            quote.put("supplier", option.supplierName());
            quote.put("listPrice", option.casePrice());
            quote.put("effective", cost.effectivePerCase());
            quote.put("total", cost.total());
            quote.put("note", cost.note());
            quote.put("chosen", selected);
            quotes.add(quote);
        }
        try {
            return json.writeValueAsString(Map.of("quotes", quotes));
        } catch (Exception e) {
            return "{\"quotes\":[]}";
        }
    }

    private List<PurchaseOptimizer.SupplierOption> quoteOptions(
            SupplyChainRows.DemandRow product, BigDecimal rawQty, Long locked,
            Map<Long, List<SupplyChainRows.LinkRow>> links,
            Map<String, SupplyChainRows.PriceRow> prices,
            Map<Long, List<SupplyChainRows.DealRow>> deals,
            Map<Long, SupplyChainRows.SupplierRow> suppliers) {
        Map<Long, SupplyChainRows.LinkRow> bySupplier = new LinkedHashMap<>();
        for (SupplyChainRows.LinkRow link : links.getOrDefault(product.getProductId(), List.of())) {
            if (link.getSupplierId() != null) {
                bySupplier.putIfAbsent(link.getSupplierId(), link);
            }
        }
        addSynthetic(bySupplier, product.getCoreSupplierId());
        addSynthetic(bySupplier, locked);

        List<PurchaseOptimizer.SupplierOption> options = new ArrayList<>();
        for (SupplyChainRows.LinkRow link : bySupplier.values()) {
            SupplyChainRows.SupplierRow supplier = suppliers.get(link.getSupplierId());
            SupplyChainRows.PriceRow price = prices.get(product.getProductId() + ":" + link.getSupplierId());
            boolean soleSupplier = bySupplier.size() == 1;
            boolean core = product.getCoreSupplierId() != null && product.getCoreSupplierId().equals(link.getSupplierId());
            BigDecimal caseSize;
            BigDecimal casePrice;
            String source;
            String sku = link.getSupplierSku();
            if (price != null && price.getBasePrice() != null) {
                caseSize = price.getCaseSize() != null && price.getCaseSize().signum() > 0
                        ? price.getCaseSize() : product.getCaseQuantity();
                casePrice = price.getBasePrice();
                source = "PRICE_FILE";
                if (price.getSupplierSku() != null && !price.getSupplierSku().isBlank()) {
                    sku = price.getSupplierSku();
                }
            } else if (product.getLastCost() != null && product.getLastCost().signum() > 0 && (soleSupplier || core)) {
                caseSize = product.getCaseQuantity();
                PurchaseOptimizer.Normalized probe = PurchaseOptimizer.normalize(BigDecimal.ONE, caseSize, null);
                casePrice = product.getLastCost().multiply(BigDecimal.valueOf(probe.caseSize()));
                source = "LAST_COST";
            } else {
                continue;
            }
            PurchaseOptimizer.Normalized qty = PurchaseOptimizer.normalize(rawQty, caseSize, link.getMoq());
            List<PurchaseOptimizer.DealRule> rules = skuDeals(deals.get(link.getSupplierId()), product.getProductId());
            BigDecimal freight = supplier == null ? BigDecimal.ZERO : nz(supplier.getFreightPerCase());
            PurchaseOptimizer.CostQuote cost = PurchaseOptimizer.bestCost(qty.cases(), casePrice, freight, rules);
            String name = supplier == null ? "Supplier " + link.getSupplierId() : supplier.getName();
            options.add(new PurchaseOptimizer.SupplierOption(
                    link.getSupplierId(), name, supplier == null ? null : supplier.getEmail(), sku,
                    qty.caseSize(), qty.units(), qty.cases(), casePrice, freight, source, cost));
        }
        return options;
    }

    private List<PurchaseOptimizer.DealRule> skuDeals(List<SupplyChainRows.DealRow> rows, long productId) {
        if (rows == null) {
            return List.of();
        }
        List<PurchaseOptimizer.DealRule> rules = new ArrayList<>();
        for (SupplyChainRows.DealRow row : rows) {
            if (Boolean.TRUE.equals(row.getMixMatch())) {
                continue;
            }
            if (!eligible(row.getEligibleProducts(), productId)) {
                continue;
            }
            rules.add(toDeal(row));
        }
        return rules;
    }

    private List<PurchaseOptimizer.BasketDeal> basketDeals(Map<Long, List<SupplyChainRows.DealRow>> deals) {
        List<PurchaseOptimizer.BasketDeal> baskets = new ArrayList<>();
        for (List<SupplyChainRows.DealRow> rows : deals.values()) {
            for (SupplyChainRows.DealRow row : rows) {
                if (!Boolean.TRUE.equals(row.getMixMatch()) || !"PERCENT".equals(row.getDealType())) {
                    continue;
                }
                baskets.add(new PurchaseOptimizer.BasketDeal(
                        row.getSupplierId(),
                        row.getDiscountPercent() == null
                                ? BigDecimal.ZERO
                                : row.getDiscountPercent().divide(HUNDRED, 6, RoundingMode.HALF_UP),
                        row.getBuyQuantity() == null ? 0 : row.getBuyQuantity(),
                        parseIds(row.getEligibleProducts()),
                        row.getName(),
                        Boolean.TRUE.equals(row.getRequiresRep())));
            }
        }
        return baskets;
    }

    private PurchaseOptimizer.DealRule toDeal(SupplyChainRows.DealRow row) {
        return new PurchaseOptimizer.DealRule(
                row.getDealType(),
                row.getBuyQuantity() == null ? 0 : row.getBuyQuantity(),
                row.getFreeQuantity() == null ? 0 : row.getFreeQuantity(),
                row.getDiscountPercent() == null ? null : row.getDiscountPercent().divide(HUNDRED, 6, RoundingMode.HALF_UP),
                row.getDiscountAmount(),
                Boolean.TRUE.equals(row.getRequiresRep()),
                Boolean.TRUE.equals(row.getMixMatch()),
                row.getName());
    }

    private SupplyPlanView loadView(long planId) {
        SupplyChainRows.PlanRow plan = mapper.findPlan(planId);
        if (plan == null) {
            throw new BusinessException("Purchase plan not found.");
        }
        List<SupplyChainRows.LineRow> rows = mapper.listLines(planId);
        List<SupplyPlanView.Line> lines = rows.stream().map(this::toViewLine).toList();
        SupplyPlanView view = new SupplyPlanView();
        view.setId(plan.getId());
        view.setWeekStart(plan.getWeekStart());
        view.setWeekEnd(plan.getWeekEnd());
        view.setHolidayNote(plan.getHolidayNote());
        view.setProductCount(plan.getProductCount() == null ? lines.size() : plan.getProductCount());
        view.setTotalUnits(nz(plan.getTotalUnits()));
        view.setEstimatedSpend(nz(plan.getEstimatedSpend()));
        view.setEstimatedSaving(nz(plan.getEstimatedSaving()));
        view.setLines(lines);
        view.setOther(lines.stream().filter(line -> "OTHER".equals(line.getChannel())).toList());

        Map<Long, SupplyPlanView.SupplierGroup> groups = new LinkedHashMap<>();
        for (SupplyPlanView.Line line : lines) {
            if (!"API".equals(line.getChannel()) || line.getSupplierId() == null) {
                continue;
            }
            SupplyPlanView.SupplierGroup group = groups.computeIfAbsent(line.getSupplierId(), id -> {
                SupplyPlanView.SupplierGroup created = new SupplyPlanView.SupplierGroup();
                created.setSupplierId(id);
                created.setSupplierName(line.getSupplierName());
                created.setSpend(BigDecimal.ZERO);
                created.setSaving(BigDecimal.ZERO);
                return created;
            });
            group.setSkuCount(group.getSkuCount() + 1);
            group.setSpend(group.getSpend().add(nz(line.getLineCost())));
            group.setSaving(group.getSaving().add(nz(line.getSaving())));
            if (group.getOrderId() == null) {
                group.setOrderId(line.getOrderId());
            }
        }
        view.setReady(new ArrayList<>(groups.values()));

        List<SupplyPlanView.EmailDraft> emails = new ArrayList<>();
        for (SupplyChainRows.DraftRow draft : mapper.listDrafts(planId)) {
            SupplyPlanView.EmailDraft email = new SupplyPlanView.EmailDraft();
            email.setId(draft.getId());
            email.setSupplierId(draft.getSupplierId());
            email.setSupplierName(draft.getSupplierName());
            email.setToEmail(draft.getToEmail());
            email.setSubject(draft.getSubject());
            email.setBody(draft.getBody());
            email.setStatus(draft.getStatus());
            email.setSkuCount(draft.getSkuCount() == null ? 0 : draft.getSkuCount());
            emails.add(email);
        }
        view.setEmails(emails);
        return view;
    }

    private SupplyPlanView.Line toViewLine(SupplyChainRows.LineRow row) {
        SupplyPlanView.Line line = new SupplyPlanView.Line();
        line.setId(row.getId());
        line.setProductId(row.getProductId());
        line.setProductName(row.getProductName());
        line.setSupplierId(row.getSupplierId());
        line.setSupplierName(row.getSupplierName());
        line.setSupplierSku(row.getSupplierSku());
        line.setChannel(row.getChannel());
        line.setLastWeekSales(row.getLastWeekSales());
        line.setCurrentStock(row.getCurrentStock());
        line.setIncomingStock(row.getIncomingStock());
        line.setExpectedDemand(row.getExpectedDemand());
        line.setSafetyStock(row.getSafetyStock());
        line.setOrderQty(row.getOrderQty());
        line.setCaseQty(row.getCaseQty());
        line.setCaseSize(row.getCaseSize());
        line.setUnitCost(row.getUnitCost());
        line.setLineCost(row.getLineCost());
        line.setSaving(row.getSaving());
        line.setConfidence(row.getConfidence() == null ? 0 : row.getConfidence());
        line.setConfidenceLabel(PurchaseOptimizer.confidenceLabel(line.getConfidence()));
        line.setUnusual(Boolean.TRUE.equals(row.getUnusual()));
        line.setReason(row.getReason());
        line.setDecision(row.getDecision());
        line.setComparisonJson(row.getComparisonJson());
        line.setStatus(row.getStatus());
        line.setOrderId(row.getOrderId());
        return line;
    }

    private void addSynthetic(Map<Long, SupplyChainRows.LinkRow> bySupplier, Long supplierId) {
        if (supplierId == null || bySupplier.containsKey(supplierId)) {
            return;
        }
        SupplyChainRows.LinkRow link = new SupplyChainRows.LinkRow();
        link.setSupplierId(supplierId);
        bySupplier.put(supplierId, link);
    }

    private SupplyChainRows.PrefRow preferred(List<PurchaseOptimizer.SupplierOption> options,
                                              Map<Long, SupplyChainRows.PrefRow> prefs) {
        SupplyChainRows.PrefRow best = null;
        int bestRank = Integer.MAX_VALUE;
        for (PurchaseOptimizer.SupplierOption option : options) {
            SupplyChainRows.PrefRow pref = prefs.get(option.supplierId());
            if (pref == null) {
                continue;
            }
            int rank = pref.getPriority() == null ? 100 : pref.getPriority();
            if (best == null || rank < bestRank) {
                best = pref;
                bestRank = rank;
            }
        }
        return best;
    }

    private Long lockedSupplier(SupplyChainRows.RuleRow rule) {
        if (rule == null || rule.getSupplierId() == null) {
            return null;
        }
        if (!"LOCKED".equalsIgnoreCase(rule.getSupplierMode())) {
            return null;
        }
        return rule.getSupplierId();
    }

    private boolean eligible(String raw, long productId) {
        Set<Long> ids = parseIds(raw);
        return ids.isEmpty() || ids.contains(productId);
    }

    private Set<Long> parseIds(String raw) {
        if (raw == null || raw.isBlank()) {
            return Set.of();
        }
        java.util.HashSet<Long> ids = new java.util.HashSet<>();
        for (String part : raw.split("[,\\s]+")) {
            if (part.isBlank()) {
                continue;
            }
            try {
                ids.add(Long.parseLong(part.trim()));
            } catch (NumberFormatException ignored) {
                // skip free text
            }
        }
        return ids;
    }

    private String invoiceNumber(LocalDate week, long supplierId) {
        String base = "SC" + week.format(WEEK) + "-" + supplierId;
        if (orderMapper.countByInvoiceNumber(base) == 0) {
            return base;
        }
        for (int n = 2; n < 50; n++) {
            String next = base + "-" + n;
            if (orderMapper.countByInvoiceNumber(next) == 0) {
                return next;
            }
        }
        return base + "-" + System.currentTimeMillis();
    }

    private BigDecimal perUnit(SupplyChainRows.LineRow line) {
        if (line.getLineCost() == null || line.getOrderQty() == null || line.getOrderQty().signum() <= 0) {
            return BigDecimal.ZERO;
        }
        return line.getLineCost().divide(line.getOrderQty(), 4, RoundingMode.HALF_UP);
    }

    private void requireSupplier(long outletId, Long supplierId) {
        if (supplierId == null || mapper.countSupplier(supplierId, outletId) == 0) {
            throw new BusinessException("Supplier not found.");
        }
    }

    private void requireProduct(long outletId, Long productId) {
        if (productId == null || mapper.countProduct(productId, outletId) == 0) {
            throw new BusinessException("Product not found.");
        }
    }

    private String normalizeChannel(String channel) {
        String value = channel == null ? "API" : channel.trim().toUpperCase();
        if (!Set.of("API", "EMAIL", "OTHER").contains(value)) {
            throw new BusinessException("Channel must be API, EMAIL, or OTHER.");
        }
        return value;
    }

    private long outletId() {
        Long id = CurrentUser.outletId();
        return id == null ? 1L : id;
    }

    private static LocalDate weekStart(LocalDate day) {
        return day.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }

    private static String clip(String value, int max) {
        if (value == null) {
            return null;
        }
        String trimmed = value.trim();
        return trimmed.length() <= max ? trimmed : trimmed.substring(0, max);
    }

    private static String blankToNull(String value) {
        if (value == null || value.isBlank()) {
            return null;
        }
        return value.trim();
    }

    private static String strip(BigDecimal value) {
        return nz(value).stripTrailingZeros().toPlainString();
    }

    private record Pending(SupplyChainRows.DemandRow product, BigDecimal sold,
                           PurchaseOptimizer.DemandResult demand, PurchaseOptimizer.Pick pick) {
    }

    private record BuiltLine(SupplyChainRows.LineRow row, String email) {
    }
}
