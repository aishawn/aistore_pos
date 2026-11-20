package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SommelierCatalogServiceTest {

    @Test
    void excludesLimoncelloEvenWhenItHasAnIncorrectStoredWineProfile() {
        SommelierProductMapper mapper = mock(SommelierProductMapper.class);
        SommelierProductMapper.CatalogRow limoncello = new SommelierProductMapper.CatalogRow();
        limoncello.setId(21826L);
        limoncello.setName("CALABRIA RICHLAND LIMONCELLO 750ML");
        limoncello.setStoredWineType("red");
        limoncello.setPrice(new BigDecimal("9.99"));
        limoncello.setStockQuantity(new BigDecimal("10"));
        when(mapper.listCatalog(1L)).thenReturn(List.of(limoncello));
        SommelierCatalogService service = new SommelierCatalogService(mapper, new ObjectMapper());
        TenantContext tenant = new TenantContext(42L, 7L, 1L, List.of(1L), Set.of());

        assertTrue(service.listWines(tenant).isEmpty());
    }

    @Test
    void explicitRoseStyleOverridesStaleStoredRedType() {
        SommelierProductMapper mapper = mock(SommelierProductMapper.class);
        SommelierProductMapper.CatalogRow wine = new SommelierProductMapper.CatalogRow();
        wine.setId(14347L);
        wine.setName("Babich Marlborough Pinot Noir Rose 750ml");
        wine.setCategoryName("Wine");
        wine.setStoredWineType("red");
        when(mapper.listCatalog(1L)).thenReturn(List.of(wine));
        SommelierCatalogService service = new SommelierCatalogService(mapper, new ObjectMapper());
        TenantContext tenant = new TenantContext(42L, 7L, 1L, List.of(1L), Set.of());

        assertEquals("rose", service.listWines(tenant).get(0).profile().wineType());
    }

    @Test
    void storedInferredProfileRemainsMarkedAsEstimated() {
        SommelierProductMapper mapper = mock(SommelierProductMapper.class);
        SommelierProductMapper.CatalogRow wine = new SommelierProductMapper.CatalogRow();
        wine.setId(14347L);
        wine.setName("Babich Marlborough Pinot Noir Rose 750ml");
        wine.setCategoryName("Wine");
        wine.setStoredWineType("rose");
        wine.setStoredProfileSource("inferred");
        when(mapper.listCatalog(1L)).thenReturn(List.of(wine));
        SommelierCatalogService service = new SommelierCatalogService(mapper, new ObjectMapper());
        TenantContext tenant = new TenantContext(42L, 7L, 1L, List.of(1L), Set.of());

        assertTrue(service.listWines(tenant).get(0).profile().inferred());
    }

    @Test
    void curatedProfileIsMarkedAsReviewed() {
        SommelierProductMapper mapper = mock(SommelierProductMapper.class);
        SommelierProductMapper.CatalogRow wine = new SommelierProductMapper.CatalogRow();
        wine.setId(14347L);
        wine.setName("Babich Marlborough Pinot Noir Rose 750ml");
        wine.setCategoryName("Wine");
        wine.setStoredWineType("rose");
        wine.setStoredProfileSource("curated");
        when(mapper.listCatalog(1L)).thenReturn(List.of(wine));
        SommelierCatalogService service = new SommelierCatalogService(mapper, new ObjectMapper());
        TenantContext tenant = new TenantContext(42L, 7L, 1L, List.of(1L), Set.of());

        assertTrue(!service.listWines(tenant).get(0).profile().inferred());
    }

    @Test
    void listSearchAndLookupUseCurrentOrithosOutlet() {
        SommelierProductMapper mapper = mock(SommelierProductMapper.class);
        when(mapper.listCatalog(1L)).thenReturn(List.of());
        when(mapper.searchCatalog(1L, "Shiraz")).thenReturn(List.of());
        when(mapper.findById(7L, 1L)).thenReturn(null);
        SommelierCatalogService service = new SommelierCatalogService(mapper, new ObjectMapper());
        TenantContext tenant = new TenantContext(42L, 7L, 1L, List.of(1L), Set.of());

        assertEquals(List.of(), service.listWines(tenant));
        assertEquals(List.of(), service.search(tenant, "Shiraz"));
        assertNull(service.findById(7L, tenant));

        verify(mapper).listCatalog(1L);
        verify(mapper).searchCatalog(1L, "Shiraz");
        verify(mapper).findById(7L, 1L);
    }

    @Test
    void listWinesExcludesWeightPackagedProductsEvenWhenTheyLookLikeWine() {
        SommelierProductMapper mapper = mock(SommelierProductMapper.class);
        List<String> names = List.of(
                "Shiraz snack 100g", "Shiraz snack 100 g", "Shiraz snack 100 grams",
                "Shiraz snack 1kg", "Shiraz snack 1 kg", "Shiraz snack 1 kilogram",
                "Shiraz snack 100克", "Shiraz snack 1千克", "Shiraz snack 1公斤",
                "Shiraz snack 0.5 kg", "Shiraz snack 250G", "Shiraz snack 2.5 kilograms",
                "Shiraz Reserve 750ml"
        );
        List<SommelierProductMapper.CatalogRow> rows = new ArrayList<>();
        for (int i = 0; i < names.size(); i++) {
            SommelierProductMapper.CatalogRow row = new SommelierProductMapper.CatalogRow();
            row.setId((long) i + 1);
            row.setName(names.get(i));
            row.setCategoryName("Wine");
            row.setStoredWineType("red");
            row.setPrice(BigDecimal.TEN);
            rows.add(row);
        }
        when(mapper.listCatalog(1L)).thenReturn(rows);
        SommelierCatalogService service = new SommelierCatalogService(mapper, new ObjectMapper());
        TenantContext tenant = new TenantContext(42L, 7L, 1L, List.of(1L), Set.of());

        List<WineCandidate> wines = service.listWines(tenant);

        assertEquals(List.of("Shiraz Reserve 750ml"), wines.stream().map(WineCandidate::name).toList());
    }
}
