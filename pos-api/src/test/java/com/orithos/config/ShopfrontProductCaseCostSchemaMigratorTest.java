package com.orithos.config;

import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.Statement;

import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ShopfrontProductCaseCostSchemaMigratorTest {
    @Test
    void addsExactCaseCostColumnWhenMissing() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        Statement statement = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(connection.getCatalog()).thenReturn("pos");
        when(metadata.getColumns("pos", null, "product", null)).thenReturn(mock(java.sql.ResultSet.class));
        when(metadata.getColumns("pos", null, "PRODUCT", null)).thenReturn(mock(java.sql.ResultSet.class));
        when(connection.createStatement()).thenReturn(statement);

        new ShopfrontProductCaseCostSchemaMigrator(dataSource).run();

        verify(statement).execute("ALTER TABLE product ADD COLUMN case_cost DECIMAL(14,4) NULL");
    }

    @Test
    void leavesExistingCaseCostColumnAlone() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        java.sql.ResultSet columns = mock(java.sql.ResultSet.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(connection.getCatalog()).thenReturn("pos");
        when(metadata.getColumns("pos", null, "product", null)).thenReturn(columns);
        when(columns.next()).thenReturn(true);
        when(columns.getString("TABLE_NAME")).thenReturn("product");
        when(columns.getString("COLUMN_NAME")).thenReturn("case_cost");

        new ShopfrontProductCaseCostSchemaMigrator(dataSource).run();

        verify(connection, never()).createStatement();
    }
}
