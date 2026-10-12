package com.orithos.modules.ai.report;

import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.ExpressionVisitorAdapter;
import net.sf.jsqlparser.expression.Parenthesis;
import net.sf.jsqlparser.expression.operators.conditional.AndExpression;
import net.sf.jsqlparser.expression.operators.conditional.OrExpression;
import net.sf.jsqlparser.expression.operators.relational.EqualsTo;
import net.sf.jsqlparser.expression.operators.relational.InExpression;
import net.sf.jsqlparser.expression.operators.relational.ParenthesedExpressionList;
import net.sf.jsqlparser.schema.Column;
import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.statement.ParenthesedStatement;
import net.sf.jsqlparser.statement.select.FromItem;
import net.sf.jsqlparser.statement.select.Join;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.WithItem;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.function.Consumer;

final class SqlAst {

    record Scan(Table table, String aliasOrName, AiReportTableCatalog.Policy policy) {}

    private SqlAst() {}

    static String ident(String raw) {
        return raw == null ? "" : raw.replace("`", "").toLowerCase(Locale.ROOT);
    }

    static boolean isSchemaQualified(Table table) {
        if (table == null) {
            return false;
        }
        if (notBlank(table.getSchemaName()) || notBlank(table.getDatabaseName())
                || notBlank(table.getCatalogName())) {
            return true;
        }
        String fqn = table.getFullyQualifiedName();
        return fqn != null && fqn.contains(".");
    }

    private static boolean notBlank(String v) {
        return v != null && !v.isBlank();
    }

    static String tableName(Table table) {
        if (table == null) {
            return "";
        }
        return AiReportTableCatalog.bareName(table.getName());
    }

    static String aliasOrName(Table table) {
        if (table == null) {
            return "";
        }
        if (table.getAlias() != null && table.getAlias().getName() != null) {
            return ident(table.getAlias().getName());
        }
        return tableName(table);
    }

    static Column qualifiedColumn(Table table, String column) {
        String alias = aliasOrName(table);
        if (alias.isBlank()) {
            return new Column(column);
        }
        return new Column(new Table(alias), column);
    }

    static Expression wrap(Expression expr) {
        if (expr instanceof Parenthesis || expr instanceof AndExpression || expr instanceof EqualsTo) {
            return expr;
        }
        return new ParenthesedExpressionList<>(expr);
    }

    static boolean isTenantColumn(Expression expr) {
        if (!(expr instanceof Column col) || col.getColumnName() == null) {
            return false;
        }
        String name = ident(col.getColumnName());
        return "outlet_id".equals(name) || "vendor_id".equals(name);
    }

    static String columnName(Column col) {
        return col == null ? "" : ident(col.getColumnName());
    }

    static String columnQualifier(Column col) {
        if (col == null) {
            return null;
        }
        if (col.getTable() != null) {
            if (col.getTable().getAlias() != null && col.getTable().getAlias().getName() != null) {
                return ident(col.getTable().getAlias().getName());
            }
            if (col.getTable().getName() != null) {
                return ident(col.getTable().getName());
            }
        }
        String prefix = col.getTableName();
        return prefix == null || prefix.isBlank() ? null : ident(prefix);
    }

    static Expression stripTenantPredicates(Expression expr) {
        if (expr == null) {
            return null;
        }
        if (expr instanceof Parenthesis p) {
            Expression inner = stripTenantPredicates(p.getExpression());
            return inner == null ? null : new ParenthesedExpressionList<>(inner);
        }
        if (expr instanceof ParenthesedExpressionList<?> list && list.size() == 1) {
            Expression inner = stripTenantPredicates(list.get(0));
            return inner == null ? null : new ParenthesedExpressionList<>(inner);
        }
        if (expr instanceof AndExpression and) {
            Expression left = stripTenantPredicates(and.getLeftExpression());
            Expression right = stripTenantPredicates(and.getRightExpression());
            if (left == null) {
                return right;
            }
            if (right == null) {
                return left;
            }
            return new AndExpression(left, right);
        }
        if (expr instanceof OrExpression or) {
            Expression left = stripTenantPredicates(or.getLeftExpression());
            Expression right = stripTenantPredicates(or.getRightExpression());
            if (left == null) {
                return right;
            }
            if (right == null) {
                return left;
            }
            return new OrExpression(left, right);
        }
        if (expr instanceof EqualsTo eq
                && (isTenantColumn(eq.getLeftExpression()) || isTenantColumn(eq.getRightExpression()))) {
            return null;
        }
        if (expr instanceof InExpression in && isTenantColumn(in.getLeftExpression())) {
            return null;
        }
        return expr;
    }

    static List<Scan> physicalScans(PlainSelect plain, TenantContext tenant) {
        List<Scan> scans = new ArrayList<>();
        addScan(scans, plain.getFromItem(), tenant);
        if (plain.getJoins() != null) {
            for (Join join : plain.getJoins()) {
                addScan(scans, joinFrom(join), tenant);
            }
        }
        return scans;
    }

    private static void addScan(List<Scan> scans, FromItem from, TenantContext tenant) {
        if (!(from instanceof Table table)) {
            return;
        }
        if (isSchemaQualified(table)) {
            throw new SqlGuardException("Schema-qualified tables are not allowed");
        }
        String name = tableName(table);
        AiReportTableCatalog.Policy policy = AiReportTableCatalog.policy(name);
        if (policy == null) {
            return;
        }
        if (!AiReportTableCatalog.isAllowed(name, tenant)) {
            throw new SqlGuardException("Table not allowed: " + name);
        }
        scans.add(new Scan(table, aliasOrName(table), policy));
    }

    static FromItem joinFrom(Join join) {
        if (join == null) {
            return null;
        }
        return join.getFromItem() != null ? join.getFromItem() : join.getRightItem();
    }

    static Set<String> cteNames(Select select) {
        Set<String> names = new LinkedHashSet<>();
        collectCteNames(select, names);
        return names;
    }

    private static void collectCteNames(Select select, Set<String> names) {
        if (select == null || select.getWithItemsList() == null) {
            return;
        }
        for (WithItem<?> item : select.getWithItemsList()) {
            if (item.getAliasName() != null) {
                names.add(ident(item.getAliasName()));
            }
        }
    }

    static void forEachWithSelect(Select select, Consumer<Select> consumer) {
        if (select == null || select.getWithItemsList() == null) {
            return;
        }
        for (WithItem<?> item : select.getWithItemsList()) {
            if (item.isRecursive()) {
                throw new SqlGuardException("RECURSIVE WITH is not allowed");
            }
            ParenthesedSelect inner = item.getSelect();
            if (inner == null) {
                ParenthesedStatement stmt = item.getParenthesedStatement();
                throw new SqlGuardException("Unsupported WITH body: "
                        + (stmt == null ? "null" : stmt.getClass().getSimpleName()));
            }
            consumer.accept(inner);
        }
    }

    static void forEachSelectInExpr(Expression expr, Consumer<Select> consumer) {
        if (expr == null) {
            return;
        }
        expr.accept(new ExpressionVisitorAdapter<Void>() {
            @Override
            public <S> Void visit(ParenthesedSelect select, S context) {
                consumer.accept(select);
                return null;
            }

            @Override
            public <S> Void visit(Select select, S context) {
                consumer.accept(select);
                return null;
            }
        }, null);
    }

    static boolean qualifierMatches(String qualifier, Scan scan) {
        if (qualifier == null || qualifier.isBlank()) {
            return false;
        }
        String q = ident(qualifier);
        return q.equals(scan.aliasOrName()) || q.equals(ident(scan.table().getName()));
    }
}
