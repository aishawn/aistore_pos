package com.orithos.modules.ai.report;

import net.sf.jsqlparser.JSQLParserException;
import net.sf.jsqlparser.expression.Expression;
import net.sf.jsqlparser.expression.JdbcParameter;
import net.sf.jsqlparser.expression.LongValue;
import net.sf.jsqlparser.expression.Parenthesis;
import net.sf.jsqlparser.expression.operators.conditional.AndExpression;
import net.sf.jsqlparser.expression.operators.conditional.OrExpression;
import net.sf.jsqlparser.expression.operators.relational.EqualsTo;
import net.sf.jsqlparser.expression.operators.relational.ExpressionList;
import net.sf.jsqlparser.expression.operators.relational.InExpression;
import net.sf.jsqlparser.expression.operators.relational.ParenthesedExpressionList;
import net.sf.jsqlparser.parser.CCJSqlParserUtil;
import net.sf.jsqlparser.schema.Column;
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

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Deque;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * Validates (does not rewrite) SELECT against whitelist views.
 * Every physical scan must have a tenant predicate that is not bypassable by OR.
 * Parse failure or uncertainty → reject.
 */
public class SqlGuard {

    private static final Pattern COMMENT = Pattern.compile("(--|/\\*|\\*/|#)");
    private static final Pattern WRITE_KW = Pattern.compile(
            "(?i)\\b(INSERT|UPDATE|DELETE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REPLACE|LOAD|CALL|INTO\\s+OUTFILE|FOR\\s+UPDATE)\\b");
    private static final Pattern COST_COL = Pattern.compile(
            "(?i)\\b(cost|last_cost|average_cost|avg_cost|unit_cost|profit)\\b");

    private final int maxRows;

    public SqlGuard() {
        this(500);
    }

    public SqlGuard(int maxRows) {
        this.maxRows = maxRows <= 0 ? 500 : maxRows;
    }

    public void validate(String sql, TenantContext tenant, List<Object> params) {
        if (sql == null || sql.isBlank()) {
            throw new SqlGuardException("Empty SQL");
        }
        String trimmed = sql.trim();
        if (trimmed.endsWith(";")) {
            trimmed = trimmed.substring(0, trimmed.length() - 1).trim();
        }
        if (trimmed.contains(";")) {
            throw new SqlGuardException("Multiple statements are not allowed");
        }
        if (COMMENT.matcher(trimmed).find()) {
            throw new SqlGuardException("SQL comments are not allowed");
        }
        if (WRITE_KW.matcher(trimmed).find()) {
            throw new SqlGuardException("Only a read-only SELECT is allowed");
        }
        if (COST_COL.matcher(trimmed).find() && (tenant == null || !tenant.canQueryCost())) {
            throw new SqlGuardException("Cost columns are not allowed");
        }

        Statement stmt;
        try {
            stmt = CCJSqlParserUtil.parse(trimmed);
        } catch (JSQLParserException e) {
            throw new SqlGuardException("Could not parse SQL");
        }
        if (!(stmt instanceof Select select)) {
            throw new SqlGuardException("Only SELECT is allowed");
        }

        WalkContext ctx = new WalkContext(tenant, params);
        inspectSelect(select, ctx, 0, true);

        if (!ctx.sawPhysicalScan) {
            throw new SqlGuardException("FROM clause is required");
        }
        Set<Long> allowed = tenant == null || tenant.outletIds() == null
                ? Set.of()
                : new HashSet<>(tenant.outletIds());
        for (Long id : ctx.literals) {
            if (!allowed.contains(id)) {
                throw new SqlGuardException("outlet_id is not in the authorized store list");
            }
        }
        if (ctx.usedPlaceholder) {
            validateBoundNumbers(params, allowed, tenant);
        }
        if (!ctx.limitFound) {
            throw new SqlGuardException("LIMIT is required");
        }
        if (ctx.limitValue > maxRows) {
            throw new SqlGuardException("LIMIT exceeds " + maxRows);
        }
    }

