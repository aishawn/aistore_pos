package com.orithos.modules.report;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import static org.springframework.http.HttpMethod.GET;

class ShopfrontPurchaseReportServiceTest {

    @Test
    void purchaseReportUsesShopfrontAmountsAndChargeFields() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        doReturn(1).when(jdbc).queryForObject(contains("SELECT COUNT(*) FROM outlet"), eq(Integer.class), eq(87L), eq(55L));
        RestClient.Builder builder = RestClient.builder();
        MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
        server.expect(requestTo(org.hamcrest.Matchers.containsString(
                        "/api/source-reports/purchase?store=skr&from=2026-11-12&to=2026-11-12&groupBy=outlet")))
                .andExpect(method(GET))
                .andExpect(header("Authorization", "Bearer crawler-token"))
                .andRespond(withSuccess("""
                        {
                          "source":"shopfront_reporting_api",
                          "data":[{
                            "Name":"Cellarbrations at St Kilda Road",
                            "Orders":6,
                            "Total Cost":"$8,576.94",
                            "Fees":"$4.95",
                            "Freight":"$0.00",
                            "Payment Fees":"$0.00",
                            "Tax Amount":"$785.29"
                          }],
                          "pagination":{"total":1},
                          "freshness":"fresh",
                          "cache":"refreshed",
                          "fetched_at":"2026-11-12T23:52:50.707109"
                        }
                        """, MediaType.APPLICATION_JSON));

        ShopfrontPurchaseReportService service = new ShopfrontPurchaseReportService(
                jdbc, builder, "http://crawler", "skr", "crawler-token");
        Map<String, Object> report = service.purchaseReport(
                55L, 87L, LocalDate.of(2026, 11, 12), LocalDate.of(2026, 11, 12), "outlet");

        assertEquals("shopfront_reporting_api", report.get("source"));
        @SuppressWarnings("unchecked")
        Map<String, Object> totals = (Map<String, Object>) report.get("totals");
        assertEquals(6L, totals.get("orderCount"));
        assertEquals(new BigDecimal("8576.94"), totals.get("totalCost"));
        assertEquals(new BigDecimal("4.95"), totals.get("fees"));
        assertEquals(new BigDecimal("0.00"), totals.get("freight"));
        assertEquals(new BigDecimal("0.00"), totals.get("paymentFees"));
        assertEquals(new BigDecimal("785.29"), totals.get("taxAmount"));
        assertTrue((Boolean) report.get("feesAvailable"));
        assertTrue((Boolean) report.get("taxAvailable"));
        server.verify();
    }
}
