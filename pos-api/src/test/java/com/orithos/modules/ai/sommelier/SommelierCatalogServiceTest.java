package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
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
}
