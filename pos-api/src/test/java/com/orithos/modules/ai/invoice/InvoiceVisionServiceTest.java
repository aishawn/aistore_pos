package com.orithos.modules.ai.invoice;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class InvoiceVisionServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void parseExtractsHonourDestinyInvoice() {
        TaxInvoiceRead read = InvoiceVisionService.parse("""
                ```json
                {
                  "supplierName": "Honour Destiny Pty Ltd",
                  "abn": "59 155 246 245",
                  "website": "www.honourdestiny.com.au",
                  "invoiceNumber": "Q1JY16",
                  "invoiceDate": "04/09/2026",
                  "customerName": "Savvy Cellars",
                  "customerAddress": "49 Civic Parade, Altona VIC 3018",
                  "attn": "Felix",
                  "phone": "03 9398 3939",
                  "deliveryFee": 0,
                  "gstIncluded": 189.09,
                  "totalPayable": 2080.00,
                  "totalCases": 38,
                  "lines": [
                    {
                      "description": "Asahi Super Dry Bottles 24PK",
                      "brand": "Asahi",
                      "packQty": 24,
                      "qtyCases": 10,
                      "unitPrice": 54.00,
                      "lineTotal": 540.00
                    }
                  ]
                }
                ```
                """, mapper);
        assertNotNull(read);
        assertEquals("Honour Destiny Pty Ltd", read.supplierName());
        assertEquals("Q1JY16", read.invoiceNumber());
        assertEquals(LocalDate.of(2026, 9, 4), read.invoiceDate());
        assertEquals(0, new BigDecimal("2080.00").compareTo(read.totalPayable()));
        assertEquals(1, read.lines().size());
        assertEquals("Asahi Super Dry Bottles 24PK", read.lines().get(0).description());
        assertEquals(0, new BigDecimal("10").compareTo(read.lines().get(0).qtyCases()));
    }

    @Test
    void providerConfigurationDetailsAreNotShownToStaff() {
        String message = InvoiceVisionService.visionFailureMessage(
                "Invoice recognition failed", "qwen-vl-plus", "InvalidParameter");
        assertEquals("Invoice recognition failed: AI provider configuration is invalid. Check the AI configuration and try again.", message);
    }

    @Test
    void arbitraryProviderDetailsAreReplacedWithSafeRetryGuidance() {
        String message = InvoiceVisionService.visionFailureMessage(
                "Invoice recognition failed", "qwen-vl-plus", "unknown_error");

        assertEquals("Invoice recognition failed: The AI provider could not process this image. Try again or contact your administrator.", message);
    }

    @Test
    void providerErrorParserReadsOnlyStructuredErrorCode() throws Exception {
        String payload = "{\"code\":\"InvalidParameter\",\"message\":\"private supplier data\",\"request_id\":\"private-id\"}";

        assertEquals("InvalidParameter", InvoiceVisionService.providerErrorCode(mapper.readTree(payload)));
    }

    @Test
    void missingVisionModelKeepsActionableConfigurationGuidance() {
        String message = InvoiceVisionService.visionFailureMessage(
                "Invoice recognition failed", "qwen-vl-plus", "model_not_found");

        assertTrue(message.contains("qwen-vl-plus"));
        assertTrue(message.contains("AI_DASHSCOPE_BASE_URL"));
    }
}
