package com.orithos.modules.supplychain;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Set;

/**
 * Deterministic purchase math. Prices and deals are inputs; this class does not invent them.
 */
public final class PurchaseOptimizer {

    private static final BigDecimal HUNDRED = new BigDecimal("100");
    private static final BigDecimal SAFETY_RATIO = new BigDecimal("0.25");

    private PurchaseOptimizer() {
    }

    public record DemandResult(BigDecimal expectedDemand, BigDecimal safetyStock, BigDecimal rawQty) {
    }

    public record Normalized(int units, int cases, int caseSize) {
    }

    public record DealRule(
            String type,
            int buyCases,
            int freeCases,
            BigDecimal percent,
            BigDecimal amountOff,
            boolean requiresRep,
            boolean mixMatch,
            String label
    ) {
    }

    public record CostQuote(
            int paidCases,
            int receivedCases,
            BigDecimal total,
            BigDecimal effectivePerCase,
            String note,
            boolean requiresRep
    ) {
    }

    public record SupplierOption(
            long supplierId,
            String supplierName,
            String email,
            String sku,
            int caseSize,
            int orderUnits,
            int orderCases,
            BigDecimal casePrice,
            BigDecimal freightPerCase,
            String priceSource,
            CostQuote cost
    ) {
        public SupplierOption withCost(CostQuote next) {
            return new SupplierOption(supplierId, supplierName, email, sku, caseSize, orderUnits, orderCases,
                    casePrice, freightPerCase, priceSource, next);
        }
    }

    public record Pick(
            long productId,
            SupplierOption chosen,
            String decision,
            List<SupplierOption> options,
            int units,
            int cases,
            int caseSize,
            Long supplierId,
            String supplierName
    ) {
        public static Pick priced(long productId, SupplierOption chosen, String decision, List<SupplierOption> options) {
            return new Pick(productId, chosen, decision, options, chosen.orderUnits(), chosen.orderCases(),
                    chosen.caseSize(), chosen.supplierId(), chosen.supplierName());
        }

        public static Pick unpriced(long productId, int units, int cases, int caseSize,
                                    Long supplierId, String supplierName, String decision) {
            return new Pick(productId, null, decision, List.of(), units, cases, caseSize, supplierId, supplierName);
        }

        public SupplierOption optionFor(long supplierId) {
            for (SupplierOption option : options) {
                if (option.supplierId() == supplierId) {
                    return option;
                }
            }
            return null;
        }

        public Pick reassign(SupplierOption option, String decision) {
            return new Pick(productId, option, decision, options, option.orderUnits(), option.orderCases(),
                    option.caseSize(), option.supplierId(), option.supplierName());
        }
    }

    public record BasketDeal(
            long supplierId,
            BigDecimal percent,
            int buyCases,
            Set<Long> eligibleProductIds,
            String name,
            boolean requiresRep
    ) {
    }

    /** Required units before case-size and MOQ rounding. Null when stock already covers demand. */
    public static DemandResult demand(BigDecimal lastWeek, BigDecimal current, BigDecimal incoming,
                                      BigDecimal reorderLevel, BigDecimal adjustment) {
        BigDecimal sold = nz(lastWeek);
        BigDecimal stock = nz(current);
        BigDecimal onOrder = nz(incoming);
        BigDecimal lift = nz(adjustment);
        BigDecimal safety = nz(reorderLevel);
        if (safety.signum() <= 0 && sold.signum() > 0) {
            safety = sold.multiply(SAFETY_RATIO).setScale(0, RoundingMode.CEILING);
        }
        BigDecimal expected = sold.multiply(BigDecimal.ONE.add(lift)).setScale(0, RoundingMode.CEILING);
        BigDecimal raw = expected.add(safety).subtract(stock).subtract(onOrder);
        if (raw.signum() <= 0) {
            return null;
        }
        return new DemandResult(expected, safety, raw.setScale(0, RoundingMode.CEILING));
    }

    public static Normalized normalize(BigDecimal rawUnits, BigDecimal caseSize, Integer moq) {
        int pack = 1;
        if (caseSize != null && caseSize.signum() > 0) {
            pack = Math.max(1, caseSize.setScale(0, RoundingMode.CEILING).intValue());
        }
        int raw = nz(rawUnits).setScale(0, RoundingMode.CEILING).intValue();
        int units = ((Math.max(raw, 0) + pack - 1) / pack) * pack;
        int minimum = moq == null ? 0 : Math.max(moq, 0);
        if (minimum > units) {
            units = ((minimum + pack - 1) / pack) * pack;
        }
        if (units <= 0) {
            units = pack;
        }
        return new Normalized(units, units / pack, pack);
    }

    public static boolean unusual(BigDecimal lastWeek, int orderUnits) {
        if (lastWeek == null || lastWeek.signum() <= 0) {
            return false;
        }
        return BigDecimal.valueOf(orderUnits).compareTo(lastWeek.multiply(new BigDecimal("3"))) > 0;
    }

