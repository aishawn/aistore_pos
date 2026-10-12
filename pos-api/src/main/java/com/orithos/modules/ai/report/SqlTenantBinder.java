package com.orithos.modules.ai.report;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.JdbcParameter;
import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.expression.operators.conditional.AndExpression;
import net.sf.jsqlparser.expression.operators.relational.EqualsTo;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.schema.Table;
import net.sf.jsqlparser.statement.Statement;
import net.sf.jsqlparser.statement.select.FromItem;
import net.sf.jsqlparser.statement.select.Join;
import net.sf.jsqlparser.statement.select.Limit;
import net.sf.jsqlparser.statement.select.ParenthesedSelect;
import net.sf.jsqlparser.statement.select.PlainSelect;
import net.sf.jsqlparser.statement.select.Select;
import net.sf.jsqlparser.statement.select.SelectItem;
import net.sf.jsqlparser.statement.select.SetOperationList;

import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Locale;

/**
 * Strips model-written tenant predicates and injects context values on every
 * whitelist table scan (JOIN / UNION / WITH / subquery). Does not concatenate
 * {@code AND} onto the raw string.
 */
public class SqlTenantBinder {

    public record BoundSql(String sql, List<Object> params) {}

    private final int maxRows;

    public SqlTenantBinder() {
        this(500);
    }

    public SqlTenantBinder(int maxRows) {
        this.maxRows = maxRows <= 0 ? 500 : maxRows;
    }

