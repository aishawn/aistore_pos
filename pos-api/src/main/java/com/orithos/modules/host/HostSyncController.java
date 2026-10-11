package com.orithos.modules.host;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

/** Host-sync operations: host changes queue + host identifier mapping. */
@RestController
@RequestMapping("/api/host")
public class HostSyncController {

    private final HostChangeMapper changeMapper;
    private final HostIdentifierMapper identifierMapper;

    public HostSyncController(HostChangeMapper changeMapper, HostIdentifierMapper identifierMapper) {
        this.changeMapper = changeMapper;
        this.identifierMapper = identifierMapper;
    }

    @GetMapping("/changes")
    public ApiResult<List<HostChange>> hostChanges(@RequestParam(required = false) Long hostConnectionId) {
        return ApiResult.ok(changeMapper.findAll(hostConnectionId));
    }

    @GetMapping("/history")
    public ApiResult<List<HostChange>> hostHistory(@RequestParam(required = false) Long hostConnectionId) {
        return ApiResult.ok(changeMapper.findAll(hostConnectionId));
    }

    @PostMapping("/changes/{id}/apply")
    public ApiResult<Void> applyHostChange(@PathVariable Long id) {
        changeMapper.updateStatus(id, "APPLIED");
        return ApiResult.ok();
    }

    @GetMapping("/identifiers")
    public ApiResult<List<HostIdentifier>> identifiers() {
        return ApiResult.ok(identifierMapper.findAll());
    }

    @PostMapping("/identifiers")
    public ApiResult<HostIdentifier> mapHostIdentifier(@RequestBody HostIdentifier i) {
        identifierMapper.insert(i);
        return ApiResult.ok(i);
    }
}
