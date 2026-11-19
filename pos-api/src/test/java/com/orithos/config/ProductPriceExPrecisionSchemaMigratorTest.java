package com.orithos.config;

import org.junit.jupiter.api.Test;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.ArgumentMatchers.isNull;
import static org.mockito.ArgumentMatchers.nullable;
import static org.mockito.ArgumentMatchers.startsWith;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

class ProductPriceExPrecisionSchemaMigratorTest {
    @Test
    void widensExistingFourDecimalColumn() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        ResultSet columns = mock(ResultSet.class);
        ResultSet dependentViews = mock(ResultSet.class);
        Statement statement = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("product_price"), isNull())).thenReturn(columns);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("PRODUCT_PRICE"), isNull())).thenReturn(columns);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(startsWith("WITH RECURSIVE"))).thenReturn(dependentViews);
        when(dependentViews.next()).thenReturn(false);
        when(columns.getString("TABLE_NAME")).thenReturn("product_price");
        when(columns.getString("COLUMN_NAME")).thenReturn("price", "price_ex");
        when(columns.getInt("DECIMAL_DIGITS")).thenReturn(4);
        when(columns.next()).thenReturn(true, false, true, false);

        new ProductPriceExPrecisionSchemaMigrator(dataSource).run();

        verify(statement).execute("ALTER TABLE product_price ALTER COLUMN price TYPE DECIMAL(14,6), ALTER COLUMN price_ex TYPE DECIMAL(14,6)");
    }

    @Test
    void dropsDependentAiProductViewBeforeWideningAndRunsBeforeReportViewsAreRecreated() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        ResultSet columns = mock(ResultSet.class);
        ResultSet dependentViews = mock(ResultSet.class);
        Statement statement = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("product_price"), isNull())).thenReturn(columns);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("PRODUCT_PRICE"), isNull())).thenReturn(columns);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(startsWith("WITH RECURSIVE"))).thenReturn(dependentViews);
        when(columns.getString("TABLE_NAME")).thenReturn("product_price");
        when(columns.getString("COLUMN_NAME")).thenReturn("price", "price_ex");
        when(columns.getInt("DECIMAL_DIGITS")).thenReturn(4);
        when(columns.next()).thenReturn(true, false, true, false);
        when(dependentViews.next()).thenReturn(true, true, true, false);
        when(dependentViews.getString("schema_name")).thenReturn("orithos_o1", "orithos_o87", "public");
        when(dependentViews.getString("view_name")).thenReturn("ai_rpt_product");
        when(dependentViews.getInt("depth")).thenReturn(1, 1, 0);
        when(dependentViews.getString("definition")).thenReturn(
                "SELECT list_price FROM public.ai_rpt_product WHERE outlet_id = 1",
                "SELECT list_price FROM public.ai_rpt_product WHERE outlet_id = 87",
                "SELECT p.id, price.list_price FROM product p LEFT JOIN LATERAL (SELECT pp.price AS list_price FROM product_price pp) price ON true");
        when(dependentViews.getString("owner_name")).thenReturn("postgres");
        when(dependentViews.getString("grantee")).thenReturn("orithos_ai_ro_o1", "orithos_ai_ro_o87", null);
        when(dependentViews.getString("privilege_type")).thenReturn("SELECT", "SELECT", null);
        when(dependentViews.getBoolean("is_grantable")).thenReturn(false, false, false);

        new ProductPriceExPrecisionSchemaMigrator(dataSource).run();

        var order = inOrder(statement);
        order.verify(statement).executeQuery(startsWith("WITH RECURSIVE"));
        order.verify(statement).execute("DROP VIEW \"orithos_o1\".\"ai_rpt_product\"");
        order.verify(statement).execute("DROP VIEW \"orithos_o87\".\"ai_rpt_product\"");
        order.verify(statement).execute("DROP VIEW \"public\".\"ai_rpt_product\"");
        order.verify(statement).execute("ALTER TABLE product_price ALTER COLUMN price TYPE DECIMAL(14,6), ALTER COLUMN price_ex TYPE DECIMAL(14,6)");
        order.verify(statement).execute(startsWith("CREATE VIEW \"public\".\"ai_rpt_product\" AS"));
        order.verify(statement).execute("ALTER VIEW \"public\".\"ai_rpt_product\" OWNER TO \"postgres\"");
        order.verify(statement).execute(startsWith("CREATE VIEW \"orithos_o1\".\"ai_rpt_product\" AS"));
        order.verify(statement).execute("GRANT SELECT ON \"orithos_o1\".\"ai_rpt_product\" TO \"orithos_ai_ro_o1\"");
        order.verify(statement).execute(startsWith("CREATE VIEW \"orithos_o87\".\"ai_rpt_product\" AS"));
        order.verify(statement).execute("GRANT SELECT ON \"orithos_o87\".\"ai_rpt_product\" TO \"orithos_ai_ro_o87\"");
        assertTrue(ProductPriceExPrecisionSchemaMigrator.class.getAnnotation(org.springframework.core.annotation.Order.class).value()
                < AiReportSchemaMigrator.class.getAnnotation(org.springframework.core.annotation.Order.class).value());
    }

    @Test
    void refusesToDropUnknownViewsAndRollsBackThePrecisionMigration() throws Exception {
        DataSource dataSource = mock(DataSource.class);
        Connection connection = mock(Connection.class);
        DatabaseMetaData metadata = mock(DatabaseMetaData.class);
        ResultSet columns = mock(ResultSet.class);
        ResultSet dependentViews = mock(ResultSet.class);
        Statement statement = mock(Statement.class);
        when(dataSource.getConnection()).thenReturn(connection);
        when(connection.getMetaData()).thenReturn(metadata);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("product_price"), isNull())).thenReturn(columns);
        when(metadata.getColumns(nullable(String.class), isNull(), eq("PRODUCT_PRICE"), isNull())).thenReturn(columns);
        when(metadata.getDatabaseProductName()).thenReturn("PostgreSQL");
        when(connection.createStatement()).thenReturn(statement);
        when(statement.executeQuery(startsWith("WITH RECURSIVE"))).thenReturn(dependentViews);
        when(columns.getString("TABLE_NAME")).thenReturn("product_price");
        when(columns.getString("COLUMN_NAME")).thenReturn("price", "price_ex");
        when(columns.getInt("DECIMAL_DIGITS")).thenReturn(4);
        when(columns.next()).thenReturn(true, false, true, false);
        when(dependentViews.next()).thenReturn(true, false);
        when(dependentViews.getString("schema_name")).thenReturn("public", "orithos_o87");
        when(dependentViews.getString("view_name")).thenReturn("custom_price_view");

        assertThrows(IllegalStateException.class, () -> new ProductPriceExPrecisionSchemaMigrator(dataSource).run());

        verify(connection).rollback();
        verify(statement, never()).execute(startsWith("ALTER TABLE product_price"));
        verify(statement, never()).execute(startsWith("DROP VIEW"));
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
        when(metadata.getColumns(nullable(String.class), isNull(), eq("PRODUCT_PRICE"), isNull())).thenReturn(columns);
        when(columns.getString("TABLE_NAME")).thenReturn("product_price");
        when(columns.getString("COLUMN_NAME")).thenReturn("price", "price_ex");
        when(columns.getInt("DECIMAL_DIGITS")).thenReturn(6);
        when(columns.next()).thenReturn(true, false, true, false);

        new ProductPriceExPrecisionSchemaMigrator(dataSource).run();

        verify(connection, never()).createStatement();
    }
}
