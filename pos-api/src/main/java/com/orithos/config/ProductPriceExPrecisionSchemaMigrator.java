package com.orithos.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.DatabaseMetaData;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/** Preserves Shopfront's six-decimal product price tiers. */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 19)
public class ProductPriceExPrecisionSchemaMigrator implements CommandLineRunner {
    private static final Logger log = LoggerFactory.getLogger(ProductPriceExPrecisionSchemaMigrator.class);
    private static final String AI_PRODUCT_VIEW_NAME = "ai_rpt_product";
    private final DataSource dataSource;

    public ProductPriceExPrecisionSchemaMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try (Connection connection = dataSource.getConnection()) {
            DatabaseMetaData metadata = connection.getMetaData();
            String catalog = connection.getCatalog();
            int priceScale = columnScale(metadata, catalog, "price");
            int priceExScale = columnScale(metadata, catalog, "price_ex");
            if (priceScale < 0 || priceExScale < 0) {
                throw new IllegalStateException("product_price price columns do not exist");
            }
            if (priceScale >= 6 && priceExScale >= 6) return;
            String database = metadata.getDatabaseProductName();
            String normalizedDatabase = database == null ? "" : database.toLowerCase(java.util.Locale.ROOT);
            String alter = normalizedDatabase.contains("mysql") || normalizedDatabase.contains("mariadb")
                    ? "ALTER TABLE product_price MODIFY COLUMN price DECIMAL(14,6) NOT NULL, "
                    + "MODIFY COLUMN price_ex DECIMAL(14,6) NULL"
                    : "ALTER TABLE product_price ALTER COLUMN price TYPE DECIMAL(14,6), "
                    + "ALTER COLUMN price_ex TYPE DECIMAL(14,6)";
            if (normalizedDatabase.contains("postgres")) {
                widenPostgresColumns(connection, alter);
            } else {
                try (Statement statement = connection.createStatement()) {
                    statement.execute(alter);
                }
            }
            log.info("Ensured product_price price and price_ex use six decimal places (previous scales: {}, {})",
                    priceScale, priceExScale);
        } catch (Exception e) {
            log.error("Could not ensure product_price.price_ex precision", e);
            throw new IllegalStateException("Shopfront product price precision schema is unavailable", e);
        }
    }

    private void widenPostgresColumns(Connection connection, String alter) throws Exception {
        boolean previousAutoCommit = connection.getAutoCommit();
        connection.setAutoCommit(false);
        try (Statement statement = connection.createStatement()) {
            List<DependentView> dependentViews = findDependentViews(statement);
            List<String> unexpectedViews = dependentViews.stream()
                    .filter(view -> !view.name().equals(AI_PRODUCT_VIEW_NAME)
                            || !(view.schema().equals("public") || view.schema().matches("orithos_o[0-9]+")))
                    .map(view -> view.schema() + "." + view.name())
                    .toList();
            if (!unexpectedViews.isEmpty()) {
                throw new IllegalStateException("Cannot widen product_price while unsupported views depend on it: "
                        + String.join(", ", unexpectedViews));
            }
            for (DependentView view : dependentViews) {
                statement.execute("DROP VIEW " + quoteIdentifier(view.schema()) + "." + quoteIdentifier(view.name()));
            }
            statement.execute(alter);
            dependentViews.stream()
                    .sorted(Comparator.comparingInt(DependentView::depth))
                    .forEach(view -> recreateView(statement, view));
            connection.commit();
        } catch (Exception e) {
            connection.rollback();
            throw e;
        } finally {
            connection.setAutoCommit(previousAutoCommit);
        }
    }

    private record ViewGrant(String grantee, String privilege, boolean grantable) {}

    private record DependentView(String schema, String name, int depth, String definition,
                                 String owner, List<ViewGrant> grants) {}

    private static final class ViewDescriptor {
        private final String schema;
        private final String name;
        private final int depth;
        private final String definition;
        private final String owner;
        private final Set<ViewGrant> grants = new LinkedHashSet<>();

        private ViewDescriptor(String schema, String name, int depth, String definition, String owner) {
            this.schema = schema;
            this.name = name;
            this.depth = depth;
            this.definition = definition;
            this.owner = owner;
        }

        private DependentView toView() {
            return new DependentView(schema, name, depth, definition, owner, List.copyOf(grants));
        }
    }

    private List<DependentView> findDependentViews(Statement statement) throws Exception {
        String sql = """
                WITH RECURSIVE dependent_views(oid, schema_name, view_name, depth, path) AS (
                    SELECT DISTINCT view_class.oid, view_schema.nspname, view_class.relname, 0,
                           ARRAY[view_class.oid]
                    FROM pg_depend dependency
                    JOIN pg_rewrite rewrite_rule ON rewrite_rule.oid = dependency.objid
                    JOIN pg_class view_class ON view_class.oid = rewrite_rule.ev_class AND view_class.relkind = 'v'
                    JOIN pg_namespace view_schema ON view_schema.oid = view_class.relnamespace
                    WHERE dependency.refobjid = 'public.product_price'::regclass
                      AND dependency.refobjsubid IN (
                          SELECT attnum FROM pg_attribute
                          WHERE attrelid = 'public.product_price'::regclass
                            AND attname IN ('price', 'price_ex')
                      )
                    UNION
                    SELECT DISTINCT child_class.oid, child_schema.nspname, child_class.relname,
                           parent.depth + 1, parent.path || child_class.oid
                    FROM dependent_views parent
                    JOIN pg_depend dependency ON dependency.refobjid = parent.oid
                    JOIN pg_rewrite rewrite_rule ON rewrite_rule.oid = dependency.objid
                    JOIN pg_class child_class ON child_class.oid = rewrite_rule.ev_class AND child_class.relkind = 'v'
                    JOIN pg_namespace child_schema ON child_schema.oid = child_class.relnamespace
                    WHERE NOT child_class.oid = ANY(parent.path)
                )
                SELECT dependency.schema_name, dependency.view_name, max(dependency.depth) AS depth,
                       pg_get_viewdef(view_class.oid, true) AS definition,
                       pg_get_userbyid(view_class.relowner) AS owner_name,
                       CASE WHEN grant_entry.grantee = 0 THEN 'PUBLIC'
                            ELSE pg_get_userbyid(grant_entry.grantee) END AS grantee,
                       grant_entry.privilege_type, grant_entry.is_grantable
                FROM dependent_views dependency
                JOIN pg_class view_class ON view_class.oid = dependency.oid
                LEFT JOIN LATERAL (
                    SELECT grants.grantee, grants.privilege_type, grants.is_grantable
                    FROM aclexplode(view_class.relacl) grants
                    WHERE grants.grantee = 0 OR grants.grantee <> view_class.relowner
                ) grant_entry ON true
                GROUP BY dependency.schema_name, dependency.view_name, view_class.oid,
                         view_class.relowner, grant_entry.grantee, grant_entry.privilege_type, grant_entry.is_grantable
                ORDER BY max(dependency.depth) DESC, dependency.schema_name, dependency.view_name
                """;
        Map<String, ViewDescriptor> views = new LinkedHashMap<>();
        try (ResultSet rows = statement.executeQuery(sql)) {
            while (rows.next()) {
                String schema = rows.getString("schema_name");
                String name = rows.getString("view_name");
                String key = schema + "\u0000" + name;
                int depth = rows.getInt("depth");
                ViewDescriptor view = views.computeIfAbsent(key, ignored -> {
                    try {
                        return new ViewDescriptor(schema, name, depth,
                                rows.getString("definition"), rows.getString("owner_name"));
                    } catch (Exception e) {
                        throw new IllegalStateException("Could not read dependent product price view", e);
                    }
                });
                String grantee = rows.getString("grantee");
                String privilege = rows.getString("privilege_type");
                if (grantee != null && privilege != null) {
                    view.grants.add(new ViewGrant(grantee, privilege, rows.getBoolean("is_grantable")));
                }
            }
        }
        return views.values().stream().map(ViewDescriptor::toView).toList();
    }

    private void recreateView(Statement statement, DependentView view) {
        String qualifiedName = quoteIdentifier(view.schema()) + "." + quoteIdentifier(view.name());
        try {
            statement.execute("CREATE VIEW " + qualifiedName + " AS " + view.definition());
            statement.execute("ALTER VIEW " + qualifiedName + " OWNER TO " + quoteIdentifier(view.owner()));
            for (ViewGrant grant : view.grants()) {
                String grantee = grant.grantee().equals("PUBLIC") ? "PUBLIC" : quoteIdentifier(grant.grantee());
                String grantOption = grant.grantable() ? " WITH GRANT OPTION" : "";
                statement.execute("GRANT " + grant.privilege() + " ON " + qualifiedName + " TO " + grantee + grantOption);
            }
        } catch (Exception e) {
            throw new IllegalStateException("Could not restore dependent product price view " + qualifiedName, e);
        }
    }

    private String quoteIdentifier(String identifier) {
        return "\"" + identifier.replace("\"", "\"\"") + "\"";
    }

    private int columnScale(DatabaseMetaData metadata, String catalog, String columnName) throws Exception {
        for (String table : new String[]{"product_price", "PRODUCT_PRICE"}) {
            try (ResultSet columns = metadata.getColumns(catalog, null, table, null)) {
                while (columns.next()) {
                    if ("product_price".equalsIgnoreCase(columns.getString("TABLE_NAME"))
                            && columnName.equalsIgnoreCase(columns.getString("COLUMN_NAME"))) {
                        return columns.getInt("DECIMAL_DIGITS");
                    }
                }
            }
        }
        return -1;
    }
}
