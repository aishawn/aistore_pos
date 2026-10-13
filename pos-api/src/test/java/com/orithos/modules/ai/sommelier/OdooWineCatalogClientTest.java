package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;

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
        assertEquals(3.0, candidate.stock());
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

        assertEquals(BigDecimal.ZERO, candidate.stockQuantity());
        assertFalse(candidate.inStock());
    }
}
