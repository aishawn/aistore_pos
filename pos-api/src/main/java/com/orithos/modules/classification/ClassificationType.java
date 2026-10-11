package com.orithos.modules.classification;

import com.orithos.common.BusinessException;

/** Whitelists the table names so the dynamic ${table} mapper SQL stays injection-safe. */
public enum ClassificationType {
    BRAND("brand"),
    CATEGORY("category"),
    FAMILY("family"),
    TAG("tag");

    private final String table;

    ClassificationType(String table) {
        this.table = table;
    }

    public String table() {
        return table;
    }

    public static ClassificationType from(String value) {
        for (ClassificationType t : values()) {
            if (t.name().equalsIgnoreCase(value) || t.table.equalsIgnoreCase(value)) return t;
        }
        throw new BusinessException(40002, "Unknown classification type: " + value);
    }
}
