package com.orithos.modules.ai.sommelier;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AiProviderConfig;
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
    @Value("${app.ai.enabled:false}")
    private boolean aiEnabled;
    @Value("${spring.ai.dashscope.base-url:https://dashscope.aliyuncs.com}")
    private String dashScopeBaseUrl;

    public SommelierController(
            SommelierService sommelierService,
            TenantContextFactory tenantContextFactory,
            ObjectProvider<WineLabelVisionService> visionService) {
        this.sommelierService = sommelierService;
        this.tenantContextFactory = tenantContextFactory;
        this.visionService = visionService;
    }

    @PostMapping("/recommend")
    public ApiResult<RecommendResponse> recommend(@Valid @RequestBody RecommendRequest request) {
        return ApiResult.ok(sommelierService.recommend(request, tenantContextFactory.fromSecurity()));
    }

    @GetMapping("/identify")
    public ApiResult<IdentifyResponse> identify(@RequestParam String q) {
        return ApiResult.ok(sommelierService.identify(q, tenantContextFactory.fromSecurity()));
    }

    @PostMapping(value = "/identify-image", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<IdentifyImageResponse> identifyImage(@RequestParam("file") MultipartFile file) {
        WineLabelVisionService vision = visionService.getIfAvailable();
        if (!aiEnabled || vision == null || !AiProviderConfig.isValidBaseUrl(dashScopeBaseUrl)) {
            throw new BusinessException(50301,
                    "Label recognition is disabled. Set app.ai.enabled=true and AI_DASHSCOPE_API_KEY.");
        }
        WineLabelRead read = vision.read(file);
        return ApiResult.ok(sommelierService.identifyFromLabel(read, tenantContextFactory.fromSecurity()));
    }

    @GetMapping("/wines/{id}")
    public ApiResult<WineAssistantResponse> wine(@PathVariable long id) {
        return ApiResult.ok(sommelierService.wine(id, tenantContextFactory.fromSecurity()));
    }

    @PostMapping("/pitch")
    public ApiResult<PitchResponse> pitch(@Valid @RequestBody PitchRequest request) {
        return ApiResult.ok(sommelierService.pitch(request, tenantContextFactory.fromSecurity()));
    }

    @PostMapping("/similar")
    public ApiResult<SimilarResponse> similar(@Valid @RequestBody SimilarRequest request) {
        return ApiResult.ok(sommelierService.similar(request, tenantContextFactory.fromSecurity()));
    }

    @PostMapping("/ask")
    public ApiResult<AskResponse> ask(@Valid @RequestBody AskRequest request) {
        return ApiResult.ok(sommelierService.ask(request, tenantContextFactory.fromSecurity()));
    }

    @PostMapping("/feedback")
    public ApiResult<Void> feedback(@Valid @RequestBody FeedbackRequest request) {
        sommelierService.feedback(request, tenantContextFactory.fromSecurity());
        return ApiResult.ok();
    }
}
