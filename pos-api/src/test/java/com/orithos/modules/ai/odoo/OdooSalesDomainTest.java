package com.orithos.modules.ai.odoo;

import org.junit.jupiter.api.Test;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class OdooSalesDomainTest {
    @Test
    void scopesSalesToPosConfigWhenBindingExists() {
        List<Object> domain = OdooSalesDomain.forCompany(7L, 42L, List.of("paid"));

        assertTrue(domain.contains(List.of("order_id.company_id", "=", 7L)));
        assertTrue(domain.contains(List.of("order_id.config_id", "=", 42L)));
    }

    @Test
    void keepsCompanyScopeWhenPosConfigIsNotProvisioned() {
        List<Object> domain = OdooSalesDomain.forCompany(7L, null, List.of("paid"));

        assertFalse(domain.toString().contains("config_id"));
    }
}
