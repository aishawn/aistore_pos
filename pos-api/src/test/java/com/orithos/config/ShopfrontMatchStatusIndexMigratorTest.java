package com.orithos.config;

import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ShopfrontMatchStatusIndexMigratorTest {

    @Test
    void doesNotAlterShopfrontSalesWhenBusinessDateColumnAlreadyExists() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        Statement statement = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(connection.getAutoCommit()).thenReturn(true);
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(anyString())).thenAnswer(call -> {
            ResultSet result = mock(ResultSet.class);
            when(result.next()).thenReturn(true);
            when(result.getBoolean(1)).thenReturn(true);
            return result;
        });

        new ShopfrontMatchStatusIndexMigrator(dataSource).run();

        verify(statement, never()).execute(startsWith("ALTER TABLE shopfront_sale"));
        verify(statement).execute(startsWith("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_shopfront_sale_store_biz_ext"));
    }
}
