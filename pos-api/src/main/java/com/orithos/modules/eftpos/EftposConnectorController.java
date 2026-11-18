package com.orithos.modules.eftpos;

import com.orithos.common.ApiResult;
import com.orithos.modules.eftpos.dto.EftposAttemptView;
import com.orithos.modules.eftpos.dto.EftposConnectorCallbackRequest;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/eftpos/connector")
public class EftposConnectorController {
    private final EftposService service;

    public EftposConnectorController(EftposService service) {
        this.service = service;
    }

    @PostMapping("/callback")
    public ApiResult<EftposAttemptView> callback(
            @RequestHeader(value = "X-Orithos-Connector-Token", required = false) String connectorToken,
            @RequestBody EftposConnectorCallbackRequest body) {
        return ApiResult.ok(service.connectorCallback(body, connectorToken));
    }
}