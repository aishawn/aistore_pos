package com.orithos.modules.product;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProductMapperCostPercentageSqlTest {

    @Test
    void writesBooleanCostPercentageAsSmallintForInsertAndUpdate() throws IOException {
        String mapper = Files.readString(Path.of("src/main/resources/mapper/ProductMapper.xml"));
        String schema = Files.readString(Path.of("src/main/resources/db/schema.sql"));
        String conversion = "CAST(CASE WHEN #{p.costPercentage} THEN 1 ELSE 0 END AS SMALLINT)";

        assertEquals(4, occurrences(mapper, conversion));
        assertFalse(mapper.contains("cost_percentage = #{p.costPercentage}"));
        assertFalse(mapper.contains("cost_percentage IS DISTINCT FROM #{p.costPercentage}"));
        assertTrue(schema.contains("cost_percentage SMALLINT"));
    }

    private static int occurrences(String source, String value) {
        return (source.length() - source.replace(value, "").length()) / value.length();
    }
}
