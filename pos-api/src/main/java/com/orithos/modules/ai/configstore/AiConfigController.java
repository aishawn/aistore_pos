package com.orithos.modules.ai.configstore;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import org.springframework.web.bind.annotation.*;

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

    public AiConfigController(AiIntentMapper intentMapper,
                              AiSlotMapper slotMapper,
                              AiSlotValueMapper slotValueMapper,
                              AiPromptMapper promptMapper,
                              IntentConfigService configService) {
        this.intentMapper = intentMapper;
        this.slotMapper = slotMapper;
        this.slotValueMapper = slotValueMapper;
        this.promptMapper = promptMapper;
        this.configService = configService;
    }

    @PostMapping("/reload")
    public ApiResult<Map<String, Object>> reload() {
        IntentConfigService.Snapshot snap = configService.reload();
        return ApiResult.ok(Map.of(
                "intents", snap.intents().size(),
                "slots", snap.slots().size(),
                "prompts", snap.prompts().size(),
                "aiTriggers", snap.aiTriggerKeywords().size()
        ));
    }

    /** Client-facing UI config (Sell panel AI trigger keywords, etc.). */
    @GetMapping("/client")
    public ApiResult<Map<String, Object>> clientConfig() {
        IntentConfigService.Snapshot snap = configService.getSnapshot();
        return ApiResult.ok(Map.of(
                "aiTriggerKeywords", snap.aiTriggerKeywords()
        ));
    }

    // --- intents ---

    @GetMapping("/intents")
    public ApiResult<List<AiIntent>> listIntents() {
        return ApiResult.ok(intentMapper.findAll());
    }

    @PostMapping("/intents")
    public ApiResult<AiIntent> createIntent(@RequestBody AiIntent body) {
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
        AiIntent existing = intentMapper.findById(id);
        if (existing == null) throw new BusinessException(40401, "Intent not found");
        body.setId(id);
        intentMapper.update(body);
        configService.invalidate();
        return ApiResult.ok(intentMapper.findById(id));
    }

    @DeleteMapping("/intents/{id}")
    public ApiResult<Void> deleteIntent(@PathVariable Long id) {
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
        if (slotMapper.findById(id) == null) throw new BusinessException(40401, "Slot not found");
        body.setId(id);
        slotMapper.update(body);
        configService.invalidate();
        return ApiResult.ok(slotMapper.findById(id));
    }

    @DeleteMapping("/slots/{id}")
    public ApiResult<Void> deleteSlot(@PathVariable Long id) {
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
        if (slotValueMapper.findById(id) == null) throw new BusinessException(40401, "Slot value not found");
        body.setId(id);
        slotValueMapper.update(body);
        configService.invalidate();
        return ApiResult.ok(slotValueMapper.findById(id));
    }

    @DeleteMapping("/slot-values/{id}")
    public ApiResult<Void> deleteSlotValue(@PathVariable Long id) {
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
        if (promptMapper.findById(id) == null) throw new BusinessException(40401, "Prompt not found");
        body.setId(id);
        promptMapper.update(body);
        configService.invalidate();
        return ApiResult.ok(promptMapper.findById(id));
    }

    @DeleteMapping("/prompts/{id}")
    public ApiResult<Void> deletePrompt(@PathVariable Long id) {
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
