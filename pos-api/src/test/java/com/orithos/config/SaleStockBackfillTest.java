package com.orithos.config;

import com.orithos.modules.product.mapper.ProductMapper;
import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

class SaleStockBackfillTest {
    @Test
    void excludesShopfrontSalesFromLineRepairAndStockReplay() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        PreparedStatement prepared = mock(PreparedStatement.class);
        Statement statement = mock(Statement.class);
        ResultSet result = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.createStatement()).thenReturn(statement);
        when(connection.prepareStatement(anyString())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("stock_applied = 0")) {
                assertTrue(sql.contains("s.source_system IS DISTINCT FROM 'shopfront'"));
            }
            return prepared;
        });
        when(statement.execute(anyString())).thenAnswer(invocation -> {
            String sql = invocation.getArgument(0);
            if (sql.contains("UPDATE sale_item")) {
                assertTrue(sql.contains("s.source_system IS DISTINCT FROM 'shopfront'"));
            }
            return false;
        });
        when(prepared.executeQuery()).thenReturn(result);
        when(result.next()).thenReturn(true, true, true, false);
        when(result.getInt(1)).thenReturn(1);

        new SaleStockBackfill(dataSource, mock(ProductMapper.class)).run();
    }
}