    private void inspectSelect(Select select, WalkContext ctx, int depth, boolean requireLimit) {
        if (select == null) {
            throw new SqlGuardException("Unsupported SELECT shape");
        }
        if (depth > AiReportTableCatalog.MAX_NESTING) {
            throw new SqlGuardException("Nested subqueries exceed depth " + AiReportTableCatalog.MAX_NESTING);
        }
        ctx.pushCtes(SqlAst.cteNames(select));
        try {
            SqlAst.forEachWithSelect(select, inner -> inspectSelect(inner, ctx, depth + 1, false));
            if (select instanceof ParenthesedSelect nested) {
                inspectSelect(nested.getSelect(), ctx, depth, requireLimit);
                return;
            }
            if (select instanceof SetOperationList set) {
                if (set.getSelects() == null || set.getSelects().isEmpty()) {
                    throw new SqlGuardException("UNION / set operations require SELECT branches");
                }
                for (Select branch : set.getSelects()) {
                    inspectSelect(branch, ctx, depth, false);
                }
                if (requireLimit) {
                    captureLimit(set, ctx);
                    if (!ctx.limitFound && !set.getSelects().isEmpty()) {
                        captureLimit(set.getSelects().get(set.getSelects().size() - 1), ctx);
                    }
                }
                return;
            }
            if (!(select instanceof PlainSelect plain)) {
                throw new SqlGuardException("Unsupported SELECT shape");
            }
            if (plain.getIntoTables() != null && !plain.getIntoTables().isEmpty()) {
                throw new SqlGuardException("SELECT INTO is not allowed");
            }
            if (plain.getLateralViews() != null && !plain.getLateralViews().isEmpty()) {
                throw new SqlGuardException("LATERAL views are not allowed");
            }

            inspectFromItem(plain.getFromItem(), ctx, depth);
            List<Expression> onExprs = new ArrayList<>();
            if (plain.getJoins() != null) {
                for (Join join : plain.getJoins()) {
                    inspectFromItem(SqlAst.joinFrom(join), ctx, depth);
                    Collection<Expression> ons = join.getOnExpressions();
                    if (ons != null) {
                        for (Expression on : ons) {
                            onExprs.add(on);
                            inspectExprSelects(on, ctx, depth);
                        }
                    }
                }
            }

            List<SqlAst.Scan> scans = SqlAst.physicalScans(plain, ctx.tenant);
            if (!scans.isEmpty()) {
                ctx.sawPhysicalScan = true;
            }
            Expression scope = plain.getWhere();
            for (Expression on : onExprs) {
                scope = scope == null ? on : new AndExpression(scope, on);
            }
            boolean unique = scans.size() == 1;
            for (SqlAst.Scan scan : scans) {
                if (!covers(scope, scan, unique)) {
                    String col = scan.policy().tenantColumn() == null ? "tenant" : scan.policy().tenantColumn();
                    throw new SqlGuardException("Missing " + col + " filter on " + scan.policy().name());
                }
            }
            collectTenantValues(scope, ctx);

            inspectExprSelects(plain.getWhere(), ctx, depth);
            inspectExprSelects(plain.getHaving(), ctx, depth);
            if (plain.getSelectItems() != null) {
                for (SelectItem<?> item : plain.getSelectItems()) {
                    inspectExprSelects(item.getExpression(), ctx, depth);
                }
            }
            if (requireLimit) {
                captureLimit(plain, ctx);
            }
        } finally {
            ctx.popCtes();
        }
    }

    private void inspectFromItem(FromItem from, WalkContext ctx, int depth) {
        if (from == null) {
            return;
        }
        if (from instanceof Table table) {
            if (SqlAst.isSchemaQualified(table)) {
                throw new SqlGuardException("Schema-qualified tables are not allowed");
            }
            String name = SqlAst.tableName(table);
            if (name.isBlank() || ctx.isCte(name)) {
                return;
            }
            if (!AiReportTableCatalog.isAllowed(name, ctx.tenant)) {
                throw new SqlGuardException("Table not allowed: " + name);
            }
            ctx.sawPhysicalScan = true;
            return;
        }
        if (from instanceof ParenthesedSelect nested) {
            inspectSelect(nested, ctx, depth + 1, false);
            return;
        }
        if (from instanceof Select nested) {
            inspectSelect(nested, ctx, depth + 1, false);
            return;
        }
        throw new SqlGuardException("Unsupported FROM item: " + from.getClass().getSimpleName());
    }

    private void inspectExprSelects(Expression expr, WalkContext ctx, int depth) {
        SqlAst.forEachSelectInExpr(expr, nested -> inspectSelect(nested, ctx, depth + 1, false));
    }

    private static boolean covers(Expression expr, SqlAst.Scan scan, boolean uniqueTable) {
        if (expr == null) {
            return false;
        }
        if (expr instanceof Parenthesis p) {
            return covers(p.getExpression(), scan, uniqueTable);
        }
        if (expr instanceof ParenthesedExpressionList<?> list && list.size() == 1) {
            return covers(list.get(0), scan, uniqueTable);
        }
        if (expr instanceof AndExpression and) {
            return covers(and.getLeftExpression(), scan, uniqueTable)
                    || covers(and.getRightExpression(), scan, uniqueTable);
        }
        if (expr instanceof OrExpression or) {
            return covers(or.getLeftExpression(), scan, uniqueTable)
                    && covers(or.getRightExpression(), scan, uniqueTable);
        }
        if (expr instanceof EqualsTo eq) {
            return tenantPredicateCovers(eq.getLeftExpression(), eq.getRightExpression(), scan, uniqueTable)
                    || tenantPredicateCovers(eq.getRightExpression(), eq.getLeftExpression(), scan, uniqueTable);
        }
        if (expr instanceof InExpression in) {
            return columnMatchesScan(in.getLeftExpression(), scan, uniqueTable)
                    && inListIsBound(in.getRightExpression());
        }
        return false;
    }

