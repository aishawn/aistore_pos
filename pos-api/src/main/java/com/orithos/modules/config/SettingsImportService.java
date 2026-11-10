package com.orithos.modules.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.payment.PaymentMethod;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.register.Outlet;
import com.orithos.modules.register.OutletMapper;
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
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/**
 * One-shot / on-demand Shopfront → Orithos settings promote.
 * Never overwrites Orithos-owned company keys or existing catalog rows matched by source id/name.
 */
@Service
public class SettingsImportService {

    private static final Logger log = LoggerFactory.getLogger(SettingsImportService.class);

    private final JdbcTemplate jdbc;
    private final ObjectMapper objectMapper;
    private final CompanySettingsService companySettings;
    private final TaxRateMapper taxRates;
    private final PaymentMethodMapper paymentMethods;
    private final OutletMapper outlets;
    private final RegisterMapper registers;

    public SettingsImportService(JdbcTemplate jdbc,
                                 ObjectMapper objectMapper,
                                 CompanySettingsService companySettings,
                                 TaxRateMapper taxRates,
                                 PaymentMethodMapper paymentMethods,
                                 OutletMapper outlets,
                                 RegisterMapper registers) {
        this.jdbc = jdbc;
        this.objectMapper = objectMapper;
        this.companySettings = companySettings;
        this.taxRates = taxRates;
        this.paymentMethods = paymentMethods;
        this.outlets = outlets;
        this.registers = registers;
    }

    @Transactional
    public Map<String, Object> promote(String storeKey, boolean forceEmptyOnly) {
        ensureStaging();
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("company_settings", promoteCompanySettings(storeKey));
        counts.put("tax_rates", promoteTaxRates(storeKey));
        counts.put("payment_methods", promotePaymentMethods(storeKey));
        counts.put("outlets", promoteOutlets(storeKey));
        counts.put("registers", promoteRegisters(storeKey));
        counts.put("enterprise", promoteJsonSetting(storeKey, "enterprise_policies", "enterprise."));
        counts.put("push", promoteJsonSetting(storeKey, "push_notifications", "push."));
        counts.put("dedupe", dedupeCatalogues());
        companySettings.putOwned("settings.import.last_store_key", storeKey, "string");
        companySettings.putOwned("settings.import.last_at", java.time.Instant.now().toString(), "string");
        companySettings.putOwned("settings.import.force_empty_only", String.valueOf(forceEmptyOnly), "boolean");
        log.info("Settings import promote complete store={} counts={}", storeKey, counts);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("store_key", storeKey);
        result.put("business_write", true);
        result.put("overwrite_owned", false);
        result.put("counts", counts);
        return result;
    }

    /**
     * Merge duplicate active tax rates / payment methods by case-insensitive name.
     * Keeps the lowest id, reassigns FK references, then soft-deletes extras.
     */
    @Transactional
    public Map<String, Object> dedupeCatalogues() {
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("tax_rates_removed", dedupeTaxRates());
        result.put("payment_methods_removed", dedupePaymentMethods());
        return result;
    }

    private int promoteCompanySettings(String storeKey) {
        List<Map<String, Object>> rows = loadExtended(storeKey, "company_settings");
        int written = 0;
        for (Map<String, Object> row : rows) {
            JsonNode raw = parseRaw(row.get("raw_payload"));
            if (raw == null) continue;
            if (raw.isObject() && raw.has("settings") && raw.get("settings").isObject()) {
                raw = raw.get("settings");
            }
            if (!raw.isObject()) continue;
            var fields = raw.fields();
            while (fields.hasNext()) {
                var entry = fields.next();
                String key = entry.getKey();
                if (key == null || key.isBlank()) continue;
                String name = key.startsWith("company.") ? key : "company." + key;
                String value = entry.getValue().isValueNode() ? entry.getValue().asText() : entry.getValue().toString();
                if (companySettings.importIfEmpty(name, value, null)) {
                    written++;
                }
            }
        }
        for (Map<String, Object> row : loadExtended(storeKey, "settings")) {
            JsonNode raw = parseRaw(row.get("raw_payload"));
            if (raw == null || !raw.isObject()) continue;
            String name = text(raw, "name");
            String value = text(raw, "value");
            if (name == null || value == null) continue;
            if (!name.startsWith("company.") && !name.startsWith("enterprise.") && !name.startsWith("push.")) {
                name = "company." + name;
            }
            if (companySettings.importIfEmpty(name, value, text(raw, "datatype"))) {
                written++;
            }
        }
        return written;
    }

