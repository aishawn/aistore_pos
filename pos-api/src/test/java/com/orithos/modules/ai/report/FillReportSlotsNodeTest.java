package com.orithos.modules.ai.report;

import com.alibaba.cloud.ai.graph.OverAllState;
import com.orithos.common.AustraliaTime;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.util.Map;
import java.util.Optional;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class FillReportSlotsNodeTest {

    @Test
    void yesterdayFollowUpClearsPriorRangeLengthAndKeepsProductFilters() {
        ReportPeriodResolver resolver = new ReportPeriodResolver();
        AiReportQuotaService quotaService = mock(AiReportQuotaService.class);
        FillReportSlotsNode node = new FillReportSlotsNode(resolver, quotaService);
        OverAllState state = mock(OverAllState.class);
        LocalDate today = AustraliaTime.today();
        String yesterday = today.minusDays(1).toString();
        when(state.value(anyString())).thenReturn(Optional.empty());
        when(state.value("slots")).thenReturn(Optional.<Object>of(Map.of("category", "wine", "query", "Shiraz")));
        when(state.value("last_slots")).thenReturn(Optional.<Object>of(Map.of(
                "category", "wine", "query", "Shiraz", "days", "7",
                "from", today.minusDays(7).toString(), "to", today.toString())));
        when(state.value("question", String.class)).thenReturn(Optional.of("and yesterday?"));
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        when(state.value("last_intent", String.class)).thenReturn(Optional.of("report_sales"));

        Map<String, Object> result = node.apply(state);
        @SuppressWarnings("unchecked")
        Map<String, String> slots = (Map<String, String>) result.get("slots");

        assertEquals(yesterday, slots.get("from"));
        assertEquals(yesterday, slots.get("to"));
        assertEquals("1", slots.get("days"));
        assertEquals("wine", slots.get("category"));
        assertEquals("Shiraz", slots.get("query"));
    }

    @Test
    void dayBeforeFollowUpUsesThePreviousReportsDateAsItsAnchor() {
        ReportPeriodResolver resolver = new ReportPeriodResolver();
        AiReportQuotaService quotaService = mock(AiReportQuotaService.class);
        FillReportSlotsNode node = new FillReportSlotsNode(resolver, quotaService);
        OverAllState state = mock(OverAllState.class);
        LocalDate today = AustraliaTime.today();
        String yesterday = today.minusDays(1).toString();
        String dayBefore = today.minusDays(2).toString();
        when(state.value(anyString())).thenReturn(Optional.empty());
        when(state.value("slots")).thenReturn(Optional.<Object>of(Map.of(
                "category", "wine", "query", "Shiraz", "from", dayBefore, "to", dayBefore)));
        when(state.value("last_slots")).thenReturn(Optional.<Object>of(Map.of(
                "category", "wine", "query", "Shiraz", "days", "1",
                "from", yesterday, "to", yesterday)));
        when(state.value("question", String.class)).thenReturn(Optional.of("and the day before?"));
        when(state.value("intent", String.class)).thenReturn(Optional.of("report_sales"));
        when(state.value("last_intent", String.class)).thenReturn(Optional.of("report_sales"));

        Map<String, Object> result = node.apply(state);
        @SuppressWarnings("unchecked")
        Map<String, String> slots = (Map<String, String>) result.get("slots");

        assertEquals(dayBefore, slots.get("from"));
        assertEquals(dayBefore, slots.get("to"));
        assertEquals("1", slots.get("days"));
    }
}
