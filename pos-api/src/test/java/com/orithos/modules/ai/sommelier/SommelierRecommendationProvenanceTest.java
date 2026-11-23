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
    void appliesOnlyAnUnambiguousLowerSingleBottleOfferBeforeBudgetMatching() {
        SommelierCatalogService catalog = mock(SommelierCatalogService.class);
        WinePitchService pitch = mock(WinePitchService.class);
        ShopfrontProductOfferService offers = mock(ShopfrontProductOfferService.class);
        BusinessTimezoneService timezones = mock(BusinessTimezoneService.class);
        WineCandidate wine = new WineCandidate(15L, "Test Shiraz", null, null, "Wine", null, null,
                new BigDecimal("20.00"), new BigDecimal("20.00"), false, new BigDecimal("5"), true,
                BigDecimal.ONE, WineProfile.empty("red"));
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of());
        Instant end = Instant.parse("2026-11-25T00:00:00Z");
        var offer = new ShopfrontProductOfferService.Offer("Bottle special", BigDecimal.ONE,
                new BigDecimal("16.00"), null, end, Instant.parse("2026-11-24T00:00:00Z"));
        when(catalog.listWines(tenant)).thenReturn(List.of(wine));
        when(offers.checkoutOffers(1L, 1L, List.of(15L))).thenReturn(new ShopfrontProductOfferService.CheckoutOffers(
                java.util.Map.of(15L, List.of(offer)), false));
        when(timezones.zoneForVendor(1L)).thenReturn(java.time.ZoneId.of("Australia/Melbourne"));
        when(pitch.template(any(), any(), eq("card"))).thenReturn("A suitable wine.");

        var result = recommend(catalog, pitch, offers, timezones, tenant,
                new BigDecimal("17.00"));

        assertEquals(new BigDecimal("16.00"), result.recommendations().getFirst().sellPrice());
        assertTrue(result.recommendations().getFirst().onPromotion());
        assertEquals("2026-11-25", result.recommendations().getFirst().promotionEndsAt());
    }

    @Test
    void distinguishesVerifiedOfferWithoutEndDateFromUnverifiedPromotion() {
        SommelierCatalogService catalog = mock(SommelierCatalogService.class);
        WinePitchService pitch = mock(WinePitchService.class);
        ShopfrontProductOfferService offers = mock(ShopfrontProductOfferService.class);
        BusinessTimezoneService timezones = mock(BusinessTimezoneService.class);
        WineCandidate wine = new WineCandidate(15L, "Test Shiraz", null, null, "Wine", null, null,
                new BigDecimal("20.00"), new BigDecimal("20.00"), false, new BigDecimal("5"), true,
                BigDecimal.ONE, WineProfile.empty("red"));
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of());
        when(catalog.listWines(tenant)).thenReturn(List.of(wine));
        when(catalog.findById(15L, tenant)).thenReturn(wine);
        when(offers.checkoutOffers(1L, 1L, List.of(15L))).thenReturn(new ShopfrontProductOfferService.CheckoutOffers(
                java.util.Map.of(15L, List.of(new ShopfrontProductOfferService.Offer("Bottle special",
                        BigDecimal.ONE, new BigDecimal("16.00"), null, null,
                        Instant.parse("2026-11-24T00:00:00Z")))), false));
        when(pitch.template(any(), any(), eq("card"))).thenReturn("A suitable wine.");
        SommelierService service = new SommelierService(catalog, pitch, mock(SommelierProductMapper.class),
                new ObjectMapper(), offers, timezones);

        var recommendation = service.recommend(new com.orithos.modules.ai.sommelier.dto.RecommendRequest(
                "red", BigDecimal.ZERO, new BigDecimal("17.00"), null, null, null, null, null, List.of(), null), tenant)
                .recommendations().getFirst();
        var detail = service.wine(15L, tenant);

        assertEquals(new BigDecimal("16.00"), recommendation.sellPrice());
        assertEquals("NO_END_DATE", recommendation.promotionEndDateStatus());
        assertNull(recommendation.promotionEndsAt());
        assertEquals(new BigDecimal("16.00"), detail.sellPrice());
        assertEquals("NO_END_DATE", detail.promotionEndDateStatus());
        assertNull(detail.promotionEndsAt());
    }

    @Test
    void keepsDirectoryPriceForConflictingOrNonSingleBottleOffers() {
        SommelierCatalogService catalog = mock(SommelierCatalogService.class);
        WinePitchService pitch = mock(WinePitchService.class);
        ShopfrontProductOfferService offers = mock(ShopfrontProductOfferService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of());
        WineCandidate wine = new WineCandidate(15L, "Test Shiraz", null, null, "Wine", null, null,
                new BigDecimal("20.00"), new BigDecimal("20.00"), false, new BigDecimal("5"), true,
                BigDecimal.ONE, WineProfile.empty("red"));
        when(catalog.listWines(tenant)).thenReturn(List.of(wine));
        when(pitch.template(any(), any(), eq("card"))).thenReturn("A suitable wine.");
        var conflicting = List.of(
                new ShopfrontProductOfferService.Offer("Bottle special", BigDecimal.ONE,
                        new BigDecimal("16.00"), null, null, Instant.now()),
                new ShopfrontProductOfferService.Offer("Other bottle special", BigDecimal.ONE,
                        new BigDecimal("15.00"), null, null, Instant.now()));
        when(offers.checkoutOffers(1L, 1L, List.of(15L))).thenReturn(new ShopfrontProductOfferService.CheckoutOffers(
                java.util.Map.of(15L, conflicting), false));

        var conflictingResult = recommend(catalog, pitch, offers, mock(BusinessTimezoneService.class), tenant,
                new BigDecimal("21.00"));
        assertEquals(new BigDecimal("20.00"), conflictingResult.recommendations().getFirst().sellPrice());
        assertEquals(false, conflictingResult.recommendations().getFirst().onPromotion());

        when(offers.checkoutOffers(1L, 1L, List.of(15L))).thenReturn(new ShopfrontProductOfferService.CheckoutOffers(
                java.util.Map.of(15L, List.of(new ShopfrontProductOfferService.Offer("Six bottle deal",
                        new BigDecimal("6"), new BigDecimal("16.00"), null, null, Instant.now()))), false));
        var multiBottleResult = recommend(catalog, pitch, offers, mock(BusinessTimezoneService.class), tenant,
                new BigDecimal("21.00"));
        assertEquals(new BigDecimal("20.00"), multiBottleResult.recommendations().getFirst().sellPrice());

        when(offers.checkoutOffers(1L, 1L, List.of(15L))).thenReturn(new ShopfrontProductOfferService.CheckoutOffers(
                java.util.Map.of(15L, List.of(new ShopfrontProductOfferService.Offer("Stale bottle deal",
                        BigDecimal.ONE, new BigDecimal("16.00"), null, null, Instant.now()))), true));
        var staleResult = recommend(catalog, pitch, offers, mock(BusinessTimezoneService.class), tenant,
                new BigDecimal("21.00"));
        assertEquals(new BigDecimal("20.00"), staleResult.recommendations().getFirst().sellPrice());
    }

    private static com.orithos.modules.ai.sommelier.dto.RecommendResponse recommend(
            SommelierCatalogService catalog, WinePitchService pitch, ShopfrontProductOfferService offers,
            BusinessTimezoneService timezones, TenantContext tenant, BigDecimal budgetMax) {
        return new SommelierService(catalog, pitch, mock(SommelierProductMapper.class),
                new ObjectMapper(), offers, timezones).recommend(
                new com.orithos.modules.ai.sommelier.dto.RecommendRequest(
                        "red", BigDecimal.ZERO, budgetMax, null, null, null, null, null, List.of(), null), tenant);
    }

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
