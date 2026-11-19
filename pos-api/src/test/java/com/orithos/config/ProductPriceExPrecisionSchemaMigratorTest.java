package com.orithos.config;

import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProductPriceExPrecisionSchemaMigratorTest {
    @Test
    void widensExistingFourDecimalColumn() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        ResultSet columns = mock(ResultSet.class);
        Statement statement = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("product_price"), isNull())).thenReturn(columns);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("PRODUCT_PRICE"), isNull())).thenReturn(columns);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(connection.createStatement()).thenReturn(statement);
        when(columns.next()).thenReturn(true);
        when(columns.getString("TABLE_NAME")).thenReturn("product_price");
        when(columns.getString("COLUMN_NAME")).thenReturn("price_ex");
        when(columns.getInt("DECIMAL_DIGITS")).thenReturn(4);

        new ProductPriceExPrecisionSchemaMigrator(dataSource).run();

        verify(statement).execute("ALTER TABLE product_price ALTER COLUMN price_ex TYPE DECIMAL(14,6)");
    }

    @Test
    void leavesSixDecimalColumnAlone() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        ResultSet columns = mock(ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("product_price"), isNull())).thenReturn(columns);
        when(columns.next()).thenReturn(true);
        when(columns.getString("TABLE_NAME")).thenReturn("product_price");
        when(columns.getString("COLUMN_NAME")).thenReturn("price_ex");
        when(columns.getInt("DECIMAL_DIGITS")).thenReturn(6);

        new ProductPriceExPrecisionSchemaMigrator(dataSource).run();

        verify(connection, never()).createStatement();
    }
}
