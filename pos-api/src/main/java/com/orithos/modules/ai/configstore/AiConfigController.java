package com.orithos.modules.ai.configstore;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.modules.ai.AiProviderConfig;
import com.orithos.modules.ai.AiTranscriptionService;
import com.orithos.modules.ai.PosAssistantGraphService;
import com.orithos.modules.ai.invoice.InvoiceVisionService;
import com.orithos.modules.ai.sommelier.WineLabelVisionService;
import com.orithos.security.AdminAccess;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * CRUD for DB-backed intents / slots / prompts. Changes take effect after cache invalidate.
 */
@RestController
@RequestMapping("/api/ai/config")
public class AiConfigController {

    private final AiIntentMapper intentMapper;
    private final AiSlotMapper slotMapper;
    private final AiSlotValueMapper slotValueMapper;
    private final AiPromptMapper promptMapper;
    private final IntentConfigService configService;
    private final ObjectProvider<PosAssistantGraphService> graphService;
    private final ObjectProvider<AiTranscriptionService> transcriptionService;
    private final ObjectProvider<WineLabelVisionService> labelVisionService;
    private final ObjectProvider<InvoiceVisionService> invoiceVisionService;
    private final boolean aiEnabled;
    @Value("${AI_SERVICE_BASE_URL:https://ai.orithos.com.au}")
    private String aiServiceBaseUrl;
    @Value("${AI_SERVICE_TOKEN:}")
    private String aiServiceToken;

    public AiConfigController(AiIntentMapper intentMapper,
                              AiSlotMapper slotMapper,
                              AiSlotValueMapper slotValueMapper,
                              AiPromptMapper promptMapper,
                              IntentConfigService configService,
                              ObjectProvider<PosAssistantGraphService> graphService,
                              ObjectProvider<AiTranscriptionService> transcriptionService,
                              ObjectProvider<WineLabelVisionService> labelVisionService,
                              ObjectProvider<InvoiceVisionService> invoiceVisionService,
                              @Value("${app.ai.enabled:false}") boolean aiEnabled) {
        this.intentMapper = intentMapper;
        this.slotMapper = slotMapper;
        this.slotValueMapper = slotValueMapper;
        this.promptMapper = promptMapper;
        this.configService = configService;
        this.graphService = graphService;
        this.transcriptionService = transcriptionService;
        this.labelVisionService = labelVisionService;
        this.invoiceVisionService = invoiceVisionService;
        this.aiEnabled = aiEnabled;
    }

    @PostMapping("/reload")
    public ApiResult<Map<String, Object>> reload() {
        AdminAccess.requireAdmin();
        IntentConfigService.Snapshot snap = configService.reload();
        return ApiResult.ok(Map.of(
                "intents", snap.intents().size(),
                "slots", snap.slots().size(),
                "prompts", snap.prompts().size(),
                "aiTriggers", snap.aiTriggerKeywords().size()
        ));
    }

    /** Client-facing UI config (Sell panel AI trigger keywords, capability flags, etc.). */
    @GetMapping("/client")
    public ApiResult<Map<String, Object>> clientConfig() {
        IntentConfigService.Snapshot snap = configService.getSnapshot();
        Map<String, Object> data = new LinkedHashMap<>();
        data.put("enabled", aiEnabled);
        // A bean can exist while the provider key is absent. Do not advertise
        // a capability that will fail on the first request.
        boolean providerReady = AiProviderConfig.isValidBaseUrl(aiServiceBaseUrl)
                && aiServiceToken != null && !aiServiceToken.isBlank();
        data.put("assistantAvailable", aiEnabled && providerReady && graphService.getIfAvailable() != null);
        data.put("transcriptionAvailable", aiEnabled && providerReady && transcriptionService.getIfAvailable() != null);
        data.put("labelVisionAvailable", aiEnabled && providerReady && labelVisionService.getIfAvailable() != null);
        data.put("invoiceVisionAvailable", aiEnabled && providerReady && invoiceVisionService.getIfAvailable() != null);
        data.put("aiTriggerKeywords", snap.aiTriggerKeywords());
        return ApiResult.ok(data);
    }

    // --- intents ---

    @GetMapping("/intents")
    public ApiResult<List<AiIntent>> listIntents() {
        return ApiResult.ok(intentMapper.findAll());
    }

    @PostMapping("/intents")
    public ApiResult<AiIntent> createIntent(@RequestBody AiIntent body) {
        AdminAccess.requireAdmin();
        requireCode(body.getCode());
        if (intentMapper.findByCode(body.getCode()) != null) {
            throw new BusinessException(40001, "Intent code already exists: " + body.getCode());
        }
        if (body.getEnabled() == null) body.setEnabled(true);
        if (body.getSortOrder() == null) body.setSortOrder(0);
        intentMapper.insert(body);
        configService.invalidate();
        return ApiResult.ok(intentMapper.findById(body.getId()));
    }

    @PutMapping("/intents/{id}")
    public ApiResult<AiIntent> updateIntent(@PathVariable Long id, @RequestBody AiIntent body) {
        AdminAccess.requireAdmin();
        AiIntent existing = intentMapper.findById(id);
        if (existing == null) throw new BusinessException(40401, "Intent not found");
        body.setId(id);
        intentMapper.update(body);
        configService.invalidate();
        return ApiResult.ok(intentMapper.findById(id));
    }

