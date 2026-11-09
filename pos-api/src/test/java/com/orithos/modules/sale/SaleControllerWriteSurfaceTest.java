package com.orithos.modules.sale;

import com.orithos.config.NativePosGate;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verifyNoInteractions;

class SaleControllerWriteSurfaceTest {
    @Test
    void directSaleMutationsAreRetiredInFavorOfTenderedWorkflows() {
        SaleMapper mapper = mock(SaleMapper.class);
        SaleController controller = new SaleController(
                mapper,
                mock(CheckoutService.class),
                new NativePosGate("1", "postgres", "postgres", "uat", mock(JdbcTemplate.class)),
                mock(RefundService.class),
                mock(PermissionAccess.class));

        assertGone(() -> controller.create(new Sale()));
        assertGone(() -> controller.update(17L, new Sale()));
        assertGone(() -> controller.voidSale(17L));
        assertGone(() -> controller.unpark(17L));
        verifyNoInteractions(mapper);
    }

    private static void assertGone(Runnable mutation) {
        ResponseStatusException error = assertThrows(ResponseStatusException.class, mutation::run);
        assertEquals(410, error.getStatusCode().value());
    }
}
