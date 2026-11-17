package com.orithos.modules.ai.replenishment;

import com.orithos.common.ApiResult;
import com.orithos.common.AustraliaTime;
import com.orithos.common.BusinessException;
import com.orithos.config.CorrelationIdContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.dao.DataAccessException;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/ai/assistant")
@ConditionalOnProperty(name = "app.ai.enabled", havingValue = "true")
public class AiAssistantReadOnlyReportController {
    private static final Logger log = LoggerFactory.getLogger(AiAssistantReadOnlyReportController.class);

    private final TenantContextFactory tenantContextFactory;
    private final NativeReplenishmentService replenishmentService;
    private final StoreOpportunitiesBriefService opportunitiesBriefService;

    public AiAssistantReadOnlyReportController(TenantContextFactory tenantContextFactory,
                                               NativeReplenishmentService replenishmentService,
                                               StoreOpportunitiesBriefService opportunitiesBriefService) {
        this.tenantContextFactory = tenantContextFactory;
        this.replenishmentService = replenishmentService;
        this.opportunitiesBriefService = opportunitiesBriefService;
    }

    @GetMapping("/store-opportunities-brief")
    public ApiResult<AssistantStoreOpportunitiesBriefResponse> storeOpportunitiesBrief() {
        long startedAt = System.nanoTime();
        try {
            AssistantStoreOpportunitiesBriefResponse brief =
                    opportunitiesBriefService.build(tenantContextFactory.fromSecurity());
            log.info("AI store opportunities brief correlationId={} category=success reportDataStatus={} elapsedMs={}",
                    CorrelationIdContext.current(), brief.reportDataStatus(), elapsedMs(startedAt));
            return ApiResult.ok(brief);
        } catch (AccessDeniedException e) {
            log.info("AI store opportunities brief correlationId={} category=permission elapsedMs={}",
                    CorrelationIdContext.current(), elapsedMs(startedAt));
            throw new BusinessException(40310,
                    "You do not have permission to view store opportunities. Contact your administrator.");
        } catch (BusinessException e) {
            log.info("AI store opportunities brief correlationId={} category=business code={} elapsedMs={}",
                    CorrelationIdContext.current(), e.getCode(), elapsedMs(startedAt));
            throw e;
        } catch (DataAccessException e) {
            String sqlState = sqlState(e);
            String category = "57014".equals(sqlState) ? "timeout"
                    : sqlState != null && sqlState.startsWith("08") ? "connection" : "data_access";
            log.warn("AI store opportunities brief failed correlationId={} category={} exceptionType={} sqlState={} elapsedMs={}",
                    CorrelationIdContext.current(), category, e.getClass().getSimpleName(), sqlState,
                    elapsedMs(startedAt));
            throw new BusinessException(50321,
                    "Store opportunities data is temporarily unavailable. Please retry shortly.");
        } catch (RuntimeException e) {
            log.warn("AI store opportunities brief failed correlationId={} category=service exceptionType={} elapsedMs={}",
                    CorrelationIdContext.current(), e.getClass().getSimpleName(), elapsedMs(startedAt));
            throw new BusinessException(50321,
                    "Store opportunities data is temporarily unavailable. Please retry shortly.");
        }
    }

    @GetMapping("/replenishment-report")
    public ApiResult<AssistantReplenishmentPreviewResponse> replenishmentReport() {
        long startedAt = System.nanoTime();
        try {
            ReplenishmentPlan plan = replenishmentService.plan(tenantContextFactory.fromSecurity());
            log.info("AI replenishment report correlationId={} category=success dataGapCount={} inventoryGapCount={} supplierGapCount={} elapsedMs={}",
                    CorrelationIdContext.current(), plan.dataGapCount(), plan.inventoryGapCount(),
                    plan.supplierGapCount(), elapsedMs(startedAt));
            return ApiResult.ok(AssistantReplenishmentPreviewResponse.from(plan, AustraliaTime.today()));
        } catch (AccessDeniedException e) {
            log.info("AI replenishment report correlationId={} category=permission dataGapCount=unknown elapsedMs={}",
                    CorrelationIdContext.current(), elapsedMs(startedAt));
            throw new BusinessException(40310,
                    "You do not have permission to view replenishment data. Contact your administrator.");
        } catch (BusinessException e) {
            log.info("AI replenishment report correlationId={} category=business code={} dataGapCount=unknown elapsedMs={}",
                    CorrelationIdContext.current(), e.getCode(), elapsedMs(startedAt));
            throw e;
        } catch (DataAccessException e) {
            String sqlState = sqlState(e);
            String category = "57014".equals(sqlState) ? "timeout"
                    : sqlState != null && sqlState.startsWith("08") ? "connection" : "data_access";
            log.warn("AI replenishment report failed correlationId={} category={} exceptionType={} sqlState={} dataGapCount=unknown elapsedMs={}",
                    CorrelationIdContext.current(), category, e.getClass().getSimpleName(), sqlState,
                    elapsedMs(startedAt));
            throw new BusinessException(50321,
                    "Replenishment data is temporarily unavailable. Please retry shortly.");
        } catch (RuntimeException e) {
            log.warn("AI replenishment report failed correlationId={} category=service exceptionType={} dataGapCount=unknown elapsedMs={}",
                    CorrelationIdContext.current(), e.getClass().getSimpleName(), elapsedMs(startedAt));
            throw new BusinessException(50321,
                    "Replenishment data is temporarily unavailable. Please retry shortly.");
        }
    }

    private static long elapsedMs(long startedAt) {
        return Math.max(0, (System.nanoTime() - startedAt) / 1_000_000L);
    }

    private static String sqlState(Throwable error) {
        for (Throwable current = error; current != null && current.getCause() != current; current = current.getCause()) {
            if (current instanceof java.sql.SQLException sqlException) return sqlException.getSQLState();
        }
        return null;
    }
}