    private int promoteTaxRates(String storeKey) {
        int written = 0;
        Set<String> seen = new HashSet<>();
        for (TaxRate existing : taxRates.findAllActiveAsc()) {
            if (existing.getName() != null) {
                seen.add(normalizeName(existing.getName()));
            }
        }
        for (Map<String, Object> row : loadExtended(storeKey, "tax_rates")) {
            JsonNode raw = parseRaw(row.get("raw_payload"));
            if (raw == null) continue;
            String name = text(raw, "name");
            if (name == null || name.isBlank()) continue;
            String key = normalizeName(name);
            if (!seen.add(key)) continue;
            if (taxRates.findByNameIgnoreCase(name) != null) continue;
            TaxRate t = new TaxRate();
            t.setName(name);
            t.setAmount(decimal(raw, "amount", raw.has("rate") ? raw.get("rate").decimalValue() : BigDecimal.TEN));
            t.setIsDefault(bool(raw, "isDefault") || bool(raw, "default"));
            t.setOutletId(1L);
            taxRates.insert(t);
            written++;
        }
        return written;
    }

    private int promotePaymentMethods(String storeKey) {
        int written = 0;
        Set<String> seen = new HashSet<>();
        for (PaymentMethod existing : paymentMethods.findAllActiveAsc()) {
            if (existing.getName() != null) {
                seen.add(normalizeName(existing.getName()));
            }
        }
        for (Map<String, Object> row : loadExtended(storeKey, "payment_methods")) {
            JsonNode raw = parseRaw(row.get("raw_payload"));
            if (raw == null) continue;
            String name = text(raw, "name");
            if (name == null || name.isBlank()) continue;
            String key = normalizeName(name);
            if (!seen.add(key)) continue;
            if (paymentMethods.findByName(name) != null) continue;
            PaymentMethod p = new PaymentMethod();
            p.setName(name);
            p.setType(text(raw, "type") != null ? text(raw, "type") : "OTHER");
            p.setSurcharge(decimal(raw, "surcharge", BigDecimal.ZERO));
            p.setAlwaysOpenDrawer(bool(raw, "alwaysOpenDrawer"));
            p.setAlwaysPrint(bool(raw, "alwaysPrint"));
            p.setUseRounding(bool(raw, "useRounding"));
            p.setDefaultPayExact(bool(raw, "defaultPayExact"));
            p.setOutletId(1L);
            paymentMethods.insert(p);
            written++;
        }
        return written;
    }

    private int promoteOutlets(String storeKey) {
        int written = 0;
        Set<String> seen = new HashSet<>();
        List<Outlet> existing = outlets.findAll();
        for (Outlet o : existing) {
            if (o.getName() != null) seen.add(normalizeName(o.getName()));
        }
        for (Map<String, Object> row : loadExtended(storeKey, "outlets")) {
            JsonNode raw = parseRaw(row.get("raw_payload"));
            if (raw == null) continue;
            String name = text(raw, "name");
            if (name == null || name.isBlank()) continue;
            if (!seen.add(normalizeName(name))) continue;
            Outlet o = new Outlet();
            o.setName(name);
            o.setVendorId(1L);
            outlets.insert(o);
            written++;
        }
        return written;
    }

    private int promoteRegisters(String storeKey) {
        int written = 0;
        Set<String> seen = new HashSet<>();
        List<Register> existing = registers.findAll();
        for (Register r : existing) {
            if (r.getName() != null) seen.add(normalizeName(r.getName()));
        }
        List<Outlet> outletList = outlets.findAll();
        Long defaultOutletId = outletList.isEmpty() ? 1L : outletList.get(0).getId();
        for (Map<String, Object> row : loadExtended(storeKey, "registers")) {
            JsonNode raw = parseRaw(row.get("raw_payload"));
            if (raw == null) continue;
            String name = text(raw, "name");
            if (name == null || name.isBlank()) continue;
            if (!seen.add(normalizeName(name))) continue;
            Register r = new Register();
            r.setName(name);
            r.setOutletId(defaultOutletId);
            r.setClosed(false);
            registers.insert(r);
            written++;
        }
        return written;
    }

