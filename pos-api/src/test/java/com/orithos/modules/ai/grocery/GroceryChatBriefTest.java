package com.orithos.modules.ai.grocery;

import com.orithos.modules.ai.report.NativeAiReportQueryService;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class GroceryChatBriefTest {

    private final NativeAiReportQueryService reports = mock(NativeAiReportQueryService.class);
    private final GroceryChatBrief brief = new GroceryChatBrief(new GroceryRecommendService(reports));
    private final TenantContext tenant = new TenantContext(7L, 9L, 3L, List.of(3L), Set.of("ROLE_ADMIN"));

    @Test
    void returnsRealOrithosRowsAsStructuredItemsAndCompatibleAnswer() {
        when(reports.listRecommendationProducts(tenant)).thenReturn(new NativeAiReportQueryService.ProductCatalogResult(List.of(
                Map.of("id", 11L, "name", "Harbour Lager", "category", "Beer", "list_price", new BigDecimal("12.50"),
                        "sell_price", new BigDecimal("12.50"), "quantity", new BigDecimal("8"))), null));

        GroceryChatBrief.Brief result = brief.result("Recommend beer under $20", tenant);

        assertTrue(result.answer().contains("Harbour Lager"));
        assertTrue(result.answer().contains("12.50"));
        assertEquals("ready", result.card().status());
        assertEquals("catalogue", result.card().source());
        assertEquals(11L, result.card().items().getFirst().get("productId"));
        assertEquals("/recommend/grocery", result.card().cta().route());
    }

    @Test
    void distinguishesEmptyFromUnavailableWithoutInventingItems() {
        when(reports.listRecommendationProducts(tenant)).thenReturn(new NativeAiReportQueryService.ProductCatalogResult(List.of(), null));
        GroceryChatBrief.Brief empty = brief.result("Recommend snacks", tenant);
        assertEquals("empty", empty.card().status());
        assertTrue(empty.card().items().isEmpty());

        when(reports.listRecommendationProducts(tenant)).thenReturn(
                new NativeAiReportQueryService.ProductCatalogResult(List.of(), "NATIVE_REPORT_UNAVAILABLE"));
        GroceryChatBrief.Brief unavailable = brief.result("Recommend snacks", tenant);
        assertEquals("unavailable", unavailable.card().status());
        assertTrue(unavailable.card().items().isEmpty());
    }

    @Test
    void keepsPermissionFailureExplicitInEnglishAndChineseCards() {
        when(reports.listRecommendationProducts(tenant)).thenReturn(
                new NativeAiReportQueryService.ProductCatalogResult(List.of(), "NO_PERMISSION"));

        GroceryChatBrief.Brief english = brief.result("Recommend beer", tenant);
        GroceryChatBrief.Brief chinese = brief.result("推荐啤酒", tenant);

        assertEquals("unavailable", english.card().status());
        assertEquals(false, english.card().retryable());
        assertTrue(english.answer().contains("do not have permission"));
        assertTrue(english.card().emptyReason().contains("do not have permission"));
        assertEquals("unavailable", chinese.card().status());
        assertEquals(false, chinese.card().retryable());
        assertTrue(chinese.answer().contains("没有权限"));
        assertTrue(chinese.card().emptyReason().contains("没有权限"));
        assertTrue(english.card().items().isEmpty());
        assertTrue(chinese.card().items().isEmpty());
    }
}
