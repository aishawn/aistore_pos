package com.orithos.modules.order;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

import static org.junit.jupiter.api.Assertions.assertTrue;

class OrderMapperPageSortTest {

    @Test
    void pagedOrdersUseNaturalFromNameOrderAndStableIds() throws IOException {
        String mapperXml;
        try (var stream = getClass().getClassLoader().getResourceAsStream("mapper/OrderMapper.xml")) {
            if (stream == null) throw new IOException("OrderMapper.xml not found on classpath");
            mapperXml = new String(stream.readAllBytes(), StandardCharsets.UTF_8).replaceAll("\\s+", " ");
        }
        int pageStart = mapperXml.indexOf("<select id=\"page\"");
        int pageEnd = mapperXml.indexOf("</select>", pageStart);
        String pageQuery = mapperXml.substring(pageStart, pageEnd);

        assertTrue(pageQuery.contains("NULLIF(BTRIM(COALESCE(sup.name, from_outlet.name)), '') IS NULL"));
        assertTrue(pageQuery.contains("regexp_matches(lower(COALESCE(sup.name, from_outlet.name, ''))"));
        assertTrue(pageQuery.contains("po.id ASC"));
        assertTrue(pageQuery.contains("LIMIT #{q.size} OFFSET #{q.offset}"));
    }
}
