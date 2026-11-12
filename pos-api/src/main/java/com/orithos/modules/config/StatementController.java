package com.orithos.modules.config;

import com.orithos.common.ApiResult;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/statements")
public class StatementController {

    private final StatementMapper mapper;
    private final PermissionAccess permissions;

    public StatementController(StatementMapper mapper, PermissionAccess permissions) {
        this.mapper = mapper;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<List<Statement>> list() {
        List<Statement> all = mapper.findAll();
        if (all.isEmpty()) {
            Statement statement = new Statement();
            statement.setName("Statement");
            mapper.insert(statement);
            all = mapper.findAll();
        }
        return ApiResult.ok(all);
    }

    @GetMapping("/{id}")
    public ApiResult<Statement> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<Statement> create(@RequestBody Statement s) {
        permissions.requirePermission("settings.store");
        mapper.insert(s);
        return ApiResult.ok(s);
    }

    @PutMapping("/{id}")
    public ApiResult<Statement> update(@PathVariable Long id, @RequestBody Statement s) {
        permissions.requirePermission("settings.store");
        s.setId(id);
        mapper.update(s);
        return ApiResult.ok(s);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        mapper.delete(id);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/clone")
    public ApiResult<Statement> clone(@PathVariable Long id) {
        permissions.requirePermission("settings.store");
        Statement s = mapper.findById(id);
        if (s == null) return ApiResult.ok(null);
        s.setName(s.getName() + " (copy)");
        mapper.insert(s);
        return ApiResult.ok(s);
    }
}
