package com.orithos.modules.register;

import com.orithos.common.BusinessException;
import com.orithos.security.AuthUser;
import com.orithos.security.PermissionAccess;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

class RegisterControllerScopeTest {
    private final RegisterMapper registers = mock(RegisterMapper.class);
    private final OutletMapper outlets = mock(OutletMapper.class);
    private final PermissionAccess permissions = mock(PermissionAccess.class);
    private final RegisterController controller = new RegisterController(registers, outlets, permissions);

    @BeforeEach
    void authenticate() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(7L, "manager", false, 12L, 55L), null));
    }

    @AfterEach
    void clearAuthentication() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listUsesAuthenticatedVendorScope() {
        controller.list();
        verify(registers).findByVendorId(55L);
        verifyNoMoreInteractions(registers);
    }

    @Test
    void createChecksOutletOwnershipAndIgnoresClientVendor() {
        Register register = new Register();
        register.setName("Back counter");
        register.setOutletId(87L);
        register.setClosed(false);
        Outlet outlet = new Outlet();
        outlet.setId(87L);
        outlet.setVendorId(55L);
        when(outlets.findByIdAndVendor(87L, 55L)).thenReturn(outlet);

        controller.create(register);

        verify(permissions).requirePermission("settings.store");
        verify(outlets).findByIdAndVendor(87L, 55L);
        verify(registers).insert(register);
    }

    @Test
    void createRejectsOutletOwnedByAnotherVendorBeforeInsert() {
        Register register = new Register();
        register.setName("Foreign register");
        register.setOutletId(1L);
        when(outlets.findByIdAndVendor(1L, 55L)).thenReturn(null);

        assertEquals(40410, assertThrows(BusinessException.class, () -> controller.create(register)).getCode());
        verify(registers, never()).insert(any());
    }

    @Test
    void createRequiresStoreSettingsPermission() {
        doThrow(new BusinessException(40300, "You do not have permission for this action"))
                .when(permissions).requirePermission("settings.store");
        Register register = new Register();
        register.setOutletId(87L);

        assertEquals(40300, assertThrows(BusinessException.class,
                () -> controller.create(register)).getCode());
        verifyNoInteractions(outlets, registers);
    }

    @Test
    void surchargeUpdateCannotAddressAnotherVendorsRegister() {
        when(registers.findByIdAndVendor(99L, 55L)).thenReturn(null);

        assertEquals(40400, assertThrows(BusinessException.class,
                () -> controller.updateRegisterSurcharging(99L,
                        new RegisterController.SurchargingRequest("{}"))).getCode());
        verify(registers, never()).updateSurcharging(anyLong(), anyLong(), anyString());
    }
}
