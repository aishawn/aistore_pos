package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper;
import com.orithos.modules.product.ShopfrontProductOfferService;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SommelierRecommendationProvenanceTest {

    @Test
    void exposesMatchingSingleBottleOfferEndDateInStoreTimezoneAndRejectsStaleOrMultiBottleDeals() {
        SommelierCatalogService catalog = mock(SommelierCatalogService.class);
        WinePitchService pitch = mock(WinePitchService.class);
        ShopfrontProductOfferService offers = mock(ShopfrontProductOfferService.class);
        BusinessTimezoneService timezones = mock(BusinessTimezoneService.class);
        WineCandidate wine = new WineCandidate(15L, "Test Shiraz", null, null, "Wine", null, null,
                new BigDecimal("20.00"), new BigDecimal("18.00"), true, new BigDecimal("5"), true,
                BigDecimal.ONE, WineProfile.empty("red"));
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of());
        when(catalog.listWines(tenant)).thenReturn(List.of(wine));
        when(offers.checkoutOffers(1L, 1L, List.of(15L))).thenReturn(new ShopfrontProductOfferService.CheckoutOffers(
                java.util.Map.of(15L, List.of(new ShopfrontProductOfferService.Offer("Bottle special",
                        BigDecimal.ONE, new BigDecimal("18.00"), null, Instant.parse("2026-11-24T13:00:00Z"),
                        Instant.parse("2026-11-24T00:00:00Z")))), false));
        when(timezones.zoneForVendor(1L)).thenReturn(java.time.ZoneId.of("Australia/Melbourne"));
        when(pitch.template(any(), any(), eq("card"))).thenReturn("A suitable wine.");

        var result = new SommelierService(catalog, pitch, mock(SommelierProductMapper.class),
                new ObjectMapper(), offers, timezones).recommend(
                new com.orithos.modules.ai.sommelier.dto.RecommendRequest(
                        "red", BigDecimal.ZERO, new BigDecimal("30"), null, null, null, null, null, List.of(), null),
                tenant);

        assertEquals("2026-11-25", result.recommendations().getFirst().promotionEndsAt());

        var expired = new ShopfrontProductOfferService.CheckoutOffers(
                java.util.Map.of(15L, List.of(new ShopfrontProductOfferService.Offer("Bottle special",
                        BigDecimal.ONE, new BigDecimal("18.00"), null, Instant.parse("2026-11-24T13:00:00Z"),
                        Instant.parse("2026-11-24T00:00:00Z")))), true);
        when(offers.checkoutOffers(1L, 1L, List.of(15L))).thenReturn(expired);
        var staleResult = new SommelierService(catalog, pitch, mock(SommelierProductMapper.class),
                new ObjectMapper(), offers, timezones).recommend(
                new com.orithos.modules.ai.sommelier.dto.RecommendRequest(
                        "red", BigDecimal.ZERO, new BigDecimal("30"), null, null, null, null, null, List.of(), null),
                tenant);
        assertNull(staleResult.recommendations().getFirst().promotionEndsAt());

        when(offers.checkoutOffers(1L, 1L, List.of(15L))).thenReturn(
                new ShopfrontProductOfferService.CheckoutOffers(java.util.Map.of(15L, List.of(
                        new ShopfrontProductOfferService.Offer("Six bottle deal", new BigDecimal("6"),
                                new BigDecimal("18.00"), null, Instant.parse("2026-11-24T13:00:00Z"),
                                Instant.parse("2026-11-24T00:00:00Z")))), false));
        var multiBottleResult = new SommelierService(catalog, pitch, mock(SommelierProductMapper.class),
                new ObjectMapper(), offers, timezones).recommend(
                new com.orithos.modules.ai.sommelier.dto.RecommendRequest(
                        "red", BigDecimal.ZERO, new BigDecimal("30"), null, null, null, null, null, List.of(), null),
                tenant);
        assertNull(multiBottleResult.recommendations().getFirst().promotionEndsAt());

        when(offers.checkoutOffers(1L, 1L, List.of(15L))).thenReturn(
                new ShopfrontProductOfferService.CheckoutOffers(java.util.Map.of(15L, List.of(
                        new ShopfrontProductOfferService.Offer("Bottle special", BigDecimal.ONE,
                                new BigDecimal("18.00"), null, Instant.parse("2026-11-24T13:00:00Z"),
                                Instant.parse("2026-11-24T00:00:00Z")),
                        new ShopfrontProductOfferService.Offer("Conflicting bottle deal", BigDecimal.ONE,
                                new BigDecimal("17.00"), null, Instant.parse("2026-11-25T13:00:00Z"),
                                Instant.parse("2026-11-24T00:00:00Z")))), false));
        var conflictingResult = new SommelierService(catalog, pitch, mock(SommelierProductMapper.class),
                new ObjectMapper(), offers, timezones).recommend(
                new com.orithos.modules.ai.sommelier.dto.RecommendRequest(
                        "red", BigDecimal.ZERO, new BigDecimal("30"), null, null, null, null, null, List.of(), null),
                tenant);
        assertNull(conflictingResult.recommendations().getFirst().promotionEndsAt());
    }

    @Test
    void recommendationResponseExposesWhenWineProfileWasInferred() throws Exception {
        assertProfileInferred(true);
    }

    @Test
    void recommendationResponseExposesWhenWineProfileIsStored() throws Exception {
        assertProfileInferred(false);
    }

    private void assertProfileInferred(boolean inferred) throws Exception {
        SommelierCatalogService catalog = mock(SommelierCatalogService.class);
        WinePitchService pitch = mock(WinePitchService.class);
        WineProfile profile = new WineProfile(
                "red", "Shiraz", null, null, 0.7, 0.8, 0.6, 0.5, 0.6,
                List.of("Berry"), List.of("Dry"), List.of("steak"), "Savoury finish", inferred);
        WineCandidate wine = new WineCandidate(
                15L, "Test Shiraz", null, null, "Wine", null, null,
                new BigDecimal("20.00"), new BigDecimal("20.00"), false,
                new BigDecimal("5"), true, BigDecimal.ONE, profile);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of());
        when(catalog.listWines(tenant)).thenReturn(List.of(wine));

        SommelierService service = new SommelierService(
                catalog, pitch, mock(SommelierProductMapper.class), new ObjectMapper());
        var result = service.recommend(
                new com.orithos.modules.ai.sommelier.dto.RecommendRequest(
                        "red", BigDecimal.ZERO, new BigDecimal("30"), 0.5, 0.5,
                        0.5, 0.5, 0.5, List.of(), null),
                tenant);

        JsonNode response = new ObjectMapper().valueToTree(result);
        assertTrue(response.at("/recommendations/0").has("inferred"));
        assertEquals(inferred, response.at("/recommendations/0/inferred").booleanValue());
    }
}
