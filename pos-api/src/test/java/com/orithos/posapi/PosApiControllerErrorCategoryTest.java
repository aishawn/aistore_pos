package com.orithos.posapi;

import static org.junit.jupiter.api.Assertions.assertEquals;

import org.junit.jupiter.api.Test;

class PosApiControllerErrorCategoryTest {
    @Test
    void exposesOnlyASanitizedExceptionType() {
        assertEquals("usererror", PosApiController.safeOdooErrorCategory("odoo.exceptions.UserError"));
        assertEquals("bad_request", PosApiController.safeOdooErrorCategory("Bad-Request"));
        assertEquals("odoo_error", PosApiController.safeOdooErrorCategory(null));
        assertEquals("odoo_error", PosApiController.safeOdooErrorCategory("x".repeat(41)));
    }
}
