package com.orithos.modules.product;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.security.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

@RestController
public class ShopfrontProductOfferController {
    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final BusinessTimezoneService timezones;

    public ShopfrontProductOfferController(JdbcTemplate jdbc, ObjectMapper json, BusinessTimezoneService timezones) {
        this.jdbc = jdbc;
        this.json = json;
        this.timezones = timezones;
    }

    @GetMapping("/api/products/{id}/shopfront-offers")
    public ApiResult<Offers> offers(@PathVariable long id) {
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        if (vendorId == null || outletId == null) {
            throw new BusinessException(40100, "Authenticated vendor and outlet are required.");
        }
        Instant now = Instant.now();
        List<Offer> offers = jdbc.query("""
                SELECT DISTINCT m.source_product_id, sm.shopfront_outlet, s.snapshot_at, s.promotions::text
                FROM product p
                JOIN outlet o ON o.id = p.outlet_id AND o.vendor_id = ? AND o.deleted_at IS NULL
                JOIN shopfront_product_mapping m ON m.pos_product_id = p.id AND m.status = 'MAPPED'
                JOIN shopfront_store_mapping sm ON sm.store_key = m.store_key AND sm.enabled
                    AND sm.outlet_id = p.outlet_id::text
                JOIN shopfront_promotion_snapshot s ON s.outlet_id = p.outlet_id
                WHERE p.outlet_id = ? AND p.id = ? AND p.status = 'ACTIVE' AND p.deleted_at IS NULL
                """, (rs, row) -> {
            try {
                return matchingOffers(json.readTree(rs.getString(4)), rs.getString(1), rs.getString(2),
                        rs.getObject(3, OffsetDateTime.class).toInstant(), now);
            } catch (com.fasterxml.jackson.core.JsonProcessingException e) {
                throw new IllegalStateException("Invalid Shopfront promotion snapshot", e);
            }
        }, vendorId, outletId, id).stream().flatMap(List::stream).distinct()
                .sorted(Comparator.comparing(Offer::requiredUnits).thenComparing(Offer::total).thenComparing(Offer::name))
                .toList();
        return ApiResult.ok(new Offers(timezones.zoneForVendor(vendorId).getId(), offers));
    }

    static List<Offer> matchingOffers(JsonNode snapshot, String sourceId, String sourceOutlet, Instant syncedAt, Instant now) {
        List<Offer> result = new ArrayList<>();
        if (sourceOutlet == null || sourceOutlet.isBlank()) return result;
        for (JsonNode promotion : snapshot) {
            if (!promotion.path("active").asBoolean()
                    || promotion.path("express").asBoolean() || promotion.path("mixCriteria").asBoolean()
                    || promotion.hasNonNull("activatedBy") || promotion.hasNonNull("schedule")
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
                if (!items.isArray() || items.size() != 1) continue;
                JsonNode entry = items.get(0);
                JsonNode product = entry.path("item");
                if (!"Product".equals(product.path("__typename").asText()) || !sourceId.equals(product.path("id").asText())
                        || entry.path("exclude").asBoolean() || criteria.path("mixedOnly").asBoolean()
                        || criteria.path("optional").asBoolean() || criteria.hasNonNull("buyAmountMax")
                        || criteria.hasNonNull("minQuantity")
                        || !"SELL_TOTAL".equals(criteria.path("type").asText())
                        || !"QUANTITY".equals(criteria.path("buyAmountType").asText())
                        || !"EXACT".equals(criteria.path("quantityType").asText())) continue;
                JsonNode buy = criteria.path("buyAmount");
                JsonNode total = criteria.path("discountAmount");
                if (!buy.isNumber() || !total.isNumber() || buy.decimalValue().signum() <= 0 || total.decimalValue().signum() <= 0) continue;
                String name = promotion.path("name").asText("").strip();
                if (!name.isEmpty()) result.add(new Offer(name, buy.decimalValue(), total.decimalValue(), start, end, syncedAt));
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

    public record Offer(String name, BigDecimal requiredUnits, BigDecimal total, Instant startsAt, Instant endsAt, Instant syncedAt) {}
    public record Offers(String timeZone, List<Offer> items) {}
}
