package com.orithos.modules.product;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Collection;

@Service
public class ShopfrontProductOfferService {
    private final NamedParameterJdbcTemplate jdbc;
    private final ObjectMapper json;

    public ShopfrontProductOfferService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = new NamedParameterJdbcTemplate(jdbc);
        this.json = json;
    }

    public Map<Long, List<Offer>> currentOffers(long vendorId, long outletId, Collection<Long> productIds) {
        return currentOffers(vendorId, outletId, productIds, false);
    }

    public Map<Long, List<Offer>> currentOffers(long vendorId, long outletId, Collection<Long> productIds, boolean includeGroups) {
        if (productIds.isEmpty()) return Map.of();
        Instant now = Instant.now();
        return jdbc.query("""
                WITH mappings AS (
                    SELECT p.id, m.source_product_id, sm.shopfront_outlet
                    FROM product p
                    JOIN shopfront_product_mapping m ON m.pos_product_id = p.id AND m.status = 'MAPPED'
                    JOIN shopfront_store_mapping sm ON sm.store_key = m.store_key AND sm.enabled
                        AND sm.outlet_id = p.outlet_id::text
                    WHERE p.outlet_id = :outlet AND p.id IN (:products) AND p.status = 'ACTIVE' AND p.deleted_at IS NULL
                )
                SELECT s.snapshot_at, s.promotions::text AS promotions,
                       (SELECT jsonb_agg(to_jsonb(m)) FROM mappings m)::text AS mappings
                FROM shopfront_promotion_snapshot s
                JOIN outlet o ON o.id = s.outlet_id AND o.vendor_id = :vendor AND o.deleted_at IS NULL
                WHERE s.outlet_id = :outlet AND EXISTS (SELECT 1 FROM mappings)
                """, Map.of("vendor", vendorId, "outlet", outletId, "products", productIds), rs -> {
            Map<Long, List<Offer>> result = new LinkedHashMap<>();
            if (!rs.next()) return result;
            JsonNode snapshot;
            JsonNode mappings;
            try {
                snapshot = json.readTree(rs.getString("promotions"));
                mappings = json.readTree(rs.getString("mappings"));
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                throw new IllegalStateException("Invalid Shopfront promotion snapshot", e);
            }
            Instant syncedAt = rs.getObject("snapshot_at", OffsetDateTime.class).toInstant();
            for (JsonNode mapping : mappings) {
                var offers = matchingOffers(snapshot, mapping.path("source_product_id").asText(),
                        mapping.path("shopfront_outlet").asText(), syncedAt, now, includeGroups);
                if (!offers.isEmpty()) result.computeIfAbsent(mapping.path("id").asLong(), ignored -> new ArrayList<>()).addAll(offers);
            }
            result.replaceAll((id, offers) -> offers.stream().distinct().sorted(
                    Comparator.comparing(Offer::requiredUnits).thenComparing(Offer::total).thenComparing(Offer::name)).toList());
            return result;
        });
    }

    static List<Offer> matchingOffers(JsonNode snapshot, String sourceId, String sourceOutlet, Instant syncedAt, Instant now) {
        return matchingOffers(snapshot, sourceId, sourceOutlet, syncedAt, now, false);
    }

    private static List<Offer> matchingOffers(JsonNode snapshot, String sourceId, String sourceOutlet,
                                              Instant syncedAt, Instant now, boolean includeGroups) {
        List<Offer> result = new ArrayList<>();
        if (sourceOutlet == null || sourceOutlet.isBlank()) return result;
        for (JsonNode promotion : snapshot) {
            if (!promotion.path("active").asBoolean()
                    || promotion.path("express").asBoolean() || promotion.path("mixCriteria").asBoolean()
                    || promotion.hasNonNull("activatedBy") || promotion.hasNonNull("schedule")
                    || promotion.hasNonNull("saleMaxApplicationCount")
                    || !promotion.path("customerGroups").isArray() || !promotion.path("customerGroups").isEmpty()
                    || !promotion.path("criteria").isArray() || promotion.path("criteria").size() != 1) continue;
            boolean appliesAtOutlet = false;
            for (JsonNode outlet : promotion.path("outlets")) {
                if (sourceOutlet.equals(outlet.path("id").asText())) appliesAtOutlet = true;
            }
            if (!appliesAtOutlet) continue;
            try {
                Instant start = date(promotion.get("start"));
                Instant end = date(promotion.get("end"));
                if ((start != null && now.isBefore(start)) || (end != null && now.isAfter(end))) continue;
                JsonNode criteria = promotion.path("criteria").get(0);
                JsonNode items = criteria.path("items");
                if (!items.isArray() || items.isEmpty() || (!includeGroups && items.size() != 1)) continue;
                if (criteria.path("excludePricePoints").asBoolean() || criteria.path("excludeCountQuantity").asBoolean()
                        || criteria.path("discountEverydayPromotions").asBoolean() || criteria.path("mixedOnly").asBoolean()
                        || criteria.path("optional").asBoolean() || criteria.hasNonNull("buyAmountMax")
                        || criteria.hasNonNull("minQuantity")
                        || !"SELL_TOTAL".equals(criteria.path("type").asText())
                        || !"QUANTITY".equals(criteria.path("buyAmountType").asText())
                        || !"EXACT".equals(criteria.path("quantityType").asText())) continue;
                boolean matchesProduct = false;
                boolean supportedItems = true;
                for (JsonNode entry : items) {
                    JsonNode product = entry.path("item");
                    if (!"Product".equals(product.path("__typename").asText()) || product.path("id").asText().isBlank()
                            || entry.path("exclude").asBoolean() || entry.path("rebate").asDouble() != 0) {
                        supportedItems = false;
                        break;
                    }
                    matchesProduct |= sourceId.equals(product.path("id").asText());
                }
                if (!supportedItems || !matchesProduct) continue;
                JsonNode buy = criteria.path("buyAmount");
                JsonNode total = criteria.path("discountAmount");
                if (!buy.isNumber() || !total.isNumber() || buy.decimalValue().signum() <= 0 || total.decimalValue().signum() <= 0) continue;
                String name = promotion.path("name").asText("").strip();
                String groupId = items.size() > 1 ? promotion.path("id").asText() : null;
                if (!name.isEmpty() && (groupId == null || !groupId.isBlank())) {
                    result.add(new Offer(name, buy.decimalValue(), total.decimalValue(), start, end, syncedAt, groupId));
                }
            } catch (DateTimeParseException ignored) {
                // An unrecognised date cannot establish that the offer is current.
            }
        }
        return result;
    }

    private static Instant date(JsonNode node) {
        if (node == null || node.isNull()) return null;
        return OffsetDateTime.parse(node.asText().replaceFirst("([+-]\\d{2})(\\d{2})$", "$1:$2")).toInstant();
    }

    public record Offer(String name, BigDecimal requiredUnits, BigDecimal total, Instant startsAt, Instant endsAt,
                        Instant syncedAt, String groupId) {
        public Offer(String name, BigDecimal requiredUnits, BigDecimal total, Instant startsAt, Instant endsAt, Instant syncedAt) {
            this(name, requiredUnits, total, startsAt, endsAt, syncedAt, null);
        }
    }
}
