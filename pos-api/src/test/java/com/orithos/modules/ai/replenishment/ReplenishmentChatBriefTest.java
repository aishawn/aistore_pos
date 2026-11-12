package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;
import java.time.Instant;
import java.sql.SQLException;

import org.springframework.dao.DataAccessException;
import org.springframework.security.access.AccessDeniedException;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ReplenishmentChatBriefTest {

    @Test
    void briefListsTopSuggestionsAndCta() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(
                21,
                5,
                List.of(
                        new ReplenishmentSuggestion(1, "VB Cans", "Units", 24, 3.0, 2.0),
                        new ReplenishmentSuggestion(2, "Shiraz", "Units", 12, 5.0, 1.0))));

        String text = new ReplenishmentChatBrief(client).brief("What should I restock?", tenant);

        assertTrue(text.contains("Top restock suggestions (21d cover): 5 items need order."));
        assertTrue(text.contains("\n• VB Cans — order 24 (≈3.0d left)"));
        assertTrue(text.contains("\n• Shiraz — order 12"));
        assertTrue(text.contains("\n\nTap below to review quantities"));
        assertFalse(text.contains("Opening the requested workflow"));
    }

    @Test
    void briefFormatsChineseSuggestionsWithTheSameSourceValues() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(
                21, 5, List.of(new ReplenishmentSuggestion(1, "Shiraz", "Units", 12, 5.0, 1.0))));

        String text = new ReplenishmentChatBrief(client).brief("哪些商品需要补货？", tenant);

        assertTrue(text.contains("建议补货（覆盖 21 天）：5 个商品需要补货。"));
        assertTrue(text.contains("\n• Shiraz — 建议订购 12（约剩 5.0 天）"));
        assertTrue(text.contains("数据来源：Orithos 库存与销售账本；销售数据最后更新时间：未知。库存记录没有独立更新时间。"));
        assertTrue(text.contains("打开补货页面审核数量并确认订单。"));
    }

    @Test
    void briefMarksMissingPlanUnavailableAndOffersRetry() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(null);

        String text = new ReplenishmentChatBrief(client).brief("补货建议", tenant);

        assertTrue(text.contains("暂不可用"));
        assertTrue(text.contains("重试"));

        String missingTenant = new ReplenishmentChatBrief(client).brief("补货建议", null);
        assertTrue(missingTenant.contains("暂不可用"));
        verify(client, times(1)).plan(tenant);
    }

    @Test
    void briefMarksClientFailureUnavailableAndOffersRetry() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenThrow(new IllegalStateException("upstream unavailable"));

        String text = new ReplenishmentChatBrief(client).brief("What should I restock?", tenant);

        assertTrue(text.toLowerCase().contains("unavailable"));
        assertTrue(text.toLowerCase().contains("retry"));
    }

    @Test
    void briefMarksChineseClientFailureUnavailableInChinese() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenThrow(new IllegalStateException("upstream unavailable"));

        String text = new ReplenishmentChatBrief(client).brief("给我补货建议", tenant);

        assertTrue(text.contains("暂不可用"));
        assertTrue(text.contains("重试"));
    }

    @Test
    void databasePermissionFailureIsExplainedWithoutExposingDatabaseDetails() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        DataAccessException failure = new DataAccessException(
                "database password=must-not-leak", new SQLException("permission denied", "42501")) { };
        when(client.plan(tenant)).thenThrow(failure);

        String text = new ReplenishmentChatBrief(client).brief("补货建议", tenant);

        assertTrue(text.contains("权限"));
        assertFalse(text.contains("must-not-leak"));
        assertFalse(text.contains("permission denied"));
    }

    @Test
    void applicationPermissionFailureIsExplainedWithoutQueryingOrLeakingDetails() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of());
        when(client.plan(tenant)).thenThrow(new AccessDeniedException("internal permission detail"));

        String text = new ReplenishmentChatBrief(client).brief("补货建议", tenant);

        assertTrue(text.contains("权限"));
        assertFalse(text.contains("internal permission detail"));
    }

    @Test
    void queryConfigurationFailureIsNotMisreportedAsPermissionFailure() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        DataAccessException failure = new DataAccessException(
                "database password=must-not-leak", new SQLException("syntax error", "42601")) { };
        when(client.plan(tenant)).thenThrow(failure);

        String text = new ReplenishmentChatBrief(client).brief("补货建议", tenant);

        assertTrue(text.contains("暂不可用"));
        assertFalse(text.contains("权限"));
        assertFalse(text.contains("must-not-leak"));
        assertFalse(text.contains("syntax error"));
    }

    @Test
    void queryTimeoutHasAnActionableMessage() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        DataAccessException failure = new DataAccessException(
                "database password=must-not-leak", new SQLException("statement timeout", "57014")) { };
        when(client.plan(tenant)).thenThrow(failure);

        String text = new ReplenishmentChatBrief(client).brief("补货建议", tenant);

        assertTrue(text.contains("查询超时"));
        assertTrue(text.contains("重试"));
        assertFalse(text.contains("must-not-leak"));
    }

    @Test
    void incompleteBriefShowsDataDateAndManualReviewBoundary() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(
                21, 0, List.of(), "DATA_INCOMPLETE", List.of("Shiraz: supplier unavailable"),
                Instant.parse("2026-11-03T04:00:00Z")));

        String text = new ReplenishmentChatBrief(client).brief("What do we need to buy?", tenant);

        assertTrue(text.contains("sales data updated at 2026-11-03T04:00:00Z"));
        assertTrue(text.contains("Manual review is required"));
        assertTrue(text.contains("no quantities were generated"));
    }

    @Test
    void missingSalesHistoryDoesNotClaimThatNoRestockIsNeeded() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(
                21, 0, List.of(), "NO_DATA", List.of("sales history unavailable"), null, 4));

        String text = new ReplenishmentChatBrief(client).brief("What should I restock?", tenant);

        assertTrue(text.contains("No verifiable sales history"));
        assertTrue(text.contains("no replenishment quantities were generated"));
        assertFalse(text.contains("1970-01-01"));
    }

    @Test
    void partialDataGapIsShownAlongsideAvailableSuggestions() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(
                21, 1, List.of(new ReplenishmentSuggestion(1, "VB Cans", "Units", 24, 3.0, 2.0)),
                "DATA_INCOMPLETE", List.of("Shiraz: supplier unavailable"), Instant.now()));

        String text = new ReplenishmentChatBrief(client).brief("What should I restock?", tenant);

        assertTrue(text.contains("VB Cans"));
        assertTrue(text.contains("Some items were excluded because data is missing"));
        assertTrue(text.contains("Shiraz: supplier unavailable"));
    }
}
