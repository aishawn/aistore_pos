package com.orithos.modules.ai.grocery;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.NativeAiReportQueryService;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

class GroceryRecommendServiceTest {

    private final NativeAiReportQueryService reports = mock(NativeAiReportQueryService.class);
    private final GroceryRecommendService service = new GroceryRecommendService(reports);
    private final TenantContext tenant = new TenantContext(7L, 9L, 3L, List.of(3L), Set.of("ROLE_ADMIN"));

    @Test
    void filtersByCategoryBudgetAndPositiveStockThenReturnsAtMostThreePriceBands() {
        when(reports.listRecommendationProducts(tenant)).thenReturn(catalog(
                row(1, "Harbour Lager", "Beer", "9.00", "5"),
                row(2, "Coastal Pale Ale", "Beer", "14.00", "3"),
                row(3, "Reserve IPA", "Beer", "29.00", "8"),
                row(4, "Zero Stock Lager", "Beer", "8.00", "0"),
                row(5, "House Shiraz", "Wine", "20.00", "6"),
                row(6, "Lemon Soda", "Soft Drinks", "4.00", "20"),
                row(7, "Premium Lager", "Beer", "31.00", "4")));

        GroceryRecommendResponse response = service.recommend(
                new GroceryRecommendRequest("beer", new BigDecimal("8"), new BigDecimal("30"), "bbq"), tenant);

        assertEquals(3, response.recommendations().size());
        assertEquals(List.of(1L, 2L, 3L), response.recommendations().stream().map(GroceryRecommendCard::productId).toList());
        assertEquals("Lowest price", response.recommendations().getFirst().badge());
        assertEquals("Higher price", response.recommendations().getLast().badge());
    }

    @Test
    void usesStoreCategoriesWhenNamesContainMisleadingWords() {
        when(reports.listRecommendationProducts(tenant)).thenReturn(catalog(
                row(1, "A&w Root Beer Bt 355ml", "SOFT DRINKS", "2.99", "22"),
                row(2, "BEN&JERRYS DULCE DELISH SUNDALE 427ML", "ICE CONFEC", "14.99", "5"),
                row(3, "BUNDY OP & COLA 6% 375ML", "premix", "9.99", "62"),
                row(4, "BENTSPOKE BARLEY GRIFFIN 375ML", "BEER", "6.99", "34"),
                row(5, "Remarkably Named Soda", null, "4.99", "6")));

        assertEquals(List.of(4L), recommendationIds("beer"));
        assertEquals(List.of(1L), recommendationIds("soft_drinks"));
        assertEquals(List.of(3L), recommendationIds("spirits"));
        assertEquals(List.of(2L), recommendationIds("snacks"));
    }

    private List<Long> recommendationIds(String category) {
        return service.recommend(new GroceryRecommendRequest(category, null, null, null), tenant)
                .recommendations().stream().map(GroceryRecommendCard::productId).toList();
    }

    @Test
    void returnsAnExplicitEmptyResultWhenNoInStockItemsMatch() {
        when(reports.listRecommendationProducts(tenant)).thenReturn(catalog(
                row(1, "House Lager", "Beer", "12.00", "0")));

        GroceryRecommendResponse response = service.recommend(
                new GroceryRecommendRequest("beer", null, null, null), tenant);

        assertEquals(List.of(), response.recommendations());
        assertEquals("No matching in-stock items. Try another category or widen the budget.", response.emptyReason());
    }

    @Test
    void invalidBudgetRangeIsRejectedBeforeReadingTheCatalogue() {
        assertThrows(BusinessException.class, () -> service.recommend(
                new GroceryRecommendRequest("beer", new BigDecimal("20"), new BigDecimal("10"), null), tenant));
        verifyNoInteractions(reports);
    }

    @SafeVarargs
    private static NativeAiReportQueryService.ProductCatalogResult catalog(Map<String, Object>... rows) {
        return new NativeAiReportQueryService.ProductCatalogResult(List.of(rows), null);
    }

    private static Map<String, Object> row(long id, String name, String category, String price, String quantity) {
        Map<String, Object> row = new LinkedHashMap<>();
        row.put("id", id);
        row.put("name", name);
        row.put("category", category);
        row.put("list_price", new BigDecimal(price));
        row.put("sell_price", new BigDecimal(price));
        row.put("quantity", new BigDecimal(quantity));
        return row;
    }
}
