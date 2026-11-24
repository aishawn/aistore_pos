package com.orithos.modules.ai.replenishment;

import com.orithos.modules.ai.report.TenantContext;
import com.orithos.config.CorrelationIdContext;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;

import java.util.List;
import java.util.Set;
import java.time.Instant;
import java.sql.SQLException;

import org.springframework.dao.DataAccessException;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.security.access.AccessDeniedException;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

@ExtendWith(OutputCaptureExtension.class)
class ReplenishmentChatBriefTest {

    @Test
    void briefListsTopSuggestionsAndCta() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(
                21,
                5,
                List.of(
                        new ReplenishmentSuggestion(1, "VB Cans", "Units", 24, 3.0, 2.0,
                                3d, 3d, null, 6d),
                        new ReplenishmentSuggestion(2, "Shiraz", "Units", 12, 5.0, 1.0,
                                5d, 5d, null, 12d))));

        String text = new ReplenishmentChatBrief(client).brief("What should I restock?", tenant);

        assertTrue(text.contains("Top restock suggestions (21d cover): 5 items need order."));
        assertTrue(text.contains("\n• VB Cans — order 24 (4 cases of 6 units) (≈3.0d left)"));
        assertTrue(text.contains("\n• Shiraz — order 12 (1 case of 12 units)"));
        assertTrue(text.contains("\n\nTap below to review quantities"));
        assertFalse(text.contains("Opening the requested workflow"));
    }

    @Test
    void briefFormatsChineseSuggestionsWithTheSameSourceValues() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(
                21, 5, List.of(new ReplenishmentSuggestion(1, "Shiraz", "Units", 12, 5.0, 1.0,
                        4d, 4d, null, 6d))));

        String text = new ReplenishmentChatBrief(client).brief("哪些商品需要补货？", tenant);

        assertTrue(text.contains("建议补货（覆盖 21 天）：5 个商品需要补货。"));
        assertTrue(text.contains("\n• Shiraz — 建议订购 12（2 箱，每箱 6 件）（约剩 5.0 天）"));
        assertTrue(text.contains("数据来源：Orithos 库存与销售账本；账本最新可用数据时间：未知。"));
        assertTrue(text.contains("打开补货页面审核数量并确认订单。"));
    }

    @Test
    void briefDisclosesUnknownArrivalAndOutOfStockInBothLanguages() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(21, 1,
                List.of(new ReplenishmentSuggestion(1, "VB Cans", "Units", 24, 0d, 0d,
                        0d, 0d, null, 24d))));
        ReplenishmentChatBrief brief = new ReplenishmentChatBrief(client);

        String english = brief.brief("What should I restock, and when will it arrive?", tenant);
        String chinese = brief.brief("哪些商品需要补货，什么时候到货？", tenant);

        assertTrue(english.contains("out of stock"));
        assertTrue(english.contains("supplier lead time not recorded, arrival timing unknown"));
        assertFalse(english.contains("0.0d left"));
        assertTrue(chinese.contains("当前缺货"));
        assertTrue(chinese.contains("供应商交期未记录，到货时间未知"));
        assertFalse(chinese.contains("约剩 0 天"));
    }

    @Test
    void briefLabelsRecordedLeadTimeAsAnEstimateNotAConfirmedArrival() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(21, 1,
                List.of(new ReplenishmentSuggestion(1, "Shiraz", "Units", 12, 5d, 2d,
                        10d, 10d, 3, 6d))));
        ReplenishmentChatBrief brief = new ReplenishmentChatBrief(client);

        String english = brief.brief("What should I restock?", tenant);
        String chinese = brief.brief("哪些商品需要补货？", tenant);

        assertTrue(english.contains("supplier-recorded lead time: about 3 days (not a confirmed arrival date)"));
        assertTrue(chinese.contains("供应商记录交期约 3 天（不是确认到货日期）"));
        assertFalse(english.contains("arrival timing unknown"));
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
    void briefMarksClientFailureUnavailableAndLogsUnknownGapCount(CapturedOutput output) throws Exception {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenThrow(new IllegalStateException("upstream unavailable"));

        String correlationId = "c87e4ba1-fef2-4312-aea7-e38c7f2ee91d";
        String text = CorrelationIdContext.with(correlationId,
                () -> new ReplenishmentChatBrief(client).brief("What should I restock?", tenant));

        assertTrue(text.toLowerCase().contains("unavailable"));
        assertTrue(text.toLowerCase().contains("retry"));
        assertTrue(output.getAll().contains("correlationId=" + correlationId));
        assertTrue(output.getAll().contains("category=service"));
        assertTrue(output.getAll().contains("dataGapCount=unknown"));
        assertTrue(output.getAll().matches("(?s).*elapsedMs=\\d+.*"));
        assertFalse(output.getAll().contains("upstream unavailable"));
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

        assertTrue(text.contains("latest available ledger data at 2026-11-03T04:00:00Z"));
        assertTrue(text.contains("Manual review is required"));
        assertTrue(text.contains("no quantities were generated"));
    }

    @Test
    void incompleteBriefSeparatesInventoryAndSupplierDataGapsInBothLanguages() {
        NativeReplenishmentService client = mock(NativeReplenishmentService.class);
        TenantContext tenant = new TenantContext(1L, 1L, 1L, List.of(1L), Set.of("ROLE_ADMIN"));
        when(client.plan(tenant)).thenReturn(new ReplenishmentPlan(
                21, 0, List.of(), "DATA_INCOMPLETE",
                List.of("VB Cans: inventory data stale", "Shiraz: supplier unavailable"),
                Instant.parse("2026-11-03T04:00:00Z"), 3, 2, 1));

        String english = new ReplenishmentChatBrief(client).brief("What should I restock?", tenant);
        String chinese = new ReplenishmentChatBrief(client).brief("哪些商品需要补货？", tenant);

        assertTrue(english.contains("inventory is negative, stale or missing required data for 2 items"));
        assertTrue(english.contains("supplier details are incomplete for 1 item"));
        assertTrue(chinese.contains("库存为负数或库存资料缺失、过期 2 项"));
        assertTrue(chinese.contains("供应商资料不完整 1 项"));
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
        assertTrue(text.contains("Some items are excluded pending data review"));
        assertTrue(text.contains("Shiraz: supplier unavailable"));

        String chinese = new ReplenishmentChatBrief(client).brief("哪些商品需要补货？", tenant);
        assertTrue(chinese.contains("部分商品因数据不全暂未纳入："));
        assertTrue(chinese.contains("Shiraz: supplier unavailable"));
    }
}
