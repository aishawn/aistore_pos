package com.orithos.modules.integration;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertTrue;

class ShopfrontProductCostBindingTest {
    @Test
    void exactCaseCostParameterIsCastToPostgresNumeric() throws IOException {
        String source = Files.readString(Path.of(
                "src/main/java/com/orithos/modules/integration/ShopfrontIntegrationController.java"));

        assertTrue(source.contains("case_cost=CASE WHEN ? THEN CAST(? AS numeric) ELSE NULL END"));
    }
}
