package com.orithos.modules.eftpos;

import com.orithos.config.EftposProperties;
import com.orithos.modules.eftpos.dto.CreateEftposAttemptRequest;
import com.orithos.modules.eftpos.dto.UpsertRegisterEftposBindingRequest;
import com.orithos.modules.register.Register;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.security.AuthUser;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.context.SecurityContextHolder;

import java.math.BigDecimal;
import java.util.Optional;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.lenient;
import static org.mockito.Mockito.when;

@ExtendWith(MockitoExtension.class)
class EftposServiceTest {
    @Mock
  private EftposRepository repository;
    @Mock
    private RegisterMapper registerMapper;

    private EftposService service;

    @BeforeEach
    void setUp() {
        EftposProperties properties = new EftposProperties();
        properties.setTestMode(true);
        service = new EftposService(repository, registerMapper, properties);
        SecurityContextHolder.getContext().setAuthentication(new UsernamePasswordAuthenticationToken(
                new AuthUser(9L, "tester", false, 2L, 1L), null));
        Register register = new Register();
        register.setId(12L);
        register.setOutletId(2L);
        lenient().when(registerMapper.findById(12L)).thenReturn(register);
    }

    @AfterEach
    void tearDown() {
        SecurityContextHolder.clearContext();
    }

    @Test
    void createsAttemptWithConnectorChallenge() {
        when(repository.findBinding(1L, 12L)).thenReturn(Optional.of(binding(true)));
        when(repository.findAttemptByOrderUuid(1L, "order-1")).thenReturn(Optional.empty());
        when(repository.hasActiveAttempt(1L, 12L)).thenReturn(false);
        when(repository.insertAttempt(any())).thenReturn(77L);
        when(repository.findAttemptById(1L, 77L)).thenReturn(Optional.of(attempt(77L)));

        var view = service.createAttempt(12L, new CreateEftposAttemptRequest(
                "order-1", new BigDecimal("12.50"), "quote-sig"));

        assertEquals(77L, view.attemptId());
        assertEquals("PENDING", view.status());
        assertNotNull(view.connectorChallenge());
    }

    @Test
    void rejectsCheckoutWhenAttemptAmountDiffers() {
        EftposProperties enforced = new EftposProperties();
        enforced.setEnforceCardCapture(true);
        EftposService enforcedService = new EftposService(repository, registerMapper, enforced);
        when(repository.findAttemptByOrderUuid(1L, "order-2")).thenReturn(Optional.of(
                new EftposRepository.AttemptRow(
                        9L, 1L, 2L, 12L, "order-2", 500, "AUD",
                        "sig", EftposPaymentStatuses.APPROVED, "T1", "challenge")));
        org.junit.jupiter.api.Assertions.assertThrows(com.orithos.common.BusinessException.class, () ->
                enforcedService.requireApprovedAttemptForCheckout("order-2", 12L, new BigDecimal("12.50")));
    }

    @Test
    void bindRegisterRevealsTokenOnFirstSave() {
        when(repository.findBinding(1L, 12L)).thenReturn(Optional.empty());

        var view = service.saveBinding(12L, new UpsertRegisterEftposBindingRequest(
                true, true, "test", "http://127.0.0.1:9167",
                "Register 1", "PAX", "CBA", false));

        assertNotNull(view.revealedConnectorToken());
    }

    private static EftposRepository.BindingRow binding(boolean paymentsEnabled) {
        return new EftposRepository.BindingRow(
                1L, 2L, 12L, true, paymentsEnabled, "test",
                "http://127.0.0.1:9167", "Register 1", "PAX", "CBA",
                UUID.randomUUID().toString().replace("-", ""), null);
    }

    private static EftposRepository.AttemptRow attempt(long id) {
        return new EftposRepository.AttemptRow(
                id, 1L, 2L, 12L, "order-1", 1250, "AUD",
                "quote-sig", EftposPaymentStatuses.PENDING, null, "challenge");
    }
}