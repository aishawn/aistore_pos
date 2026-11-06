package com.orithos.posapi;

import org.junit.jupiter.api.Test;

import java.util.Set;

import static org.junit.jupiter.api.Assertions.assertTrue;

class PosApiControllerResourcesTest {
    @Test
    void exposesThePlannedReadResourceFamilies() {
        assertTrue(PosApiController.supportedResourceNames().containsAll(Set.of(
                "products", "inventory", "sales", "orders", "customers", "suppliers", "purchases",
                "pricing", "classifications", "payment-methods", "outlets", "registers"
        )));
    }
}
