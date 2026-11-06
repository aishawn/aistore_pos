package com.orithos.posapi;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

class PosApiControllerErrorCategoryTest {
    @Test
    void exposesOnlyASanitizedExceptionType() {
        assertEquals("usererror", PosApiController.safeOdooErrorCategory("odoo.exceptions.UserError"));
        assertEquals("bad_request", PosApiController.safeOdooErrorCategory("Bad-Request"));
        assertEquals("odoo_error", PosApiController.safeOdooErrorCategory(null));
        assertEquals("odoo_error", PosApiController.safeOdooErrorCategory("x".repeat(41)));
    }

    @Test
    void formatsOdooDateTimesWithoutFractionalSeconds() {
        assertEquals("2026-11-06 12:34:56", PosApiController.odooDateTime(
                LocalDateTime.of(2026, 11, 6, 12, 34, 56, 927_868_987)));
    }

    @Test
    void salesDetailExposesRefundableOdooLineData() throws Exception {
        ObjectMapper mapper = new ObjectMapper();
        JsonNode source = mapper.readTree("""
                {"id":15791754,"product_id":[83,"Product"],"qty":1,"refunded_qty":0,
                 "price_unit":2.99,"discount":0,"tax_ids":[]}
                """);

        var line = PosApiController.saleLineView(mapper, source);

        assertEquals(15791754L, line.path("id").asLong());
        assertEquals(83L, line.path("productId").asLong());
        assertEquals(0, line.path("refundableQuantity").decimalValue().compareTo(java.math.BigDecimal.ONE));
        assertEquals(0, line.path("unitPrice").decimalValue().compareTo(new java.math.BigDecimal("2.99")));
        assertEquals(1, line.path("uomFactor").asInt());
    }
}
