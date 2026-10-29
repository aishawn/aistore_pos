package com.orithos.modules.ai.command;

import com.orithos.security.PermissionAccess;
import org.springframework.stereotype.Service;

@Service
public class AiCommandPermissionService {
    private final PermissionAccess permissions;

    public AiCommandPermissionService(PermissionAccess permissions) { this.permissions = permissions; }

    public void requirePreview() { permissions.requirePermission("ai.command.preview"); }
    public void requireConfirm() { permissions.requirePermission("ai.command.confirm"); }
}
