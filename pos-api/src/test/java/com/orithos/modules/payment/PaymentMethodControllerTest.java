package com.orithos.modules.payment;

import com.orithos.common.BusinessException;
import com.orithos.security.AuthUser;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.util.List;

import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.mockito.Mockito.*;

class PaymentMethodControllerTest {
    private final PaymentMethodMapper mapper = mock(PaymentMethodMapper.class);
    private final PermissionAccess permissions = mock(PermissionAccess.class);
    private final PaymentMethodController controller = new PaymentMethodController(mapper, permissions);

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void updateRejectsAnotherMethodWithTheSameNormalizedName() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "manager", false, 12L, 3L), null, List.of()));
        when(mapper.existsOtherByName(" cash ", 11L, 12L)).thenReturn(true);
        PaymentMethod update = new PaymentMethod();
        update.setName(" cash ");
        update.setType("CASH");

        BusinessException error = assertThrows(BusinessException.class, () -> controller.update(11L, update));

        assertEquals("payment_method_name_exists", error.getMessage());
        verify(mapper, never()).update(any(), anyLong());
    }

    @Test
    void createRejectsAnotherMethodWithTheSameNormalizedName() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "manager", false, 12L, 3L), null, List.of()));
        PaymentMethod create = new PaymentMethod();
        create.setName(" Cash ");
        create.setType("CASH");
        when(mapper.findByName(" Cash ", 12L)).thenReturn(new PaymentMethod());

        BusinessException error = assertThrows(BusinessException.class, () -> controller.create(create));

        assertEquals("payment_method_name_exists", error.getMessage());
        verify(mapper, never()).insert(any());
    }
}
