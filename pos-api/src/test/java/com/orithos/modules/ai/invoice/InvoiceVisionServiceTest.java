package com.orithos.modules.ai.invoice;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.time.LocalDate;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

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
}
