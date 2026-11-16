package com.orithos.config;

import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ShopfrontProductCatalogConfirmationSchemaMigratorTest {
    @Test
    void addsConfirmationColumnAndMarksExistingShopfrontMappingsUnconfirmed() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        ResultSet columns = mock(ResultSet.class);
        ResultSet tables = mock(ResultSet.class);
        Statement statement = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("product"), isNull())).thenReturn(columns);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("PRODUCT"), isNull())).thenReturn(columns);
        when(metadata.getTables(nullable(String.class), isNull(), eq("shopfront_product_mapping"), any(String[].class))).thenReturn(tables);
        when(metadata.getTables(nullable(String.class), isNull(), eq("SHOPFRONT_PRODUCT_MAPPING"), any(String[].class))).thenReturn(tables);
        when(connection.createStatement()).thenReturn(statement);
        when(columns.next()).thenReturn(false);
        when(tables.next()).thenReturn(true);
        when(tables.getString("TABLE_NAME")).thenReturn("shopfront_product_mapping");

        new ShopfrontProductCatalogConfirmationSchemaMigrator(dataSource).run();

        verify(statement).execute("ALTER TABLE product ADD COLUMN shopfront_catalog_confirmed BOOLEAN NULL");
        verify(statement).execute("UPDATE product p SET shopfront_catalog_confirmed=FALSE WHERE p.shopfront_catalog_confirmed IS NULL AND EXISTS "
                + "(SELECT 1 FROM shopfront_product_mapping m WHERE m.pos_product_id=p.id AND m.status='MAPPED')");
    }

    @Test
    void backfillsNullLegacyMappingsWithoutChangingConfirmedProducts() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        ResultSet columns = mock(ResultSet.class);
        ResultSet tables = mock(ResultSet.class);
        Statement statement = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("product"), isNull())).thenReturn(columns);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("PRODUCT"), isNull())).thenReturn(columns);
        when(columns.next()).thenReturn(true);
        when(columns.getString("TABLE_NAME")).thenReturn("product");
        when(columns.getString("COLUMN_NAME")).thenReturn("shopfront_catalog_confirmed");
        when(metadata.getTables(nullable(String.class), isNull(), eq("shopfront_product_mapping"), any(String[].class))).thenReturn(tables);
        when(tables.next()).thenReturn(true);
        when(tables.getString("TABLE_NAME")).thenReturn("shopfront_product_mapping");
        when(connection.createStatement()).thenReturn(statement);

        new ShopfrontProductCatalogConfirmationSchemaMigrator(dataSource).run();

        verify(statement, never()).execute("ALTER TABLE product ADD COLUMN shopfront_catalog_confirmed BOOLEAN NULL");
        verify(statement).execute("UPDATE product p SET shopfront_catalog_confirmed=FALSE WHERE p.shopfront_catalog_confirmed IS NULL AND EXISTS "
                + "(SELECT 1 FROM shopfront_product_mapping m WHERE m.pos_product_id=p.id AND m.status='MAPPED')");
    }
}
