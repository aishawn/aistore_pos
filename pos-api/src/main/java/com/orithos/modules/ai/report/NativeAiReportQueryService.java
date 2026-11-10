package com.orithos.modules.ai.report;

import org.springframework.dao.DataAccessException;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Map;

/** Executes fixed AI report templates against the tenant's Orithos read-only views. */
@Service
public class NativeAiReportQueryService {

    private final AiReportDataSourceRegistry dataSources;
    private final ReportTemplateRegistry templates;

    public NativeAiReportQueryService(AiReportDataSourceRegistry dataSources,
                                      ReportTemplateRegistry templates) {
        this.dataSources = dataSources;
        this.templates = templates;
    }

    public Result query(TenantContext tenant, String intent, Map<String, String> slots,
                        ReportPeriodResolver.Window window) {
        if (tenant == null || tenant.requireOutletId() == null) return Result.fail("NO_OUTLET");
        if (!tenant.canQueryReport()) return Result.fail("NO_PERMISSION");
        if ("report_stock_value".equals(intent) && !tenant.canQueryCost()) {
            return Result.fail("NO_COST_PERMISSION");
        }
        if (!ReportTemplateRegistry.TEMPLATE_INTENTS.contains(intent)) {
            return Result.fail("UNKNOWN_TEMPLATE");
        }

        try {
            ReportTemplateRegistry.BoundSql bound = templates.bind(intent, tenant, slots, window);
            if (bound.error() != null) return Result.fail(bound.error());
            List<Map<String, Object>> rows = dataSources.jdbc(tenant.requireOutletId())
                    .queryForList(bound.sql(), bound.params().toArray());
            return Result.ok(rows);
        } catch (DataAccessException | IllegalStateException e) {
            return Result.fail("NATIVE_REPORT_UNAVAILABLE");
        }
    }

    public record Result(List<Map<String, Object>> rows, String error) {
        static Result ok(List<Map<String, Object>> rows) {
            return new Result(rows, null);
        }

        static Result fail(String error) {
            return new Result(List.of(), error);
        }
    }
}
