package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.ai.sommelier.mapper.SommelierProductMapper;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class SommelierCatalogServiceTest {

    @Test
    void configuredOdooRemainsAuthoritativeWhenCatalogIsEmpty() {
        SommelierProductMapper mapper = mock(SommelierProductMapper.class);
        OdooWineCatalogClient odoo = mock(OdooWineCatalogClient.class);
        when(odoo.isConfigured()).thenReturn(true);
        when(odoo.listWines()).thenReturn(List.of());
        SommelierCatalogService service = new SommelierCatalogService(mapper, new ObjectMapper(), odoo);

        assertEquals(List.of(), service.listWines(1L));
        assertEquals(List.of(), service.search(1L, "Shiraz"));
        assertNull(service.findById(7L, 1L));
        verify(mapper, never()).listCatalog(1L);
        verify(mapper, never()).searchCatalog(1L, "Shiraz");
        verify(mapper, never()).findById(7L, 1L);
    }
}
