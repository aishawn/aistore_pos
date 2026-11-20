package com.orithos.modules.product;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Pattern;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class ProductMapperCostPercentageSqlTest {

    @Test
    void writesBooleanFlagsAsSmallintForInsertAndUpdate() throws IOException {
        String mapper = Files.readString(Path.of("src/main/resources/mapper/ProductMapper.xml"));
        String schema = Files.readString(Path.of("src/main/resources/db/schema.sql"));

        assertConverted(mapper, schema, "cost_percentage", "costPercentage", 4);
        assertConverted(mapper, schema, "prevent_manual_discounts", "preventManualDiscounts", 2);
        assertConverted(mapper, schema, "request_price", "requestPrice", 2);
        assertConverted(mapper, schema, "request_quantity", "requestQuantity", 2);
        assertConverted(mapper, schema, "track_inventory", "trackInventory", 2);
        assertConverted(mapper, schema, "show_shortcuts", "showShortcuts", 2);
    }

    private static void assertConverted(String mapper, String schema, String column, String property,
                                        int expectedConversions) {
        String conversion = "CAST(CASE WHEN #{p." + property + "} THEN 1 ELSE 0 END AS SMALLINT)";
        assertEquals(expectedConversions, occurrences(mapper, conversion), column);
        assertFalse(mapper.contains(column + " = #{p." + property + "}"), column);
        assertTrue(Pattern.compile("\\b" + column + "\\s+SMALLINT\\b")
                .matcher(schema).find(), column);
    }

    private static int occurrences(String source, String value) {
        return (source.length() - source.replace(value, "").length()) / value.length();
    }
}
