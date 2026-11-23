package com.orithos.modules.product;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;

class ShopfrontProductOfferControllerTest {
    private final ObjectMapper json = new ObjectMapper();

    @Test
    void reportsOnlyApplicableFixedTotalOffersAndHonoursOffsetDates() throws Exception {
        var promotion = (ObjectNode) json.readTree("""
                {"name":"Two for six","active":true,"start":"2026-11-23T13:00:00+1100",
                 "end":"2026-11-23T14:00:00+1100","customerGroups":[],"outlets":[{"id":"shop"}],
                 "criteria":[{"type":"SELL_TOTAL","quantityType":"EXACT","buyAmountType":"QUANTITY",
                 "buyAmount":2,"discountAmount":6,"items":[{"item":{"__typename":"Product","id":"sku"}}]}]}
                """);
        var snapshot = json.createArrayNode().add(promotion);
        snapshot.add(promotion.deepCopy().put("end", "2026-11-23T13:00:00+1100"));
        snapshot.add(promotion.deepCopy().put("start", "2026-11-23T14:00:00+1100"));
        snapshot.add(promotion.deepCopy().put("end", "bad-date"));
        snapshot.add(promotion.deepCopy().put("mixCriteria", true));
        var scheduledOffer = promotion.deepCopy();
        scheduledOffer.putObject("schedule");
        snapshot.add(scheduledOffer);
        var customerOffer = promotion.deepCopy();
        customerOffer.putArray("customerGroups").addObject().put("id", "members");
        snapshot.add(customerOffer);
        var now = Instant.parse("2026-11-23T02:30:00Z");

        assertEquals(List.of(new ShopfrontProductOfferController.Offer("Two for six", new BigDecimal("2"),
                        new BigDecimal("6"), Instant.parse("2026-11-23T02:00:00Z"),
                        Instant.parse("2026-11-23T03:00:00Z"), now)),
                ShopfrontProductOfferController.matchingOffers(snapshot, "sku", "shop", now, now));
        assertEquals(List.of(), ShopfrontProductOfferController.matchingOffers(snapshot, "other-sku", "shop", now, now));
        assertEquals(List.of(), ShopfrontProductOfferController.matchingOffers(snapshot, "sku", "other-shop", now, now));
    }
}