    public static int confidence(boolean hasSales, String priceSource, boolean unusualQty, int quoteCount) {
        int score = 48;
        if (hasSales) {
            score += 27;
        }
        if ("PRICE_FILE".equals(priceSource)) {
            score += 18;
        } else if ("LAST_COST".equals(priceSource)) {
            score += 8;
        }
        if (quoteCount >= 2) {
            score += 5;
        }
        if (unusualQty) {
            score -= 22;
        }
        return Math.max(35, Math.min(99, score));
    }

    public static String confidenceLabel(int score) {
        if (score >= 85) {
            return "High";
        }
        if (score >= 70) {
            return "Medium";
        }
        return "Low";
    }

    public static CostQuote bestCost(int needCases, BigDecimal casePrice, BigDecimal freight, List<DealRule> deals) {
        CostQuote best = cost(needCases, casePrice, freight, null);
        if (deals == null) {
            return best;
        }
        for (DealRule deal : deals) {
            if (deal == null || deal.mixMatch()) {
                continue;
            }
            CostQuote candidate = cost(needCases, casePrice, freight, deal);
            if (candidate.total().compareTo(best.total()) < 0) {
                best = candidate;
            }
        }
        return best;
    }

    public static CostQuote cost(int needCases, BigDecimal casePrice, BigDecimal freight, DealRule deal) {
        int paid = Math.max(needCases, 0);
        int received = paid;
        BigDecimal unit = nz(casePrice);
        String note = "List price";
        boolean applied = false;
        if (deal != null && paid > 0) {
            String type = deal.type() == null ? "" : deal.type();
            switch (type) {
                case "BUY_X_GET_Y" -> {
                    if (deal.buyCases() > 0 && deal.freeCases() > 0) {
                        int buy = deal.buyCases();
                        paid = 0;
                        int guard = 0;
                        int limit = needCases + buy + 2;
                        while (paid + (paid / buy) * deal.freeCases() < needCases && guard++ < limit) {
                            paid++;
                        }
                        received = paid + (paid / buy) * deal.freeCases();
                        if (received > paid) {
                            note = "Buy " + buy + " get " + deal.freeCases() + " free";
                            applied = true;
                        } else {
                            paid = needCases;
                            received = needCases;
                        }
                    }
                }
                case "PERCENT" -> {
                    BigDecimal pct = fraction(deal.percent());
                    if (pct.signum() > 0 && (deal.buyCases() <= 0 || needCases >= deal.buyCases())) {
                        unit = nz(casePrice).multiply(BigDecimal.ONE.subtract(pct));
                        note = deal.label() == null || deal.label().isBlank() ? "Percent off" : deal.label();
                        applied = true;
                    }
                }
                case "AMOUNT_OFF" -> {
                    if (deal.amountOff() != null && deal.amountOff().signum() > 0
                            && (deal.buyCases() <= 0 || needCases >= deal.buyCases())) {
                        unit = nz(casePrice).subtract(deal.amountOff()).max(BigDecimal.ZERO);
                        note = deal.label() == null || deal.label().isBlank() ? "Amount off" : deal.label();
                        applied = true;
                    }
                }
                default -> {
                }
            }
        }
        BigDecimal freightEach = nz(freight);
        if (freightEach.signum() > 0) {
            note = note + " + freight";
        }
        BigDecimal total = unit.multiply(BigDecimal.valueOf(paid))
                .add(freightEach.multiply(BigDecimal.valueOf(paid)))
                .setScale(2, RoundingMode.HALF_UP);
        int denom = Math.max(received, 1);
        BigDecimal effective = total.divide(BigDecimal.valueOf(denom), 4, RoundingMode.HALF_UP);
        return new CostQuote(paid, received, total, effective, note, applied && deal != null && deal.requiresRep());
    }

    public static Pick choose(long productId, List<SupplierOption> options, Long lockedSupplierId,
                              Long preferredSupplierId, BigDecimal switchThresholdPerCase) {
        if (options == null || options.isEmpty()) {
            throw new IllegalArgumentException("At least one supplier quote is required");
        }
        if (lockedSupplierId != null) {
            SupplierOption locked = find(options, lockedSupplierId);
            if (locked == null) {
                throw new IllegalArgumentException("Locked supplier has no quote");
            }
            return Pick.priced(productId, locked, "Locked supplier — other suppliers were not compared", options);
        }
        SupplierOption best = cheapest(options);
        SupplierOption preferred = preferredSupplierId == null ? null : find(options, preferredSupplierId);
        if (preferred == null) {
            return Pick.priced(productId, best, "Lowest effective cost", options);
        }
        if (preferred.supplierId() == best.supplierId()) {
            return Pick.priced(productId, preferred, "Preferred supplier has the lowest effective cost", options);
        }
        BigDecimal gap = preferred.cost().effectivePerCase().subtract(best.cost().effectivePerCase());
        boolean switchAway = switchThresholdPerCase != null
                && gap.signum() > 0
                && gap.compareTo(switchThresholdPerCase) >= 0;
        if (switchAway) {
            return Pick.priced(productId, best,
                    "Switch supplier. Saving $" + gap.setScale(2, RoundingMode.HALF_UP).toPlainString() + " / case",
                    options);
        }
        String decision = switchThresholdPerCase == null
                ? "Preferred supplier"
                : "Kept preferred supplier. Price gap is inside the threshold";
        return Pick.priced(productId, preferred, decision, options);
    }

