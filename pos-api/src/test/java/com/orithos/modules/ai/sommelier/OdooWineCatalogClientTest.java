package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class OdooWineCatalogClientTest {

    private final ObjectMapper objectMapper = new ObjectMapper();
    private final OdooWineCatalogClient client = new OdooWineCatalogClient(
            objectMapper, "https://odoo.example", "aipos", "service", "secret");

    @Test
    void prefersPosPriceAndFreeStockOverGenericListAndOnHandValues() throws Exception {
        JsonNode row = objectMapper.readTree("""
                {
                  "id": 62,
                  "display_name": "DEMO Barossa Shiraz",
                  "name": "DEMO Barossa Shiraz",
                  "list_price": 99.00,
                  "lst_price": 34.90,
                  "qty_available": 12.0,
                  "free_qty": 3.0,
                  "categ_id": [1, "DEMO | Red Wine"]
                }
                """);

        WineCandidate candidate = client.toCandidate(row);

        assertEquals(new BigDecimal("34.9"), candidate.listPrice());
        assertEquals(new BigDecimal("34.9"), candidate.sellPrice());
        assertEquals(new BigDecimal("3.0"), candidate.stockQuantity());
        assertEquals(3.0, candidate.stock(), 0.0001);
    }

    @Test
    void zeroFreeStockIsOutOfStockEvenWhenPhysicalOnHandRemains() throws Exception {
        JsonNode row = objectMapper.readTree("""
                {
                  "id": 63,
                  "display_name": "DEMO Adelaide Hills Sauvignon Blanc",
                  "name": "DEMO Adelaide Hills Sauvignon Blanc",
                  "list_price": 26.00,
                  "lst_price": 26.00,
                  "qty_available": 8.0,
                  "free_qty": 0.0,
                  "categ_id": [2, "DEMO | White Wine"]
                }
                """);

        WineCandidate candidate = client.toCandidate(row);

        assertEquals(0, candidate.stockQuantity().compareTo(BigDecimal.ZERO));
        assertFalse(candidate.inStock());
    }

    @Test
    void tenantContextIncludesCompanyAndWarehouseAndFailsClosedWhenUnbound() {
        VendorMapper vendors = mock(VendorMapper.class);
        Vendor vendor = new Vendor();
        vendor.setId(42L);
        vendor.setOdooCompanyId(7L);
        vendor.setOdooWarehouseId(11L);
        vendor.setOdooProvisionStatus("ready");
        when(vendors.findById(42L)).thenReturn(vendor);
        OdooWineCatalogClient scoped = new OdooWineCatalogClient(
                objectMapper, vendors, "https://odoo.example", "aipos", "service", "secret");

        assertEquals(java.util.List.of(7L), scoped.contextFor(42L).get("allowed_company_ids"));
        assertEquals(7L, scoped.contextFor(42L).get("force_company"));
        assertEquals(11L, scoped.contextFor(42L).get("warehouse"));
        when(vendors.findById(99L)).thenReturn(null);
        assertNull(scoped.contextFor(99L));
    }
}
