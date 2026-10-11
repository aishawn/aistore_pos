package com.orithos.modules.webhook;

import com.orithos.common.ApiResult;
import com.orithos.common.Ids;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/webhooks")
public class WebhookController {

    private final WebhookMapper mapper;

    public WebhookController(WebhookMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<Webhook>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<Webhook> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<Webhook> create(@RequestBody Webhook w) {
        if (w.getActive() == null) {
            w.setActive(true);
        }
        if (w.getSignatureKey() == null) {
            w.setSignatureKey(Ids.randomHex());
        }
        mapper.insert(w);
        return ApiResult.ok(w);
    }

    @PutMapping("/{id}")
    public ApiResult<Webhook> update(@PathVariable Long id, @RequestBody Webhook w) {
        w.setId(id);
        mapper.update(w);
        return ApiResult.ok(w);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/activate")
    public ApiResult<Void> activate(@PathVariable Long id) {
        mapper.activate(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/deactivate")
    public ApiResult<Void> deactivate(@PathVariable Long id) {
        mapper.deactivate(id);
        return ApiResult.ok();
    }

    @PutMapping("/{id}/regenerate-signature")
    public ApiResult<Void> regenerateSignature(@PathVariable Long id) {
        mapper.updateSignature(id, Ids.randomHex());
        return ApiResult.ok();
    }
}
