package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SommelierRecommendationProvenanceTest {

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
