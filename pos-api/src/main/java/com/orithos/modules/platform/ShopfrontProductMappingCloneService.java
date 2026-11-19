package com.orithos.modules.platform;

import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Clone {@code shopfront_product_mapping} rows from one store_key to another by barcode alignment.
 */
@Service
public class ShopfrontProductMappingCloneService {

    private static final Pattern STORE_KEY = Pattern.compile("[a-z][a-z0-9_-]{0,63}");

    private final JdbcTemplate jdbc;

    public ShopfrontProductMappingCloneService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Map<String, Object> clone(String source, String target, String phase, int limit) {
        if (!STORE_KEY.matcher(source).matches() || !STORE_KEY.matcher(target).matches() || source.equals(target)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "Distinct valid source_store_key and target_store_key are required");
        }
        String normalizedPhase = phase == null ? "target_barcodes" : phase.trim().toLowerCase(Locale.ROOT);
        if (!Set.of("target_barcodes", "source_mappings", "source_barcodes").contains(normalizedPhase)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "phase must be target_barcodes, source_mappings, or source_barcodes");
        }
        if (limit < 1 || limit > 5000) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "limit must be between 1 and 5000");
        }
        List<Map<String, Object>> mappings = jdbc.queryForList(
                "SELECT store_key, outlet_id, enabled FROM shopfront_store_mapping WHERE store_key IN (?, ?)",
                source, target);
        Map<String, Map<String, Object>> byStore = new HashMap<>();
        for (Map<String, Object> mapping : mappings) {
            byStore.put(String.valueOf(mapping.get("store_key")), mapping);
        }
        Map<String, Object> sourceMapping = byStore.get(source);
        Map<String, Object> targetMapping = byStore.get(target);
        if (sourceMapping == null || targetMapping == null
                || !isEnabled(sourceMapping.get("enabled")) || !isEnabled(targetMapping.get("enabled"))) {
            throw new ResponseStatusException(HttpStatus.CONFLICT,
                    "Both source and target must have enabled Shopfront store mappings");
        }
        long targetOutletId = longValue(targetMapping.get("outlet_id"));
        if (targetOutletId <= 0) {
            throw new ResponseStatusException(HttpStatus.UNPROCESSABLE_ENTITY,
                    "Target Shopfront mapping has no numeric POS outlet_id");
        }
        int inserted = switch (normalizedPhase) {
            case "source_mappings" -> cloneSourceMappingsBatch(source, target, targetOutletId, limit);
            case "source_barcodes" -> cloneSourceBarcodesBatch(source, target, targetOutletId, limit);
            default -> cloneTargetBarcodesBatch(target, targetOutletId, limit);
        };
        Integer sourceCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_product_mapping WHERE store_key = ? AND status = 'MAPPED'",
                Integer.class, source);
        Integer targetCount = jdbc.queryForObject(
                "SELECT COUNT(*) FROM shopfront_product_mapping WHERE store_key = ? AND status = 'MAPPED'",
                Integer.class, target);
        Map<String, Object> result = new LinkedHashMap<>();
        result.put("status", "CLONED");
        result.put("phase", normalizedPhase);
        result.put("limit", limit);
        result.put("inserted", inserted);
        result.put("more", inserted >= limit);
        result.put("source_store_key", source);
        result.put("target_store_key", target);
        result.put("target_outlet_id", targetOutletId);
        result.put("source_mapped_count", sourceCount == null ? 0 : sourceCount);
        result.put("target_mapped_count", targetCount == null ? 0 : targetCount);
        return result;
    }

    private static boolean isEnabled(Object value) {
        if (value instanceof Boolean bool) {
            return bool;
        }
        if (value instanceof Number number) {
            return number.intValue() != 0;
        }
        return value != null && !"false".equalsIgnoreCase(String.valueOf(value));
    }

    private static long longValue(Object value) {
        if (value == null) {
            return 0;
        }
        if (value instanceof Number number) {
            return number.longValue();
        }
        try {
            return Long.parseLong(String.valueOf(value));
        } catch (NumberFormatException e) {
            return 0;
        }
    }

    private int cloneTargetBarcodesBatch(String target, long targetOutletId, int limit) {
        return jdbc.update("""
                INSERT INTO shopfront_product_mapping (store_key, source_product_id, pos_product_id, match_type, status)
                SELECT ?, source_id, pos_product_id, 'BARCODE', 'MAPPED'
                FROM (
                    SELECT DISTINCT ON (sp.source_id)
                           sp.source_id,
                           pb.product_id AS pos_product_id
                    FROM shopfront_product sp
                    JOIN product_barcode pb ON pb.code = sp.barcode AND pb.outlet_id = ?
                    JOIN product p ON p.id = pb.product_id AND p.outlet_id = ? AND p.deleted_at IS NULL
                    WHERE sp.store_key = ?
                      AND sp.barcode IS NOT NULL
                      AND TRIM(sp.barcode) <> ''
                      AND NOT EXISTS (
                          SELECT 1 FROM shopfront_product_mapping existing
                          WHERE existing.store_key = ?
                            AND existing.source_product_id = sp.source_id
                            AND existing.status = 'MAPPED'
                      )
                    ORDER BY sp.source_id, pb.product_id
                    LIMIT ?
                ) resolved
                ON CONFLICT (store_key, source_product_id) DO UPDATE
                SET pos_product_id = EXCLUDED.pos_product_id,
                    match_type = 'BARCODE',
                    status = 'MAPPED',
                    updated_at = CURRENT_TIMESTAMP
                """, target, targetOutletId, targetOutletId, target, target, limit);
    }

    private int cloneSourceMappingsBatch(String source, String target, long targetOutletId, int limit) {
        return jdbc.update("""
                INSERT INTO shopfront_product_mapping (store_key, source_product_id, pos_product_id, match_type, status)
                SELECT ?, source_product_id, pos_product_id, 'CLONE', 'MAPPED'
                FROM (
                    SELECT DISTINCT ON (m.source_product_id)
                           m.source_product_id,
                           pb_target.product_id AS pos_product_id
                    FROM shopfront_product_mapping m
                    JOIN product_barcode pb_source ON pb_source.product_id = m.pos_product_id
                    JOIN product p_source ON p_source.id = pb_source.product_id AND p_source.deleted_at IS NULL
                    JOIN product_barcode pb_target ON pb_target.code = pb_source.code AND pb_target.outlet_id = ?
                    JOIN product p_target ON p_target.id = pb_target.product_id
                        AND p_target.outlet_id = ?
                        AND p_target.deleted_at IS NULL
                    WHERE m.store_key = ?
                      AND m.status = 'MAPPED'
                      AND NOT EXISTS (
                          SELECT 1 FROM shopfront_product_mapping existing
                          WHERE existing.store_key = ?
                            AND existing.source_product_id = m.source_product_id
                            AND existing.status = 'MAPPED'
                      )
                    ORDER BY m.source_product_id, pb_target.product_id
                    LIMIT ?
                ) resolved
                ON CONFLICT (store_key, source_product_id) DO UPDATE
                SET pos_product_id = EXCLUDED.pos_product_id,
                    match_type = 'CLONE',
                    status = 'MAPPED',
                    updated_at = CURRENT_TIMESTAMP
                """, target, targetOutletId, targetOutletId, source, target, limit);
    }

    private int cloneSourceBarcodesBatch(String source, String target, long targetOutletId, int limit) {
        return jdbc.update("""
                INSERT INTO shopfront_product_mapping (store_key, source_product_id, pos_product_id, match_type, status)
                SELECT ?, source_product_id, pos_product_id, 'CLONE_SOURCE_BARCODE', 'MAPPED'
                FROM (
                    SELECT DISTINCT ON (m.source_product_id)
                           m.source_product_id,
                           pb_target.product_id AS pos_product_id
                    FROM shopfront_product_mapping m
                    JOIN shopfront_product sp ON sp.store_key = ? AND sp.source_id = m.source_product_id
                    JOIN product_barcode pb_target ON pb_target.code = sp.barcode AND pb_target.outlet_id = ?
                    JOIN product p_target ON p_target.id = pb_target.product_id
                        AND p_target.outlet_id = ?
                        AND p_target.deleted_at IS NULL
                    WHERE m.store_key = ?
                      AND m.status = 'MAPPED'
                      AND sp.barcode IS NOT NULL
                      AND TRIM(sp.barcode) <> ''
                      AND NOT EXISTS (
                          SELECT 1 FROM shopfront_product_mapping existing
                          WHERE existing.store_key = ?
                            AND existing.source_product_id = m.source_product_id
                            AND existing.status = 'MAPPED'
                      )
                    ORDER BY m.source_product_id, pb_target.product_id
                    LIMIT ?
                ) resolved
                ON CONFLICT (store_key, source_product_id) DO UPDATE
                SET pos_product_id = EXCLUDED.pos_product_id,
                    match_type = 'CLONE_SOURCE_BARCODE',
                    status = 'MAPPED',
                    updated_at = CURRENT_TIMESTAMP
                """, target, source, targetOutletId, targetOutletId, source, target, limit);
    }
}