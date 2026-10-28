package com.orithos.modules.ai;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.dto.AiReportSnapshotResponse;
import com.orithos.modules.ai.dto.AssistantRequest;
import com.orithos.modules.ai.dto.AssistantResponse;
import com.orithos.modules.ai.dto.TranscriptionResponse;
import com.orithos.modules.ai.chat.AiChatHistoryService;
import com.orithos.modules.ai.report.AiReportSnapshotService;
import com.orithos.modules.ai.report.AiReportMetricsResponse;
import com.orithos.modules.ai.report.AiReportMetricsService;
import com.orithos.modules.ai.report.AiReportAuditService;
import com.orithos.modules.ai.report.TenantContext;
import com.orithos.modules.ai.report.TenantContextFactory;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;
import java.util.Map;
import java.util.Properties;

@RestController
@RequestMapping("/api/ai")
public class AiAssistantController {

    private static final Logger log = LoggerFactory.getLogger(AiAssistantController.class);

    private final ObjectProvider<PosAssistantGraphService> graphService;
    private final ObjectProvider<AiTranscriptionService> transcriptionService;
    private final TenantContextFactory tenantContextFactory;
    private final AiReportSnapshotService snapshotService;
    private final AiReportMetricsService metricsService;
    private final AiReportAuditService auditService;
    private final AiChatHistoryService chatHistoryService;
    private final AiProviderQuotaService providerQuota;
    @Value("${app.ai.enabled:false}")
    private boolean aiEnabled;
    @Value("${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}")
    private String dashScopeBaseUrl;
    @Value("${SOURCE_COMMIT:unknown}")
    private String sourceCommit;

    @Autowired
    public AiAssistantController(
            ObjectProvider<PosAssistantGraphService> graphService,
            ObjectProvider<AiTranscriptionService> transcriptionService,
            TenantContextFactory tenantContextFactory,
            AiReportSnapshotService snapshotService,
            AiReportMetricsService metricsService,
            AiReportAuditService auditService,
            AiChatHistoryService chatHistoryService,
            AiProviderQuotaService providerQuota) {
        this.graphService = graphService;
        this.transcriptionService = transcriptionService;
        this.tenantContextFactory = tenantContextFactory;
        this.snapshotService = snapshotService;
        this.metricsService = metricsService;
        this.auditService = auditService;
        this.chatHistoryService = chatHistoryService;
        this.providerQuota = providerQuota;
    }

    AiAssistantController(
            ObjectProvider<PosAssistantGraphService> graphService,
            ObjectProvider<AiTranscriptionService> transcriptionService,
            TenantContextFactory tenantContextFactory,
            AiReportSnapshotService snapshotService,
            AiReportMetricsService metricsService,
            AiReportAuditService auditService,
            AiChatHistoryService chatHistoryService) {
        this(graphService, transcriptionService, tenantContextFactory, snapshotService, metricsService,
                auditService, chatHistoryService, null);
    }

    /** Phase A: classify intent + return UI instructions; frontend dispatches search/navigation. */
    @PostMapping("/assistant")
    public ApiResult<AssistantResponse> assistant(@Valid @RequestBody AssistantRequest request) {
        String correlationId = AiFailureDiagnostics.correlationId();
        TenantContext tenant = tenantContextFactory.fromSecurity();
        long startedAt = System.nanoTime();
        PosAssistantGraphService service = graphService.getIfAvailable();
        if (service == null || !AiProviderConfig.isValidBaseUrl(dashScopeBaseUrl)) {
            auditService.recordAssistant(tenant, "unknown", false, elapsedMs(startedAt), request.question(), null);
            throw new BusinessException(50301,
                    "AI assistant is disabled. Set app.ai.enabled=true and AI_DASHSCOPE_API_KEY.");
        }
        PosAssistantGraphService.AssistantResult result;
        try {
            result = service.ask(request.question(), request.threadId(), tenant, request.surface());
        } catch (BusinessException e) {
            auditService.recordAssistant(tenant, "unknown", false, elapsedMs(startedAt), request.question(), null);
            throw e;
        } catch (Exception e) {
            auditService.recordAssistant(tenant, "unknown", false, elapsedMs(startedAt), request.question(), null);
            Throwable rootCause = rootCauseOf(e);
            log.warn("AI assistant request failed: correlationId={}, category={}, exceptionType={}, rootCauseType={}, elapsedMs={}",
                    correlationId, AiFailureDiagnostics.category(e), e.getClass().getSimpleName(), rootCause.getClass().getSimpleName(), elapsedMs(startedAt));
            // Do not expose provider URLs, request ids, or model configuration details to store staff.
            throw new BusinessException(50210,
                    "AI assistant is temporarily unavailable. Check the AI configuration and try again.");
        }

        auditService.recordAssistant(tenant, result.intent(), true, elapsedMs(startedAt), request.question(), result.answer());
        chatHistoryService.appendTurn(tenant, result.threadId(), request.question(), result.intent(),
                result.answer(), result.reportId(), result.slots());
        log.info("AI assistant observed fastPathId={} intent={} source={} llmFallback={} sourceCommit={} runtimeCommit={} writeRequests={}",
                result.fastPathId(), result.intent(), result.source(), result.llmFallback(),
                sourceCommit, runtimeCommit(), result.writeRequests());

        return ApiResult.ok(new AssistantResponse(
                result.threadId(),
                result.intent(),
                result.intentSummary(),
                result.answer(),
                result.slots(),
                result.ui(),
                result.table(),
                result.reportId(),
                result.cards(),
                result.writeRequests(),
                result.fastPathId(),
                result.source(),
                result.llmFallback()
        ));
    }