    public BoundSql bind(String sql, TenantContext tenant) {
        Long outletId = tenant == null ? null : tenant.requireOutletId();
        if (outletId == null) {
            throw new SqlGuardException("Query must filter by outlet_id");
        }
        if (sql == null || sql.isBlank()) {
            throw new SqlGuardException("Empty SQL");
        }
        String trimmed = sql.trim();
        if (trimmed.endsWith(";")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1).trim();
        }
        Statement stmt;
        try {
            stmt = CCJSqlParserUtil.parse(trimmed);
        } catch (JSQLParserException e) {
            throw new SqlGuardException("Could not parse SQL");
        }
        if (!(stmt instanceof Select select)) {
            throw new SqlGuardException("Only a single SELECT is allowed");
        }
        List<Object> params = new ArrayList<>();
        rewriteSelect(select, tenant, params, 0, true);
        return new BoundSql(select.toString(), params);
    }

    static String extractSelect(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String text = raw.trim();
        int fence = text.toLowerCase(Locale.ROOT).indexOf("```");
        if (fence >= 0) {
            int start = text.indexOf('\n', fence);
            int end = text.toLowerCase(Locale.ROOT).indexOf("```", fence + 3);
            if (start > 0 && end > start) {
                text = text.substring(start + 1, end).trim();
            }
        }
        int withAt = indexOfWord(text, "with");
        int selectAt = indexOfWord(text, "select");
        int startAt = selectAt;
        if (withAt >= 0 && (selectAt < 0 || withAt < selectAt)) {
            startAt = withAt;
        }
        if (startAt < 0) {
            return null;
        }
        String sql = text.substring(startAt).trim();
        int semi = sql.indexOf(';');
        if (semi >= 0) {
            sql = sql.substring(0, semi).trim();
        }
        return sql.isBlank() ? null : sql;
    }

    private static int indexOfWord(String text, String word) {
        String lower = text.toLowerCase(Locale.ROOT);
        int idx = lower.indexOf(word);
        while (idx >= 0) {
            boolean before = idx == 0 || !Character.isLetterOrDigit(text.charAt(idx - 1));
            int afterPos = idx + word.length();
            boolean after = afterPos >= text.length() || !Character.isLetterOrDigit(text.charAt(afterPos));
            if (before && after) {
                return idx;
            }
            idx = lower.indexOf(word, idx + 1);
        }
        return -1;
    }

    private void rewriteSelect(Select select, TenantContext tenant, List<Object> params,
                               int depth, boolean top) {
        if (select == null) {
            throw new SqlGuardException("Unsupported SELECT shape");
        }
        if (depth > AiReportTableCatalog.MAX_NESTING) {
            throw new SqlGuardException("Nested subqueries exceed depth " + AiReportTableCatalog.MAX_NESTING);
        }
        SqlAst.forEachWithSelect(select, inner -> rewriteSelect(inner, tenant, params, depth + 1, false));
        if (select instanceof ParenthesedSelect nested) {
            rewriteSelect(nested.getSelect(), tenant, params, depth, top);
            if (top) {
                ensureLimit(select);
            }
            return;
        }
        if (select instanceof SetOperationList set) {
            if (set.getSelects() == null || set.getSelects().isEmpty()) {
                throw new SqlGuardException("UNION / set operations require SELECT branches");
            }
            for (Select branch : set.getSelects()) {
                rewriteSelect(branch, tenant, params, depth, false);
            }
            if (top) {
                ensureLimit(set);
            }
            return;
        }
        if (!(select instanceof PlainSelect plain)) {
            throw new SqlGuardException("Unsupported SELECT shape");
        }
        rewriteFrom(plain.getFromItem(), tenant, params, depth);
        if (plain.getJoins() != null) {
            for (Join join : plain.getJoins()) {
                rewriteFrom(SqlAst.joinFrom(join), tenant, params, depth);
                stripJoinOn(join, tenant, params, depth);
            }
        }
        rewriteExprSelects(plain.getWhere(), tenant, params, depth);
        rewriteExprSelects(plain.getHaving(), tenant, params, depth);
        if (plain.getSelectItems() != null) {
            for (SelectItem<?> item : plain.getSelectItems()) {
                rewriteExprSelects(item.getExpression(), tenant, params, depth);
            }
        }

        List<SqlAst.Scan> scans = SqlAst.physicalScans(plain, tenant);
        Expression where = SqlAst.stripTenantPredicates(plain.getWhere());
        for (SqlAst.Scan scan : scans) {
            String col = scan.policy().tenantColumn();
            if (col == null) {
                throw new SqlGuardException("Table has no tenant column: " + scan.policy().name());
            }
            EqualsTo eq = new EqualsTo();
            eq.setLeftExpression(SqlAst.qualifiedColumn(scan.table(), col));
            eq.setRightExpression(new JdbcParameter());
            params.add(tenantValue(tenant, col));
            where = where == null ? eq : new AndExpression(eq, SqlAst.wrap(where));
        }
        plain.setWhere(where);
        if (top) {
            ensureLimit(plain);
        }
    }

    private void rewriteFrom(FromItem from, TenantContext tenant, List<Object> params, int depth) {
        if (from == null) {
            return;
        }
        if (from instanceof Table table) {
            if (SqlAst.isSchemaQualified(table)) {
                throw new SqlGuardException("Schema-qualified tables are not allowed");
            }
            return;
        }
        if (from instanceof ParenthesedSelect nested) {
            rewriteSelect(nested, tenant, params, depth + 1, false);
            return;
        }
        if (from instanceof Select nested) {
            rewriteSelect(nested, tenant, params, depth + 1, false);
        }
    }

    private void stripJoinOn(Join join, TenantContext tenant, List<Object> params, int depth) {
        Collection<Expression> ons = join.getOnExpressions();
        if (ons == null || ons.isEmpty()) {
            return;
        }
        List<Expression> next = new ArrayList<>();
        for (Expression on : ons) {
            rewriteExprSelects(on, tenant, params, depth);
            Expression stripped = SqlAst.stripTenantPredicates(on);
            if (stripped != null) {
                next.add(stripped);
            }
        }
        if (next.isEmpty()) {
            throw new SqlGuardException("JOIN ON became empty after stripping tenant predicates");
        }
        join.setOnExpressions(next);
    }

    private void rewriteExprSelects(Expression expr, TenantContext tenant, List<Object> params, int depth) {
        SqlAst.forEachSelectInExpr(expr, nested -> rewriteSelect(nested, tenant, params, depth + 1, false));
    }

    private void ensureLimit(Select select) {
        Limit existing = select.getLimit();
        long rows = maxRows;
        if (existing != null && existing.getRowCount() instanceof LongValue lv) {
            rows = Math.min(lv.getValue(), maxRows);
            if (rows <= 0) {
                rows = maxRows;
            }
        }
        Limit limit = new Limit();
        limit.setRowCount(new LongValue(rows));
        select.setLimit(limit);
    }

    private static Object tenantValue(TenantContext tenant, String column) {
        if ("vendor_id".equals(column)) {
            return tenant.vendorId();
        }
        return tenant.requireOutletId();
    }
}
