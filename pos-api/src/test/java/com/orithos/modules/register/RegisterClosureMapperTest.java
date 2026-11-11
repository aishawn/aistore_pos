package com.orithos.modules.register;

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

class RegisterClosureMapperTest {

    @Test
    void pageAndCountBindOptionalRegisterIdAsTypedNullForPostgres() throws Exception {
        for (String method : new String[]{"page", "count"}) {
            Map<String, Object> params = new HashMap<>();
            params.put("outletId", 87L);
            params.put("registerId", null);
            params.put("size", 20);
            params.put("offset", 0);
            PreparedStatement statement = bind(method, params);
            verify(statement, atLeastOnce()).setNull(anyInt(), eq(Types.BIGINT));
            verify(statement, never()).setNull(anyInt(), eq(Types.OTHER));
        }
    }

    private PreparedStatement bind(String method, Map<String, Object> params) throws Exception {
        Configuration configuration = new Configuration();
        configuration.addMapper(RegisterClosureMapper.class);
        MappedStatement mapped = configuration.getMappedStatement(RegisterClosureMapper.class.getName() + "." + method);
        PreparedStatement statement = mock(PreparedStatement.class);
        new DefaultParameterHandler(mapped, params, mapped.getBoundSql(params)).setParameters(statement);
        return statement;
    }
}