    private static boolean tenantPredicateCovers(Expression columnSide, Expression valueSide,
                                                SqlAst.Scan scan, boolean uniqueTable) {
        return columnMatchesScan(columnSide, scan, uniqueTable) && valueIsBound(valueSide);
    }

    private static boolean columnMatchesScan(Expression expr, SqlAst.Scan scan, boolean uniqueTable) {
        if (!(expr instanceof Column col)) {
            return false;
        }
        String needed = scan.policy().tenantColumn();
        if (needed == null || !needed.equals(SqlAst.columnName(col))) {
            return false;
        }
        String qualifier = SqlAst.columnQualifier(col);
        if (qualifier == null) {
            return uniqueTable;
        }
        return SqlAst.qualifierMatches(qualifier, scan);
    }

    private static boolean valueIsBound(Expression expr) {
        return expr instanceof LongValue || expr instanceof JdbcParameter;
    }

    private static boolean inListIsBound(Expression expr) {
        if (expr instanceof ExpressionList<?> list) {
            if (list.isEmpty()) {
                return false;
            }
            for (Expression item : list) {
                if (!valueIsBound(item)) {
                    return false;
                }
            }
            return true;
        }
        return false;
    }

    private static void collectTenantValues(Expression expr, WalkContext ctx) {
        if (expr == null) {
            return;
        }
        if (expr instanceof Parenthesis p) {
            collectTenantValues(p.getExpression(), ctx);
            return;
        }
        if (expr instanceof ParenthesedExpressionList<?> list) {
            for (Expression item : list) {
                collectTenantValues(item, ctx);
            }
            return;
        }
        if (expr instanceof AndExpression and) {
            collectTenantValues(and.getLeftExpression(), ctx);
            collectTenantValues(and.getRightExpression(), ctx);
            return;
        }
        if (expr instanceof OrExpression or) {
            collectTenantValues(or.getLeftExpression(), ctx);
            collectTenantValues(or.getRightExpression(), ctx);
            return;
        }
        if (expr instanceof EqualsTo eq) {
            captureIfTenant(eq.getLeftExpression(), eq.getRightExpression(), ctx);
            captureIfTenant(eq.getRightExpression(), eq.getLeftExpression(), ctx);
            return;
        }
        if (expr instanceof InExpression in && SqlAst.isTenantColumn(in.getLeftExpression())) {
            Expression right = in.getRightExpression();
            if (right instanceof ExpressionList<?> list) {
                for (Expression item : list) {
                    captureValue(item, ctx);
                }
            }
        }
    }

    private static void captureIfTenant(Expression columnSide, Expression valueSide, WalkContext ctx) {
        if (SqlAst.isTenantColumn(columnSide)) {
            captureValue(valueSide, ctx);
        }
    }

    private static void captureValue(Expression expr, WalkContext ctx) {
        if (expr instanceof LongValue lv) {
            ctx.literals.add(lv.getValue());
        } else if (expr instanceof JdbcParameter) {
            ctx.usedPlaceholder = true;
        } else if (expr != null) {
            throw new SqlGuardException("outlet_id predicate must be a literal or bound parameter");
        }
    }

    private static void captureLimit(Select select, WalkContext ctx) {
        Limit lim = select.getLimit();
        if (lim != null && lim.getRowCount() instanceof LongValue lv) {
            ctx.limitFound = true;
            ctx.limitValue = lv.getValue();
        }
    }

    private static void validateBoundNumbers(List<Object> params, Set<Long> allowed, TenantContext tenant) {
        boolean anyNumber = false;
        if (params != null) {
            for (Object p : params) {
                if (p instanceof Number n) {
                    anyNumber = true;
                    if (!allowed.contains(n.longValue())) {
                        throw new SqlGuardException("Bound outlet_id is not authorized");
                    }
                }
            }
        }
        if (!anyNumber) {
            Long bound = tenant == null ? null : tenant.requireOutletId();
            if (bound == null || !allowed.contains(bound)) {
                throw new SqlGuardException("Bound outlet_id is not authorized");
            }
        }
    }

    private static final class WalkContext {
        final TenantContext tenant;
        final List<Object> params;
        final Set<Long> literals = new HashSet<>();
        final Deque<Set<String>> cteStack = new ArrayDeque<>();
        boolean usedPlaceholder;
        boolean sawPhysicalScan;
        boolean limitFound;
        long limitValue;

        WalkContext(TenantContext tenant, List<Object> params) {
            this.tenant = tenant;
            this.params = params;
        }

        void pushCtes(Set<String> names) {
            Set<String> merged = new LinkedHashSet<>();
            if (!cteStack.isEmpty()) {
                merged.addAll(cteStack.peek());
            }
            if (names != null) {
                merged.addAll(names);
            }
            cteStack.push(merged);
        }

        void popCtes() {
            if (!cteStack.isEmpty()) {
                cteStack.pop();
            }
        }

        boolean isCte(String name) {
            return !cteStack.isEmpty() && cteStack.peek().contains(SqlAst.ident(name));
        }
    }
}
