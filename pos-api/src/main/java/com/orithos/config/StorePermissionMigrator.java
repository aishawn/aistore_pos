package com.orithos.config;

import com.orithos.modules.user.StorePermissionCatalog;
import com.orithos.modules.user.StorePermissionCatalog.Def;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.CommandLineRunner;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

import javax.sql.DataSource;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.Statement;
import java.util.List;

/**
 * Seeds the store permission catalog and ensures managed Admin / Manager / Clerk roles.
 * Runs after {@link AiReportSchemaMigrator} so clerk defaults can replace the blanket AI grant.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 30)
public class StorePermissionMigrator implements CommandLineRunner {

    private static final Logger log = LoggerFactory.getLogger(StorePermissionMigrator.class);

    private final DataSource dataSource;

    public StorePermissionMigrator(DataSource dataSource) {
        this.dataSource = dataSource;
    }

    @Override
    public void run(String... args) {
        try {
            seedPermissions();
            ensureManagedRole(StorePermissionCatalog.MANAGED_ADMIN, "Admin", StorePermissionCatalog.allIds());
            ensureManagedRole(StorePermissionCatalog.MANAGED_MANAGER, "Manager", StorePermissionCatalog.managerDefaultIds());
            ensureManagedRole(StorePermissionCatalog.MANAGED_CLERK, "Clerk", StorePermissionCatalog.clerkDefaultIds());
            assignOrphanUsersToClerk();
            log.info("Store permission catalog and managed roles ensured.");
        } catch (Exception e) {
            log.warn("Skipped store permission migration: {}", e.getMessage());
        }
    }

    private void seedPermissions() throws Exception {
        try (Connection c = dataSource.getConnection();
             PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO permission (id, name, safe_name, section) VALUES (?, ?, ?, ?) ON CONFLICT DO NOTHING")) {
            for (Def def : StorePermissionCatalog.all()) {
                ps.setInt(1, def.id());
                ps.setString(2, def.name());
                ps.setString(3, def.safeName());
                ps.setString(4, def.section());
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private void ensureManagedRole(String managedId, String name, List<Integer> defaultPermissionIds) throws Exception {
        try (Connection c = dataSource.getConnection()) {
            Long roleId = findManagedRoleId(c, managedId);
            boolean created = false;
            if (roleId == null) {
                try (PreparedStatement ps = c.prepareStatement(
                        "INSERT INTO role (name, managed_id) VALUES (?, ?)", Statement.RETURN_GENERATED_KEYS)) {
                    ps.setString(1, name);
                    ps.setString(2, managedId);
                    ps.executeUpdate();
                    try (ResultSet keys = ps.getGeneratedKeys()) {
                        if (!keys.next()) {
                            throw new IllegalStateException("No role id for " + managedId);
                        }
                        roleId = keys.getLong(1);
                    }
                }
                created = true;
            }
            int permCount = countRolePermissions(c, roleId);
            // Seed defaults for new roles, or when the only grant is the AI migrator's blanket 9101.
            if (created || permCount == 0 || (StorePermissionCatalog.MANAGED_CLERK.equals(managedId) && permCount == 1 && hasOnlyPermission(c, roleId, 9101))) {
                replaceRolePermissions(c, roleId, defaultPermissionIds);
            } else if (StorePermissionCatalog.MANAGED_MANAGER.equals(managedId) || StorePermissionCatalog.MANAGED_ADMIN.equals(managedId)) {
                // Expand defaults without wiping custom manager/admin matrix edits.
                insertMissingPermissions(c, roleId, defaultPermissionIds);
            }
        }
    }

    private Long findManagedRoleId(Connection c, String managedId) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT id FROM role WHERE managed_id = ? ORDER BY id ASC LIMIT 1")) {
            ps.setString(1, managedId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getLong(1) : null;
            }
        }
    }

    private int countRolePermissions(Connection c, long roleId) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT COUNT(*) FROM role_permission WHERE role_id = ?")) {
            ps.setLong(1, roleId);
            try (ResultSet rs = ps.executeQuery()) {
                return rs.next() ? rs.getInt(1) : 0;
            }
        }
    }

    private boolean hasOnlyPermission(Connection c, long roleId, int permissionId) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                "SELECT permission_id FROM role_permission WHERE role_id = ?")) {
            ps.setLong(1, roleId);
            try (ResultSet rs = ps.executeQuery()) {
                if (!rs.next()) return false;
                int only = rs.getInt(1);
                return only == permissionId && !rs.next();
            }
        }
    }

    private void replaceRolePermissions(Connection c, long roleId, List<Integer> permissionIds) throws Exception {
        try (PreparedStatement clear = c.prepareStatement("DELETE FROM role_permission WHERE role_id = ?")) {
            clear.setLong(1, roleId);
            clear.executeUpdate();
        }
        insertMissingPermissions(c, roleId, permissionIds);
    }

    private void insertMissingPermissions(Connection c, long roleId, List<Integer> permissionIds) throws Exception {
        try (PreparedStatement ps = c.prepareStatement(
                    "INSERT INTO role_permission (role_id, permission_id) VALUES (?, ?) ON CONFLICT DO NOTHING")) {
            for (Integer permissionId : permissionIds) {
                if (permissionId == null) continue;
                ps.setLong(1, roleId);
                ps.setInt(2, permissionId);
                ps.addBatch();
            }
            ps.executeBatch();
        }
    }

    private void assignOrphanUsersToClerk() throws Exception {
        try (Connection c = dataSource.getConnection()) {
            Long clerkId = findManagedRoleId(c, StorePermissionCatalog.MANAGED_CLERK);
            if (clerkId == null) return;
            try (PreparedStatement ps = c.prepareStatement(
                    "UPDATE app_user SET role_id = ? WHERE deleted_at IS NULL AND (is_admin IS NULL OR is_admin = 0) AND role_id IS NULL")) {
                ps.setLong(1, clerkId);
                int updated = ps.executeUpdate();
                if (updated > 0) {
                    log.info("Assigned {} users without a role to Clerk", updated);
                }
            }
        }
    }
}
