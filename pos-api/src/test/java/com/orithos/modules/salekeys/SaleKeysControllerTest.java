package com.orithos.modules.salekeys;

import com.orithos.security.AuthUser;
import com.orithos.security.PermissionAccess;
import com.orithos.common.BusinessException;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoMoreInteractions;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.Mockito.when;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.lang.reflect.Field;

class SaleKeysControllerTest {
    private SaleKeysMapper mapper;
    private PermissionAccess permissions;
    private SaleKeysController controller;

    @BeforeEach
    void setUp() {
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(8L, "manager", false, 87L, 55L), null));
        mapper = mock(SaleKeysMapper.class);
        permissions = mock(PermissionAccess.class);
        controller = new SaleKeysController(mapper, permissions);
    }

    @AfterEach
    void clearSecurityContext() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void listRequiresAnAuthenticatedOutlet() {
        SecurityContextHolder.clearContext();

        assertThrows(BusinessException.class, controller::list);

        verify(mapper, never()).findAllByOutlet(anyLong());
    }

    @Test
    void createForcesCurrentOutletOnNewSet() throws Exception {
        SaleKeys set = new SaleKeys();
        Field outletId = SaleKeys.class.getDeclaredField("outletId");
        outletId.setAccessible(true);

        controller.create(set);

        assertEquals(87L, outletId.get(set));
        verify(permissions).requirePermission("settings.store");
        verify(mapper).insert(set);
    }

    @Test
    void listUsesCurrentOutlet() {
        controller.list();

        verify(mapper).findAllByOutlet(87L);
    }

    @Test
    void getDoesNotReturnASetOutsideCurrentOutlet() {
        assertThrows(BusinessException.class, () -> controller.get(91L));

        verify(mapper).findByIdAndOutlet(91L, 87L);
        verifyNoMoreInteractions(mapper);
    }

    @Test
    void cloneCopiesOnlyASetOwnedByCurrentOutlet() throws Exception {
        SaleKeys original = new SaleKeys();
        original.setId(4L);
        original.setOutletId(87L);
        original.setName("Till keys");
        when(mapper.findByIdAndOutlet(4L, 87L)).thenReturn(original);
        Field outletId = SaleKeys.class.getDeclaredField("outletId");
        outletId.setAccessible(true);

        controller.clone(4L);

        assertEquals(null, original.getId());
        assertEquals(87L, outletId.get(original));
        assertEquals("Till keys (copy)", original.getName());
        verify(permissions).requirePermission("settings.store");
        verify(mapper).insert(original);
    }

    @Test
    void updateUsesCurrentOutletAndIgnoresClientOutlet() throws Exception {
        SaleKeys existing = new SaleKeys();
        existing.setId(4L);
        existing.setOutletId(87L);
        when(mapper.findByIdAndOutlet(4L, 87L)).thenReturn(existing);
        when(mapper.updateByIdAndOutlet(4L, 87L, "Changed", "[]")).thenReturn(1);
        SaleKeys request = new SaleKeys();
        request.setId(999L);
        request.setOutletId(1L);
        request.setName("Changed");
        request.setSaleKeys("[]");
        Field outletId = SaleKeys.class.getDeclaredField("outletId");
        outletId.setAccessible(true);

        controller.update(4L, request);

        assertEquals(4L, request.getId());
        assertEquals(87L, outletId.get(request));
        verify(permissions).requirePermission("settings.store");
        verify(mapper).updateByIdAndOutlet(4L, 87L, "Changed", "[]");
    }

    @Test
    void deleteReturnsNotFoundWhenIdIsOutsideCurrentOutlet() {
        assertThrows(BusinessException.class, () -> controller.delete(91L));

        verify(permissions).requirePermission("settings.store");
        verify(mapper).deleteByIdAndOutlet(91L, 87L);
    }
}
