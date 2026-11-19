package com.orithos.modules.ai.sommelier;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AiProviderConfig;
import com.orithos.modules.ai.AiProviderQuotaService;
import com.orithos.modules.ai.report.TenantContextFactory;
import com.orithos.modules.ai.sommelier.dto.AskRequest;
import com.orithos.modules.ai.sommelier.dto.AskResponse;
import com.orithos.modules.ai.sommelier.dto.FeedbackRequest;
import com.orithos.modules.ai.sommelier.dto.IdentifyImageResponse;
import com.orithos.modules.ai.sommelier.dto.IdentifyResponse;
import com.orithos.modules.ai.sommelier.dto.PitchRequest;
import com.orithos.modules.ai.sommelier.dto.PitchResponse;
import com.orithos.modules.ai.sommelier.dto.RecommendRequest;
import com.orithos.modules.ai.sommelier.dto.RecommendResponse;
import com.orithos.modules.ai.sommelier.dto.SimilarRequest;
import com.orithos.modules.ai.sommelier.dto.SimilarResponse;
import com.orithos.modules.ai.sommelier.dto.WineAssistantResponse;
import jakarta.validation.Valid;
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

@RestController
@RequestMapping("/api/ai/sommelier")
public class SommelierController {

    private final SommelierService sommelierService;
    private final TenantContextFactory tenantContextFactory;
    private final ObjectProvider<WineLabelVisionService> visionService;
    private final AiProviderQuotaService providerQuota;
    @Value("${app.ai.enabled:false}")
    private boolean aiEnabled;
    @Value("${AI_SERVICE_BASE_URL:https://ai.orithos.com.au}")
    private String aiServiceBaseUrl;
    @Value("${AI_SERVICE_TOKEN:}")
    private String aiServiceToken;

    @Autowired
    public SommelierController(
            SommelierService sommelierService,
            TenantContextFactory tenantContextFactory,
            ObjectProvider<WineLabelVisionService> visionService,
            AiProviderQuotaService providerQuota) {
        this.sommelierService = sommelierService;
        this.tenantContextFactory = tenantContextFactory;
        this.visionService = visionService;
        this.providerQuota = providerQuota;
    }

    SommelierController(
            SommelierService sommelierService,
            TenantContextFactory tenantContextFactory,
            ObjectProvider<WineLabelVisionService> visionService) {
        this(sommelierService, tenantContextFactory, visionService, null);
    }

    @PostMapping("/recommend")
    public ApiResult<RecommendResponse> recommend(@Valid @RequestBody RecommendRequest request) {
        var tenant = tenantContextFactory.fromSecurity();
        return ApiResult.ok(sommelierService.recommend(request, tenant));
    }

    @GetMapping("/identify")
    public ApiResult<IdentifyResponse> identify(@RequestParam String q) {
        return ApiResult.ok(sommelierService.identify(q, tenantContextFactory.fromSecurity()));
    }

    @PostMapping(value = "/identify-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<IdentifyImageResponse> identifyImage(@RequestParam("file") MultipartFile file) {
        // Fail closed before resolving the vision bean — disabled AI must not
        // touch provider wiring or tenant-scoped catalogue data.
        if (!aiEnabled || !AiProviderConfig.isValidBaseUrl(aiServiceBaseUrl) || aiServiceToken.isBlank()) {
            throw new BusinessException(50301,
                    "Label recognition is disabled. Configure app.ai.enabled and the remote AI service.");
        }
        WineLabelVisionService vision = visionService.getIfAvailable();
        if (vision == null) {
            throw new BusinessException(50301,
                    "Label recognition is disabled. Configure app.ai.enabled and the remote AI service.");
        }
        var tenant = tenantContextFactory.fromSecurity();
        if (providerQuota != null) {
            providerQuota.acquire(tenant, (int) Math.min(Integer.MAX_VALUE, Math.max(1L, file == null ? 0L : file.getSize() / 4L)));
        }
        WineLabelRead read = vision.read(file);
        return ApiResult.ok(sommelierService.identifyFromLabel(read, tenant));
    }

    @GetMapping("/wines/{id}")
    public ApiResult<WineAssistantResponse> wine(@PathVariable long id) {
        return ApiResult.ok(sommelierService.wine(id, tenantContextFactory.fromSecurity()));
    }

    @PostMapping("/pitch")
    public ApiResult<PitchResponse> pitch(@Valid @RequestBody PitchRequest request) {
        var tenant = tenantContextFactory.fromSecurity();
        if (providerQuota != null) providerQuota.acquire(tenant, AiProviderQuotaService.estimate(String.valueOf(request)));
        return ApiResult.ok(sommelierService.pitch(request, tenant));
    }

    @PostMapping("/similar")
    public ApiResult<SimilarResponse> similar(@Valid @RequestBody SimilarRequest request) {
        var tenant = tenantContextFactory.fromSecurity();
        return ApiResult.ok(sommelierService.similar(request, tenant));
    }

    @PostMapping("/ask")
    public ApiResult<AskResponse> ask(@Valid @RequestBody AskRequest request) {
        var tenant = tenantContextFactory.fromSecurity();
        if (providerQuota != null) providerQuota.acquire(tenant, AiProviderQuotaService.estimate(String.valueOf(request)));
        return ApiResult.ok(sommelierService.ask(request, tenant));
    }

    @PostMapping("/feedback")
    public ApiResult<Void> feedback(@Valid @RequestBody FeedbackRequest request) {
        sommelierService.feedback(request, tenantContextFactory.fromSecurity());
        return ApiResult.ok();
    }
}
