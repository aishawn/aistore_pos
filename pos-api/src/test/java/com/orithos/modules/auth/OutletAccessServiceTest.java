package com.orithos.modules.auth;

import com.orithos.common.BusinessException;
import com.orithos.modules.register.Outlet;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.register.Register;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.user.entity.User;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;


import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class OutletAccessServiceTest {

    @Mock OutletMapper outletMapper;
    @Mock RegisterMapper registerMapper;
    @InjectMocks OutletAccessService service;

    private User clerk;
    private Outlet outlet;

    @BeforeEach
    void setUp() {
        clerk = new User();
        clerk.setId(10L);
        clerk.setIsAdmin(false);
        clerk.setOutletId(1L);
        outlet = new Outlet();
        outlet.setId(2L);
        outlet.setVendorId(5L);
    }

    @Test
    void adminCanAccessAnyOutletInVendor() {
        User admin = new User();
        admin.setIsAdmin(true);
        admin.setVendorId(5L);
        when(outletMapper.findByIdAndVendor(2L, 5L)).thenReturn(outlet);
        assertDoesNotThrow(() -> service.requireOutletAccess(2L, admin, 5L));
    }

    @Test
    void clerkDeniedForeignOutlet() {
        when(outletMapper.findByIdAndVendor(2L, 5L)).thenReturn(outlet);
        assertThrows(BusinessException.class, () -> service.requireOutletAccess(2L, clerk, 5L));
    }

    @Test
    void registerMustBelongToOutlet() {
        Register register = new Register();
        register.setId(9L);
        register.setOutletId(1L);
        when(registerMapper.findByIdAndVendor(9L, 5L)).thenReturn(register);
        assertThrows(BusinessException.class,
                () -> service.requireRegisterForOutlet(9L, 2L, 5L));
    }

    @Test
    void registerAcceptedWhenOutletMatches() {
        Register register = new Register();
        register.setId(9L);
        register.setOutletId(2L);
        when(registerMapper.findByIdAndVendor(eq(9L), eq(5L))).thenReturn(register);
        assertDoesNotThrow(() -> service.requireRegisterForOutlet(9L, 2L, 5L));
    }
}
