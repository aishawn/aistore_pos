package com.orithos.modules.user;

import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class StorePermissionCatalogManagerBriefTest {

    @Test
    void grantsDailyBriefToManagersButNotClerksByDefault() {
        var permission = StorePermissionCatalog.idBySafeName().get("ai.manager.brief.read");

        assertTrue(permission != null);
        assertTrue(StorePermissionCatalog.managerDefaultIds().contains(permission));
        assertFalse(StorePermissionCatalog.clerkDefaultIds().contains(permission));
    }
}
