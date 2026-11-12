package com.orithos.modules.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.payment.PaymentMethod;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.register.Register;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.tax.TaxRate;
import com.orithos.modules.tax.TaxRateMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * One-shot Shopfront catalogue promote scoped to the mapped Orithos outlet.
 * Global vendor settings are not imported because the Shopfront source key is not their scope.
 */
@Service
public class SettingsImportService {

    private static final Logger log = LoggerFactory.getLogger(SettingsImportService.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final TaxRateMapper taxRates;
    private final PaymentMethodMapper paymentMethods;
    private final RegisterMapper registers;

    public SettingsImportService(JdbcTemplate jdbc,
                                 ObjectMapper objectMapper,
                                 TaxRateMapper taxRates,
                                 PaymentMethodMapper paymentMethods,
                                 RegisterMapper registers) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.taxRates = taxRates;
        this.paymentMethods = paymentMethods;
        this.registers = registers;
    }

    @Transactional
    public Map<String, Object> promote(String storeKey, long outletId, boolean forceEmptyOnly, JsonNode catalogues) {
        if (storeKey == null || storeKey.isBlank() || outletId <= 0) {
            throw new IllegalArgumentException("An enabled Shopfront mapping with a native outlet is required");
        }
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("company_settings", 0);
        TaxRatePromotionResult taxRateResult = promoteTaxRates(outletId, catalogues.path("tax_rates"));
        counts.put("tax_rates", taxRateResult.written());
        counts.put("tax_rates_skipped_missing_amount", taxRateResult.skippedMissingAmount());
        counts.put("payment_methods", promotePaymentMethods(outletId, catalogues.path("payment_methods")));
        counts.put("outlets", 0);
        counts.put("registers", promoteRegisters(outletId, catalogues.path("registers")));
        counts.put("enterprise", 0);
        counts.put("push", 0);
        counts.put("dedupe", dedupeCatalogues(outletId));
        log.info("Settings import promote complete store={} counts={}", storeKey, counts);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("store_key", storeKey);
        result.put("outlet_id", outletId);
        result.put("business_write", true);
        result.put("global_settings_imported", false);
        result.put("force_empty_only", forceEmptyOnly);
        result.put("counts", counts);
        return result;
    }

    @Transactional
    public Map<String, Object> dedupeCatalogues(long outletId) {
        if (outletId <= 0) throw new IllegalArgumentException("outlet_id must be positive");
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tax_rates_removed", dedupeTaxRates(outletId));
        result.put("payment_methods_removed", dedupePaymentMethods(outletId));
        return result;
    }