    @DeleteMapping("/intents/{id}")
    public ApiResult<Void> deleteIntent(@PathVariable Long id) {
        AdminAccess.requireAdmin();
        intentMapper.delete(id);
        configService.invalidate();
        return ApiResult.ok();
    }

    // --- slots ---

    @GetMapping("/slots")
    public ApiResult<List<AiSlot>> listSlots() {
        return ApiResult.ok(slotMapper.findAll());
    }

    @PostMapping("/slots")
    public ApiResult<AiSlot> createSlot(@RequestBody AiSlot body) {
        AdminAccess.requireAdmin();
        requireCode(body.getCode());
        if (slotMapper.findByCode(body.getCode()) != null) {
            throw new BusinessException(40001, "Slot code already exists: " + body.getCode());
        }
        if (body.getEnabled() == null) body.setEnabled(true);
        if (body.getSortOrder() == null) body.setSortOrder(0);
        if (body.getValueType() == null) body.setValueType("string");
        if (body.getMaxLength() == null) body.setMaxLength(100);
        slotMapper.insert(body);
        configService.invalidate();
        return ApiResult.ok(slotMapper.findById(body.getId()));
    }

    @PutMapping("/slots/{id}")
    public ApiResult<AiSlot> updateSlot(@PathVariable Long id, @RequestBody AiSlot body) {
        AdminAccess.requireAdmin();
        if (slotMapper.findById(id) == null) throw new BusinessException(40401, "Slot not found");
        body.setId(id);
        slotMapper.update(body);
        configService.invalidate();
        return ApiResult.ok(slotMapper.findById(id));
    }

    @DeleteMapping("/slots/{id}")
    public ApiResult<Void> deleteSlot(@PathVariable Long id) {
        AdminAccess.requireAdmin();
        slotMapper.delete(id);
        configService.invalidate();
        return ApiResult.ok();
    }

    // --- slot values ---

    @GetMapping("/slot-values")
    public ApiResult<List<AiSlotValue>> listSlotValues(@RequestParam(required = false) String slotCode) {
        if (slotCode != null && !slotCode.isBlank()) {
            return ApiResult.ok(slotValueMapper.findEnabledBySlot(slotCode));
        }
        return ApiResult.ok(slotValueMapper.findAll());
    }

    @PostMapping("/slot-values")
    public ApiResult<AiSlotValue> createSlotValue(@RequestBody AiSlotValue body) {
        AdminAccess.requireAdmin();
        requireCode(body.getSlotCode());
        requireCode(body.getValueKey());
        if (body.getValue() == null || body.getValue().isBlank()) {
            throw new BusinessException(40001, "value is required");
        }
        if (body.getEnabled() == null) body.setEnabled(true);
        if (body.getSortOrder() == null) body.setSortOrder(0);
        slotValueMapper.insert(body);
        configService.invalidate();
        return ApiResult.ok(slotValueMapper.findById(body.getId()));
    }

    @PutMapping("/slot-values/{id}")
    public ApiResult<AiSlotValue> updateSlotValue(@PathVariable Long id, @RequestBody AiSlotValue body) {
        AdminAccess.requireAdmin();
        if (slotValueMapper.findById(id) == null) throw new BusinessException(40401, "Slot value not found");
        body.setId(id);
        slotValueMapper.update(body);
        configService.invalidate();
        return ApiResult.ok(slotValueMapper.findById(id));
    }

    @DeleteMapping("/slot-values/{id}")
    public ApiResult<Void> deleteSlotValue(@PathVariable Long id) {
        AdminAccess.requireAdmin();
        slotValueMapper.delete(id);
        configService.invalidate();
        return ApiResult.ok();
    }

    // --- prompts ---

    @GetMapping("/prompts")
    public ApiResult<List<AiPrompt>> listPrompts() {
        return ApiResult.ok(promptMapper.findAll());
    }

    @PostMapping("/prompts")
    public ApiResult<AiPrompt> createPrompt(@RequestBody AiPrompt body) {
        AdminAccess.requireAdmin();
        requireCode(body.getCode());
        if (body.getContent() == null || body.getContent().isBlank()) {
            throw new BusinessException(40001, "content is required");
        }
        if (promptMapper.findByCode(body.getCode()) != null) {
            throw new BusinessException(40001, "Prompt code already exists: " + body.getCode());
        }
        if (body.getEnabled() == null) body.setEnabled(true);
        if (body.getName() == null) body.setName(body.getCode());
        promptMapper.insert(body);
        configService.invalidate();
        return ApiResult.ok(promptMapper.findById(body.getId()));
    }

    @PutMapping("/prompts/{id}")
    public ApiResult<AiPrompt> updatePrompt(@PathVariable Long id, @RequestBody AiPrompt body) {
        AdminAccess.requireAdmin();
        if (promptMapper.findById(id) == null) throw new BusinessException(40401, "Prompt not found");
        body.setId(id);
        promptMapper.update(body);
        configService.invalidate();
        return ApiResult.ok(promptMapper.findById(id));
    }

    @DeleteMapping("/prompts/{id}")
    public ApiResult<Void> deletePrompt(@PathVariable Long id) {
        AdminAccess.requireAdmin();
        promptMapper.delete(id);
        configService.invalidate();
        return ApiResult.ok();
    }

    private static void requireCode(String code) {
        if (code == null || code.isBlank()) {
            throw new BusinessException(40001, "code is required");
        }
    }
}
