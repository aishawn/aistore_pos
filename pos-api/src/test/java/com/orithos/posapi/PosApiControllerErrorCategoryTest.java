package com.orithos.posapi;

import static org.junit.jupiter.api.Assertions.assertEquals;

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
}