    /** Moves eligible SKUs onto a supplier when a mix-and-match discount lowers the basket total. */
    public static List<Pick> applyBaskets(List<Pick> picks, List<BasketDeal> deals) {
        List<Pick> current = new ArrayList<>(picks == null ? List.of() : picks);
        if (deals == null) {
            return current;
        }
        for (BasketDeal deal : deals) {
            BigDecimal pct = fraction(deal.percent());
            if (pct.signum() <= 0 || deal.buyCases() <= 0) {
                continue;
            }
            List<Integer> indexes = new ArrayList<>();
            int cases = 0;
            for (int i = 0; i < current.size(); i++) {
                Pick pick = current.get(i);
                if (pick.chosen() == null) {
                    continue;
                }
                Set<Long> eligible = deal.eligibleProductIds();
                if (eligible != null && !eligible.isEmpty() && !eligible.contains(pick.productId())) {
                    continue;
                }
                if (pick.optionFor(deal.supplierId()) == null) {
                    continue;
                }
                indexes.add(i);
                cases += pick.optionFor(deal.supplierId()).orderCases();
            }
            if (indexes.isEmpty() || cases < deal.buyCases()) {
                continue;
            }
            BigDecimal oldTotal = BigDecimal.ZERO;
            BigDecimal newTotal = BigDecimal.ZERO;
            List<CostQuote> repriced = new ArrayList<>();
            for (int index : indexes) {
                Pick pick = current.get(index);
                oldTotal = oldTotal.add(pick.chosen().cost().total());
                SupplierOption option = pick.optionFor(deal.supplierId());
                CostQuote quote = percentBasket(option, pct, deal.name(), deal.requiresRep());
                repriced.add(quote);
                newTotal = newTotal.add(quote.total());
            }
            if (newTotal.compareTo(oldTotal) < 0) {
                for (int n = 0; n < indexes.size(); n++) {
                    int index = indexes.get(n);
                    Pick pick = current.get(index);
                    SupplierOption option = pick.optionFor(deal.supplierId()).withCost(repriced.get(n));
                    String name = deal.name() == null || deal.name().isBlank() ? "basket deal" : deal.name();
                    current.set(index, pick.reassign(option, "Mix & match: " + name));
                }
            }
        }
        return current;
    }

    private static CostQuote percentBasket(SupplierOption option, BigDecimal pct, String name, boolean requiresRep) {
        BigDecimal unit = nz(option.casePrice()).multiply(BigDecimal.ONE.subtract(pct));
        int paid = option.orderCases();
        BigDecimal freight = nz(option.freightPerCase());
        BigDecimal total = unit.multiply(BigDecimal.valueOf(paid))
                .add(freight.multiply(BigDecimal.valueOf(paid)))
                .setScale(2, RoundingMode.HALF_UP);
        BigDecimal effective = paid == 0
                ? unit.setScale(4, RoundingMode.HALF_UP)
                : total.divide(BigDecimal.valueOf(paid), 4, RoundingMode.HALF_UP);
        String note = name == null || name.isBlank() ? "Mix & match" : name;
        return new CostQuote(paid, paid, total, effective, note, requiresRep);
    }

    private static SupplierOption cheapest(List<SupplierOption> options) {
        return options.stream()
                .min(Comparator.comparing(option -> option.cost().total()))
                .orElseThrow();
    }

    private static SupplierOption find(List<SupplierOption> options, long supplierId) {
        for (SupplierOption option : options) {
            if (option.supplierId() == supplierId) {
                return option;
            }
        }
        return null;
    }

    private static BigDecimal fraction(BigDecimal percent) {
        BigDecimal value = nz(percent);
        if (value.compareTo(BigDecimal.ONE) > 0) {
            value = value.divide(HUNDRED, 6, RoundingMode.HALF_UP);
        }
        if (value.signum() < 0) {
            return BigDecimal.ZERO;
        }
        if (value.compareTo(BigDecimal.ONE) > 0) {
            return BigDecimal.ONE;
        }
        return value;
    }

    private static BigDecimal nz(BigDecimal value) {
        return value == null ? BigDecimal.ZERO : value;
    }
}
