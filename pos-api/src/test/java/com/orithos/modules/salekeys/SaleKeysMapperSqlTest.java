package com.orithos.modules.salekeys;

import org.apache.ibatis.annotations.Delete;
import org.apache.ibatis.annotations.Insert;
import org.apache.ibatis.annotations.Select;
import org.apache.ibatis.annotations.Update;
import org.junit.jupiter.api.Test;

import java.lang.reflect.Method;

import static org.junit.jupiter.api.Assertions.assertAll;
import static org.junit.jupiter.api.Assertions.assertTrue;

class SaleKeysMapperSqlTest {

    @Test
    void everySaleKeyQueryAndMutationIsScopedToAnOutlet() throws Exception {
        assertAll(
                () -> assertOutletScope(sql("findAllByOutlet", Long.class)),
                () -> assertOutletScope(sql("findByIdAndOutlet", Long.class, Long.class)),
                () -> assertOutletScope(sql("insert", SaleKeys.class)),
                () -> assertOutletScope(sql("updateByIdAndOutlet", Long.class, Long.class, String.class, String.class)),
                () -> assertOutletScope(sql("deleteByIdAndOutlet", Long.class, Long.class))
        );
    }

    private static String sql(String methodName, Class<?>... parameterTypes) throws Exception {
        Method method = SaleKeysMapper.class.getMethod(methodName, parameterTypes);
        Select select = method.getAnnotation(Select.class);
        if (select != null) return String.join(" ", select.value());
        Insert insert = method.getAnnotation(Insert.class);
        if (insert != null) return String.join(" ", insert.value());
        Update update = method.getAnnotation(Update.class);
        if (update != null) return String.join(" ", update.value());
        Delete delete = method.getAnnotation(Delete.class);
        if (delete != null) return String.join(" ", delete.value());
        throw new AssertionError("No SQL annotation for " + methodName);
    }

    private static void assertOutletScope(String sql) {
        String normalized = sql.toLowerCase().replaceAll("\\s+", " ");
        assertTrue(normalized.contains("outlet_id"), "SQL must write or filter outlet_id: " + sql);
        assertTrue(normalized.contains("#{outletid}"), "SQL must bind the current outlet: " + sql);
    }
}