    private int dedupeTaxRates(long outletId) {
        Map<String, Long> keepers = new LinkedHashMap<>();
        int removed = 0;
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT id, name FROM tax_rate WHERE outlet_id = ? AND deleted_at IS NULL ORDER BY id", new Object[]{outletId})) {
            Long id = longValue(row.get("id"));
            String name = String.valueOf(row.getOrDefault("name", "")).trim();
            if (id == null || name.isBlank()) continue;
            Long keeper = keepers.putIfAbsent(normalizeName(name), id);
            if (keeper == null) continue;
            jdbc.update("UPDATE product SET tax_rate_id = ? WHERE outlet_id = ? AND tax_rate_id = ?", keeper, outletId, id);
            jdbc.update("UPDATE product SET cost_tax_rate_id = ? WHERE outlet_id = ? AND cost_tax_rate_id = ?", keeper, outletId, id);
            jdbc.update("UPDATE vendor SET default_tax_rate_id = ? WHERE outlet_id = ? AND default_tax_rate_id = ?", keeper, outletId, id);
            jdbc.update("UPDATE sale_item SET tax_rate_id = ? WHERE outlet_id = ? AND tax_rate_id = ?", keeper, outletId, id);
            jdbc.update("UPDATE tax_rate SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND outlet_id = ?", id, outletId);
            removed++;
        }
        return removed;
    }

    private int dedupePaymentMethods(long outletId) {
        Map<String, Long> keepers = new LinkedHashMap<>();
        int removed = 0;
        for (Map<String, Object> row : jdbc.queryForList(
                "SELECT id, name FROM payment_method WHERE outlet_id = ? AND deleted_at IS NULL ORDER BY id", new Object[]{outletId})) {
            Long id = longValue(row.get("id"));
            String name = String.valueOf(row.getOrDefault("name", "")).trim();
            if (id == null || name.isBlank()) continue;
            Long keeper = keepers.putIfAbsent(normalizeName(name), id);
            if (keeper == null) continue;
            jdbc.update("UPDATE sale_payment SET payment_method_id = ? WHERE outlet_id = ? AND payment_method_id = ?", keeper, outletId, id);
            jdbc.update("UPDATE customer_payment SET payment_method_id = ? WHERE outlet_id = ? AND payment_method_id = ?", keeper, outletId, id);
            jdbc.update("UPDATE register_closure_payment SET payment_method_id = ? WHERE outlet_id = ? AND payment_method_id = ?", keeper, outletId, id);
            jdbc.update("DELETE FROM register_payment_method source WHERE source.payment_method_id = ? AND source.outlet_id = ? AND EXISTS ("
                    + "SELECT 1 FROM register_payment_method target WHERE target.register_id = source.register_id "
                    + "AND target.outlet_id = source.outlet_id AND target.payment_method_id = ?)", id, outletId, keeper);
            jdbc.update("UPDATE register_payment_method SET payment_method_id = ? WHERE payment_method_id = ? AND outlet_id = ?", keeper, id, outletId);
            jdbc.update("UPDATE payment_method SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND outlet_id = ?", id, outletId);
            removed++;
        }
        return removed;
    }

    private TaxRatePromotionResult promoteTaxRates(long outletId, JsonNode records) {
        int written = 0;
        int skippedMissingAmount = 0;
        Set<String> seen = new HashSet<>();
        for (String name : jdbc.queryForList(
                "SELECT name FROM tax_rate WHERE deleted_at IS NULL AND outlet_id = ?", String.class, outletId))
            if (name != null) seen.add(normalizeName(name));
        for (JsonNode raw : records) {
            if (raw == null) continue;
            String name = text(raw, "name");
            if (name == null || name.isBlank()) continue;
            BigDecimal amount = decimal(raw, "amount", null);
            if (amount == null) amount = decimal(raw, "rate", null);
            if (amount == null) {
                skippedMissingAmount++;
                continue;
            }
            String key = normalizeName(name);
            if (!seen.add(key)) continue;
            TaxRate t = new TaxRate();
            t.setName(name);
            t.setAmount(amount);
            boolean hasDefault = Boolean.TRUE.equals(jdbc.queryForObject(
                    "SELECT EXISTS (SELECT 1 FROM tax_rate WHERE outlet_id = ? AND deleted_at IS NULL AND is_default = TRUE)",
                    Boolean.class, outletId));
            t.setIsDefault(!hasDefault && (bool(raw, "isDefault") || bool(raw, "default")));
            t.setOutletId(outletId);
            taxRates.insert(t);
            written++;
        }
        return new TaxRatePromotionResult(written, skippedMissingAmount);
    }

    private record TaxRatePromotionResult(int written, int skippedMissingAmount) {}

    private int promotePaymentMethods(long outletId, JsonNode records) {
        int written = 0;
        Set<String> seen = new HashSet<>();
        for (String name : jdbc.queryForList(
                "SELECT name FROM payment_method WHERE deleted_at IS NULL AND outlet_id = ?", String.class, outletId))
            if (name != null) seen.add(normalizeName(name));
        for (JsonNode raw : records) {
            if (raw == null) continue;
            String name = text(raw, "name");
            if (name == null || name.isBlank()) continue;
            String key = normalizeName(name);
            if (!seen.add(key)) continue;
            PaymentMethod p = new PaymentMethod();
            p.setName(name);
            p.setType(text(raw, "type") != null ? text(raw, "type") : "OTHER");
            p.setSurcharge(decimal(raw, "surcharge", BigDecimal.ZERO));
            p.setAlwaysOpenDrawer(bool(raw, "alwaysOpenDrawer"));
            p.setAlwaysPrint(bool(raw, "alwaysPrint"));
            p.setUseRounding(bool(raw, "useRounding"));
            p.setDefaultPayExact(bool(raw, "defaultPayExact"));
            p.setOutletId(outletId);
            paymentMethods.insert(p);
            written++;
        }
        return written;
    }

    private int promoteRegisters(long outletId, JsonNode records) {
        int written = 0;
        Set<String> seen = new HashSet<>();
        List<Register> existing = registers.findByOutletId(outletId);
        for (Register r : existing) {
            if (r.getName() != null) seen.add(normalizeName(r.getName()));
        }
        for (JsonNode raw : records) {
            if (raw == null) continue;
            String name = text(raw, "name");
            if (name == null || name.isBlank()) continue;
            if (!seen.add(normalizeName(name))) continue;
            Register r = new Register();
            r.setName(name);
            r.setOutletId(outletId);
            r.setClosed(false);
            registers.insert(r);
            written++;
        }
        return written;
    }

    private static String normalizeName(String name) {
        return name.trim().toLowerCase(Locale.ROOT);
    }

    private static Long longValue(Object value) {
        if (value instanceof Number number) return number.longValue();
        try { return value == null ? null : Long.parseLong(String.valueOf(value)); }
        catch (NumberFormatException ignored) { return null; }
    }

    private static String text(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) return null;
        String value = node.get(field).asText(null);
        return value == null || value.isBlank() ? null : value.trim();
    }

    private static boolean bool(JsonNode node, String field) {
        if (node == null || !node.has(field) || node.get(field).isNull()) return false;
        JsonNode v = node.get(field);
        if (v.isBoolean()) return v.asBoolean();
        return "true".equalsIgnoreCase(v.asText()) || "1".equals(v.asText());
    }

    private static BigDecimal decimal(JsonNode node, String field, BigDecimal fallback) {
        if (node == null || !node.has(field) || node.get(field).isNull()) return fallback;
        try {
            return node.get(field).decimalValue();
        } catch (Exception ex) {
            try {
                return new BigDecimal(node.get(field).asText());
            } catch (Exception ignored) {
                return fallback;
            }
        }
    }
}
