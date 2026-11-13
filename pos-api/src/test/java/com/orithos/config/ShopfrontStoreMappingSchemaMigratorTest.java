package com.orithos.config;

import org.junit.jupiter.api.Test;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.contains;
import static org.mockito.Mockito.when;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.never;

class ShopfrontStoreMappingSchemaMigratorTest {
    @Test
    void runsPostgresMappingMigrationWhenIntegrationIsEnabled() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        Statement statement = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.createStatement()).thenReturn(statement);
        ShopfrontStoreMappingSchemaMigrator migrator = new ShopfrontStoreMappingSchemaMigrator(dataSource, true);

        migrator.run(new DefaultApplicationArguments(new String[0]));

        verify(dataSource).getConnection();
        verify(statement).execute(contains("DO $$"));
    }

    @Test
    void skipsMappingMigrationWhenIntegrationIsDisabled() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        ShopfrontStoreMappingSchemaMigrator migrator = new ShopfrontStoreMappingSchemaMigrator(dataSource, false);

        migrator.run(new DefaultApplicationArguments(new String[0]));

        verify(dataSource, never()).getConnection();
    }

    @Test
    void sqlMigrationSupportsBooleanAndNumericLegacyColumns() throws Exception {
        String sql;
        try (var input = getClass().getClassLoader()
                .getResourceAsStream("db/migration_shopfront_store_mapping_boolean_postgres.sql")) {
            assertTrue(input != null);
            sql = new String(input.readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
        }
        assertTrue(sql.contains("enabled_type = 'boolean'"));
        assertTrue(sql.contains("enabled_type IN ('smallint', 'integer', 'bigint')"));
        assertTrue(sql.contains("USING enabled <> 0"));
        assertFalse(sql.contains("information_schema.COLUMNS"));
    }
}