    /** Cashier-owned chat threads for the floating assistant history panel. */
    @GetMapping("/threads")
    public ApiResult<List<Map<String, Object>>> listThreads() {
        TenantContext tenant = tenantContextFactory.fromSecurity();
        return ApiResult.ok(chatHistoryService.listThreads(tenant));
    }

    @GetMapping("/threads/{id}")
    public ApiResult<Map<String, Object>> getThread(@PathVariable long id) {
        TenantContext tenant = tenantContextFactory.fromSecurity();
        return ApiResult.ok(chatHistoryService.getThread(tenant, id));
    }

    private static int elapsedMs(long startedAt) {
        return (int) Math.max(0, (System.nanoTime() - startedAt) / 1_000_000L);
    }

    private static Throwable rootCauseOf(Throwable error) {
        Throwable current = error;
        while (current.getCause() != null && current.getCause() != current) {
            current = current.getCause();
        }
        return current;
    }

    private String runtimeCommit() {
        Properties properties = new Properties();
        try (var resource = getClass().getResourceAsStream("/build-identity.properties")) {
            if (resource != null) properties.load(resource);
        } catch (Exception ignored) {
            return "unknown";
        }
        String commit = properties.getProperty("commit", "");
        return commit.matches("[a-f0-9]{40}") ? commit : "unknown";
    }

    /** Full AI report snapshot for the dedicated results page. */
    @GetMapping("/reports/{id}")
    public ApiResult<AiReportSnapshotResponse> reportSnapshot(@PathVariable long id) {
        TenantContext tenant = tenantContextFactory.fromSecurity();
        return ApiResult.ok(snapshotService.getOwned(id, tenant));
    }

    /** Administrator-only, vendor-scoped report audit metrics. */
    @GetMapping("/metrics")
    public ApiResult<AiReportMetricsResponse> metrics(
            @RequestParam(value = "hours", defaultValue = "24") int hours) {
        return ApiResult.ok(metricsService.get(hours));
    }

    /** Administrator-only diagnostics for AI audit metrics storage and permissions. */
    @GetMapping("/metrics/diagnostics")
    public ApiResult<Map<String, Object>> metricsDiagnostics() {
        return ApiResult.ok(metricsService.auditDiagnostics());
    }

    /**
     * Cloud speech-to-text (DashScope Qwen-ASR). Frontend falls back to Web Speech API on 503/error.
     *
     * @param file audio from MediaRecorder
     * @param lang optional hint: {@code en}, {@code zh}, {@code en-AU}, {@code zh-CN}, or {@code auto}
     */
    @PostMapping(value = "/transcribe", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<TranscriptionResponse> transcribe(
            @RequestParam("file") MultipartFile file,
            @RequestParam(value = "lang", required = false) String lang) {
        AiTranscriptionService service = transcriptionService.getIfAvailable();
        if (!aiEnabled || service == null || !AiProviderConfig.isValidBaseUrl(dashScopeBaseUrl)) {
            throw new BusinessException(50301,
                    "AI transcription is disabled. Set app.ai.enabled=true and AI_DASHSCOPE_API_KEY.");
        }
        TenantContext tenant = tenantContextFactory.fromSecurity();
        if (providerQuota != null) {
            providerQuota.acquire(tenant, (int) Math.min(Integer.MAX_VALUE, Math.max(1L, file == null ? 0L : file.getSize() / 4L)));
        }
        String text = service.transcribe(file, lang);
        String normalized = AiTranscriptionService.normalizeLang(lang);
        return ApiResult.ok(new TranscriptionResponse(text, normalized != null ? normalized : "auto"));
    }
}
