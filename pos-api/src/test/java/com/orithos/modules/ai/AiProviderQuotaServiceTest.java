package com.orithos.modules.ai;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.TenantContext;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AiProviderQuotaServiceTest {

    private static TenantContext tenant(long vendor, long outlet) {
        return new TenantContext(vendor, 7L, outlet, java.util.List.of(outlet), java.util.Set.of("ROLE_ADMIN"));
    }

    @Test
    void requestQuotaIsScopedPerVendorAndOutlet() {
        AiProviderQuotaProperties props = new AiProviderQuotaProperties();
        props.setRequestsPerHour(2);
        props.setTokensPerHour(0);
        AiProviderQuotaService quota = new AiProviderQuotaService(props, null);

        assertDoesNotThrow(() -> quota.acquire(tenant(42L, 3L), 1));
        assertDoesNotThrow(() -> quota.acquire(tenant(42L, 3L), 1));
        BusinessException error = assertThrows(BusinessException.class,
                () -> quota.acquire(tenant(42L, 3L), 1));
        assertEquals(42901, error.getCode());
        assertDoesNotThrow(() -> quota.acquire(tenant(43L, 3L), 1));
        assertDoesNotThrow(() -> quota.acquire(tenant(42L, 4L), 1));
    }

    @Test
    void tokenQuotaIsEnforcedAndMissingOutletFailsClosed() {
        AiProviderQuotaProperties props = new AiProviderQuotaProperties();
        props.setRequestsPerHour(0);
        props.setTokensPerHour(10);
        AiProviderQuotaService quota = new AiProviderQuotaService(props, null);

        assertDoesNotThrow(() -> quota.acquire(tenant(42L, 3L), 10));
        BusinessException error = assertThrows(BusinessException.class,
                () -> quota.acquire(tenant(42L, 3L), 1));
        assertEquals(42901, error.getCode());
        TenantContext noOutlet = new TenantContext(42L, 7L, null, java.util.List.of(), java.util.Set.of());
        assertEquals(40901, assertThrows(BusinessException.class, () -> quota.acquire(noOutlet, 1)).getCode());
    }
}
