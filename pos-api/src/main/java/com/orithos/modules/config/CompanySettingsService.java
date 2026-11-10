package com.orithos.modules.config;

import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

@Service
public class CompanySettingsService {

    private final SettingMapper mapper;

    public CompanySettingsService(SettingMapper mapper) {
        this.mapper = mapper;
    }

    public Map<String, SettingView> companyBundle() {
        Map<String, String> defaults = CompanySettingsKeys.defaults();
        List<Setting> rows = mapper.findAll("vendor", null);
        Map<String, Setting> byName = new LinkedHashMap<>();
        for (Setting row : rows) {
            if (row.getName() != null) {
                byName.put(row.getName(), row);
            }
        }
        Map<String, SettingView> out = new LinkedHashMap<>();
        for (Map.Entry<String, String> entry : defaults.entrySet()) {
            String name = entry.getKey();
            Setting existing = byName.get(name);
            boolean owned = isOwned(byName, name);
            String value = existing != null && existing.getValue() != null ? existing.getValue() : entry.getValue();
            String datatype = existing != null && existing.getDatatype() != null
                    ? existing.getDatatype()
                    : inferDatatype(value);
            out.put(name, new SettingView(name, value, datatype, owned, existing != null));
        }
        // Include any extra company.* / enterprise.* / push.* rows not in defaults.
        for (Setting row : rows) {
            String name = row.getName();
            if (name == null || out.containsKey(name)) continue;
            if (!(name.startsWith("company.") || name.startsWith("enterprise.") || name.startsWith("push."))) {
                continue;
            }
            if (name.startsWith(CompanySettingsKeys.OWNED_PREFIX)) continue;
            out.put(name, new SettingView(name, row.getValue(), row.getDatatype(), isOwned(byName, name), true));
        }
        return out;
    }

    public SettingView putOwned(String name, String value, String datatype) {
        if (name == null || name.isBlank()) {
            throw new IllegalArgumentException("setting name is required");
        }
        Setting s = new Setting();
        s.setScopeType("vendor");
        s.setScopeId(null);
        s.setName(name.trim());
        s.setValue(value);
        s.setDatatype(datatype == null || datatype.isBlank() ? inferDatatype(value) : datatype);
        mapper.upsert(s);
        Setting owned = new Setting();
        owned.setScopeType("vendor");
        owned.setScopeId(null);
        owned.setName(CompanySettingsKeys.ownedKey(name.trim()));
        owned.setValue("orithos");
        owned.setDatatype("string");
        mapper.upsert(owned);
        return new SettingView(name.trim(), value, s.getDatatype(), true, true);
    }

    public void putManyOwned(Map<String, String> values) {
        if (values == null) return;
        for (Map.Entry<String, String> entry : values.entrySet()) {
            putOwned(entry.getKey(), entry.getValue(), null);
        }
    }

    /**
     * Import path: write only when missing or not Orithos-owned.
     * Returns whether the value was written.
     */
    public boolean importIfEmpty(String name, String value, String datatype) {
        List<Setting> rows = mapper.findAll("vendor", null);
        Map<String, Setting> byName = new LinkedHashMap<>();
        for (Setting row : rows) {
            if (row.getName() != null) byName.put(row.getName(), row);
        }
        if (isOwned(byName, name)) {
            return false;
        }
        Setting existing = byName.get(name);
        if (existing != null && existing.getValue() != null && !existing.getValue().isBlank()) {
            return false;
        }
        Setting s = new Setting();
        s.setScopeType("vendor");
        s.setScopeId(null);
        s.setName(name);
        s.setValue(value);
        s.setDatatype(datatype == null || datatype.isBlank() ? inferDatatype(value) : datatype);
        mapper.upsert(s);
        return true;
    }

    public String getString(String name, String fallback) {
        Setting row = mapper.findByName("vendor", null, name);
        if (row == null || row.getValue() == null || row.getValue().isBlank()) {
            return CompanySettingsKeys.defaults().getOrDefault(name, fallback);
        }
        return row.getValue();
    }

    public BigDecimal cashRoundTo() {
        String raw = getString(CompanySettingsKeys.ROUND_TO, "0.05");
        try {
            BigDecimal value = new BigDecimal(raw.trim());
            if (value.signum() <= 0) return new BigDecimal("0.05");
            return value;
        } catch (NumberFormatException ex) {
            return new BigDecimal("0.05");
        }
    }

    public boolean getBoolean(String name, boolean fallback) {
        String raw = getString(name, String.valueOf(fallback));
        return "true".equalsIgnoreCase(raw) || "1".equals(raw) || "yes".equalsIgnoreCase(raw);
    }

    private static boolean isOwned(Map<String, Setting> byName, String name) {
        Setting marker = byName.get(CompanySettingsKeys.ownedKey(name));
        return marker != null && marker.getValue() != null && !marker.getValue().isBlank();
    }

    private static String inferDatatype(String value) {
        if (value == null) return "string";
        String trimmed = value.trim();
        if ("true".equalsIgnoreCase(trimmed) || "false".equalsIgnoreCase(trimmed)) return "boolean";
        if (trimmed.startsWith("[") || trimmed.startsWith("{")) return "json";
        try {
            new BigDecimal(trimmed);
            return "number";
        } catch (NumberFormatException ignored) {
            return "string";
        }
    }

    public record SettingView(String name, String value, String datatype, boolean orithosOwned, boolean persisted) {}
}