    private int promoteJsonSetting(String storeKey, String entityType, String keyPrefix) {
        int written = 0;
        for (Map<String, Object> row : loadExtended(storeKey, entityType)) {
            JsonNode raw = parseRaw(row.get("raw_payload"));
            if (raw == null || !raw.isObject()) continue;
            var fields = raw.fields();
            while (fields.hasNext()) {
                var entry = fields.next();
                String key = entry.getKey();
                if (key == null || key.isBlank()) continue;
                String name = key.startsWith(keyPrefix) ? key : keyPrefix + key;
                String value = entry.getValue().isValueNode() ? entry.getValue().asText() : entry.getValue().toString();
                if (companySettings.importIfEmpty(name, value, null)) {
                    written++;
                }
            }
        }
        return written;
    }

    private int dedupeTaxRates() {
        Map<String, List<TaxRate>> groups = new LinkedHashMap<>();
        for (TaxRate rate : taxRates.findAllActiveAsc()) {
            if (rate.getName() == null || rate.getName().isBlank()) continue;
            groups.computeIfAbsent(normalizeName(rate.getName()), ignored -> new ArrayList<>()).add(rate);
        }
        int removed = 0;
        for (List<TaxRate> group : groups.values()) {
            if (group.size() < 2) continue;
            Long keeper = group.get(0).getId();
            for (int i = 1; i < group.size(); i++) {
                Long source = group.get(i).getId();
                if (source == null || source.equals(keeper)) continue;
                taxRates.reassignProductTaxRate(keeper, source);
                taxRates.reassignProductCostTaxRate(keeper, source);
                taxRates.reassignVendorDefaultTaxRate(keeper, source);
                taxRates.reassignSaleItemTaxRate(keeper, source);
                taxRates.softDelete(source);
                removed++;
            }
        }
        return removed;
    }

    private int dedupePaymentMethods() {
        Map<String, List<PaymentMethod>> groups = new LinkedHashMap<>();
        for (PaymentMethod method : paymentMethods.findAllActiveAsc()) {
            if (method.getName() == null || method.getName().isBlank()) continue;
            groups.computeIfAbsent(normalizeName(method.getName()), ignored -> new ArrayList<>()).add(method);
        }
        int removed = 0;
        for (List<PaymentMethod> group : groups.values()) {
            if (group.size() < 2) continue;
            Long keeper = group.get(0).getId();
            for (int i = 1; i < group.size(); i++) {
                Long source = group.get(i).getId();
                if (source == null || source.equals(keeper)) continue;
                paymentMethods.reassignSalePayment(keeper, source);
                paymentMethods.reassignCustomerPayment(keeper, source);
                paymentMethods.reassignRegisterClosurePayment(keeper, source);
                paymentMethods.dropConflictingRegisterAssignments(keeper, source);
                paymentMethods.reassignRegisterPaymentMethod(keeper, source);
                paymentMethods.softDelete(source);
                removed++;
            }
        }
        return removed;
    }

    private List<Map<String, Object>> loadExtended(String storeKey, String entityType) {
        try {
            return jdbc.queryForList(
                    "SELECT source_id, raw_payload FROM shopfront_extended_record WHERE store_key=? AND entity_type=? ORDER BY source_id",
                    storeKey, entityType);
        } catch (Exception ex) {
            return List.of();
        }
    }

    private void ensureStaging() {
        jdbc.execute("CREATE TABLE IF NOT EXISTS shopfront_extended_record ("
                + "id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,"
                + "store_key VARCHAR(64) NOT NULL,"
                + "entity_type VARCHAR(64) NOT NULL,"
                + "source_id VARCHAR(192) NOT NULL,"
                + "raw_payload TEXT NOT NULL,"
                + "synced_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,"
                + "UNIQUE (store_key, entity_type, source_id))");
    }

    private JsonNode parseRaw(Object raw) {
        if (raw == null) return null;
        try {
            if (raw instanceof JsonNode node) return node;
            return objectMapper.readTree(String.valueOf(raw));
        } catch (Exception ex) {
            return null;
        }
    }

    private static String normalizeName(String name) {
        return name.trim().toLowerCase(Locale.ROOT);
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
