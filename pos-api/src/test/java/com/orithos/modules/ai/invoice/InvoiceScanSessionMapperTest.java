package com.orithos.modules.ai.invoice;

import org.apache.ibatis.mapping.MappedStatement;
import org.apache.ibatis.scripting.defaults.DefaultParameterHandler;
import org.apache.ibatis.session.Configuration;
import org.junit.jupiter.api.Test;

import java.sql.PreparedStatement;
import java.sql.Types;
import java.util.HashMap;
import java.util.Map;

import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;

class InvoiceScanSessionMapperTest {

    @Test
    void optionalListAndCountFiltersBindTypedNullsForPostgres() throws Exception {
        for (String method : new String[]{"list", "count"}) {
            for (String status : new String[]{null, "draft"}) {
                for (String query : new String[]{null, "invoice"}) {
                    Map<String, Object> params = new HashMap<>();
                    params.put("vendorId", 42L);
                    params.put("status", status);
                    params.put("query", query);
                    params.put("limit", 50);
                    params.put("offset", 0);
                    PreparedStatement statement = bind(method, params);
                    verify(statement, never()).setNull(anyInt(), eq(Types.OTHER));
                    if (status == null || query == null) {
                        verify(statement, atLeastOnce()).setNull(anyInt(), eq(Types.VARCHAR));
                    }
                }
            }
        }
    }

    @Test
    void duplicateLookupBindsOptionalSupplierIdentityWithItsSqlType() throws Exception {
        Map<String, Object> params = new HashMap<>();
        params.put("vendorId", 42L);
        params.put("invoiceNumber", "INV-1");
        params.put("supplierId", null);
        params.put("supplierAbn", null);
        PreparedStatement statement = bind("findDuplicateIds", params);
        verify(statement, atLeastOnce()).setNull(anyInt(), eq(Types.BIGINT));
        verify(statement, atLeastOnce()).setNull(anyInt(), eq(Types.VARCHAR));
        verify(statement, never()).setNull(anyInt(), eq(Types.OTHER));
    }

    private PreparedStatement bind(String method, Map<String, Object> params) throws Exception {
        Configuration configuration = new Configuration();
        configuration.addMapper(InvoiceScanSessionMapper.class);
        MappedStatement mapped = configuration.getMappedStatement(InvoiceScanSessionMapper.class.getName() + "." + method);
        PreparedStatement statement = mock(PreparedStatement.class);
        new DefaultParameterHandler(mapped, params, mapped.getBoundSql(params)).setParameters(statement);
        return statement;
    }
}
