package com.orithos.modules.order;

import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.lang.reflect.Method;
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

    @Test
    void expiryReviewSqlFiltersByOptionalReceiptDateType() throws NoSuchMethodException {
        Method method = OrderMapper.class.getMethod("findExpiryReview", Long.class, Long.class,
                java.time.LocalDate.class, java.time.LocalDate.class, String.class, String.class, long.class);
        String query = String.join(" ", method.getAnnotation(org.apache.ibatis.annotations.Select.class).value())
                .replaceAll("\\s+", " ");

        assertTrue(query.contains("#{dateType,jdbcType=VARCHAR} IS NULL OR b.date_type = #{dateType,jdbcType=VARCHAR}"));
    }
}
