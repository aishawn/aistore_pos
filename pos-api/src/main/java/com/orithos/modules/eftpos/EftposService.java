package com.orithos.modules.eftpos;

import com.orithos.common.BusinessException;
import com.orithos.config.EftposProperties;
import com.orithos.modules.eftpos.dto.CreateEftposAttemptRequest;
import com.orithos.modules.eftpos.dto.EftposAttemptView;
import com.orithos.modules.eftpos.dto.EftposConnectorCallbackRequest;
import com.orithos.modules.eftpos.dto.RegisterEftposBindingView;
import com.orithos.modules.eftpos.dto.UpsertRegisterEftposBindingRequest;
import com.orithos.modules.register.Register;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Locale;
import java.util.UUID;

@Service
public class EftposService {
    private final EftposRepository repository;
    private final RegisterMapper registerMapper;
    private final EftposProperties properties;

    public EftposService(EftposRepository repository, RegisterMapper registerMapper, EftposProperties properties) {
        this.repository = repository;
        this.registerMapper = registerMapper;
        this.properties = properties;
    }

    public RegisterEftposBindingView getBinding(long registerId) {
        Scope scope = scope();
        requireRegister(registerId, scope);
        return repository.findBinding(scope.vendorId(), registerId)
                .map(this::toBindingView)
                .orElse(new RegisterEftposBindingView(
                        registerId, false, false, "local_connector", "http://127.0.0.1:9167",
                        null, null, null, false));
    }

    @Transactional
    public RegisterEftposBindingView saveBinding(long registerId, UpsertRegisterEftposBindingRequest body) {
        Scope scope = scope();
        requireRegister(registerId, scope);
        if (body == null) throw new BusinessException(40000, "Binding body is required.");
        String mode = normalise(body.integrationMode(), "local_connector");
        if (!mode.equals("local_connector") && !mode.equals("test")) {
            throw new BusinessException(40000, "Unsupported EFTPOS integration mode.");
        }
        String connectorUrl = normalise(body.connectorBaseUrl(), "http://127.0.0.1:9167");
        var existingBinding = repository.findBinding(scope.vendorId(), registerId);
        boolean isNewBinding = existingBinding.isEmpty();
        String existingToken = existingBinding
                .map(EftposRepository.BindingRow::connectorToken)
                .orElse(UUID.randomUUID().toString().replace("-", ""));
        String connectorToken = body.rotateConnectorToken() ? UUID.randomUUID().toString().replace("-", "") : existingToken;
        boolean paymentsEnabled = body.paymentsEnabled()
                && body.enabled()
                && (properties.isTestMode() || mode.equals("local_connector"));
        EftposRepository.BindingRow binding = new EftposRepository.BindingRow(
                scope.vendorId(),
                scope.outletId(),
                registerId,
                body.enabled(),
                paymentsEnabled,
                mode,
                connectorUrl,
                trim(body.terminalLabel()),
                trim(body.terminalModel()),
                trim(body.acquirer()),
                connectorToken,
                null
        );
        repository.upsertBinding(binding);
        String revealed = body.rotateConnectorToken() || isNewBinding ? connectorToken : null;
        return withRevealedToken(toBindingView(binding), revealed);
    }

    public EftposAttemptView getAttemptByOrderUuid(long registerId, String orderUuid) {
        Scope scope = scope();
        requireRegister(registerId, scope);
        if (orderUuid == null || orderUuid.isBlank()) {
            throw new BusinessException(40000, "An order reference is required.");
        }
        EftposRepository.AttemptRow attempt = repository.findAttemptByOrderUuid(scope.vendorId(), orderUuid.trim())
                .orElseThrow(() -> new BusinessException(40400, "No EFTPOS payment attempt found for this order."));
        if (attempt.registerId() != registerId) throw new BusinessException(40900, "This payment attempt belongs to a different register.");
        return toAttemptView(attempt, bindingForRegister(scope.vendorId(), registerId));
    }

    @Transactional
    public EftposAttemptView createAttempt(long registerId, CreateEftposAttemptRequest body) {
        Scope scope = scope();
        requireRegister(registerId, scope);
        EftposRepository.BindingRow binding = bindingForRegister(scope.vendorId(), registerId);
        if (!binding.enabled() || !binding.paymentsEnabled()) {
            throw new BusinessException(40900, "EFTPOS is not enabled for this register.");
        }
        if (body == null || body.orderUuid() == null || body.orderUuid().isBlank()) {
            throw new BusinessException(40000, "An order reference is required.");
        }
        if (body.expectedTotal() == null || body.expectedTotal().signum() <= 0) {
            throw new BusinessException(40000, "The payment amount must be greater than zero.");
        }
        String orderUuid = body.orderUuid().trim();
        int amountCents = toCents(body.expectedTotal());
        var existing = repository.findAttemptByOrderUuid(scope.vendorId(), orderUuid);
        if (existing.isPresent()) {
            EftposRepository.AttemptRow row = existing.get();
            if (row.amountCents() != amountCents) {
                throw new BusinessException(40900, "This order already has a payment attempt with a different amount.");
            }
            if (row.registerId() != registerId) {
                throw new BusinessException(40900, "This payment attempt belongs to a different register.");
            }
            return toAttemptView(row, binding);
        }
        if (repository.hasActiveAttempt(scope.vendorId(), registerId)) {
            throw new BusinessException(40900, "This register already has an in-progress EFTPOS attempt.");
        }
        String challenge = UUID.randomUUID().toString().replace("-", "");
        long attemptId = repository.insertAttempt(new EftposRepository.AttemptRow(
                0,
                scope.vendorId(),
                scope.outletId(),
                registerId,
                orderUuid,
                amountCents,
                "AUD",
                trim(body.quoteSignature()),
                EftposPaymentStatuses.PENDING,
                null,
                challenge
        ));
        return toAttemptView(repository.findAttemptById(scope.vendorId(), attemptId).orElseThrow(), binding);
    }

    @Transactional
    public EftposAttemptView connectorCallback(EftposConnectorCallbackRequest body, String connectorToken) {
        if (body == null || body.attemptId() == null || body.connectorChallenge() == null || body.connectorChallenge().isBlank()) {
            throw new BusinessException(40000, "Connector callback is incomplete.");
        }
        EftposRepository.AttemptRow attempt = repository.findAttemptByIdGlobal(body.attemptId())
                .orElseThrow(() -> new BusinessException(40400, "Payment attempt not found."));
        EftposRepository.BindingRow binding = bindingForRegister(attempt.vendorId(), attempt.registerId());
        if (connectorToken == null || connectorToken.isBlank() || !connectorToken.equals(binding.connectorToken())) {
            throw new BusinessException(40300, "Connector token rejected.");
        }
        if (!attempt.connectorChallenge().equals(body.connectorChallenge())) {
            throw new BusinessException(40300, "Connector challenge rejected.");
        }
        String status = normalise(body.status(), EftposPaymentStatuses.UNKNOWN);
        String providerReference = trim(body.providerReference());
        if (!properties.isTestMode() && providerReference != null
                && providerReference.toUpperCase(Locale.ROOT).startsWith("LAB-")) {
            throw new BusinessException(40300, "Lab payment approvals are not accepted outside EFTPOS test mode.");
        }
        if (!status.equals(EftposPaymentStatuses.APPROVED)
                && !status.equals(EftposPaymentStatuses.DECLINED)
                && !status.equals(EftposPaymentStatuses.CANCELLED)
                && !status.equals(EftposPaymentStatuses.UNKNOWN)
                && !status.equals(EftposPaymentStatuses.APPROVED_PENDING_SETTLEMENT)) {
            throw new BusinessException(40000, "Unsupported payment status from connector.");
        }
        repository.updateAttemptStatus(attempt.vendorId(), attempt.id(), status, providerReference);
        return toAttemptView(repository.findAttemptById(attempt.vendorId(), attempt.id()).orElseThrow(), binding);
    }

    @Transactional
    public EftposAttemptView simulateApproval(long registerId, long attemptId) {
        if (!properties.isTestMode()) {
            throw new BusinessException(40300, "EFTPOS test mode is disabled.");
        }
        Scope scope = scope();
        requireRegister(registerId, scope);
        EftposRepository.AttemptRow attempt = repository.findAttemptById(scope.vendorId(), attemptId)
                .orElseThrow(() -> new BusinessException(40400, "Payment attempt not found."));
        if (attempt.registerId() != registerId) throw new BusinessException(40900, "This payment attempt belongs to a different register.");
        if (!EftposPaymentStatuses.PENDING.equals(attempt.status()) && !EftposPaymentStatuses.UNKNOWN.equals(attempt.status())) {
            throw new BusinessException(40900, "This payment attempt is not waiting for approval.");
        }
        String providerReference = "TEST-" + attempt.id();
        repository.updateAttemptStatus(attempt.vendorId(), attempt.id(), EftposPaymentStatuses.APPROVED, providerReference);
        EftposRepository.BindingRow binding = bindingForRegister(scope.vendorId(), registerId);
        return toAttemptView(repository.findAttemptById(scope.vendorId(), attempt.id()).orElseThrow(), binding);
    }

    @Transactional
    public EftposAttemptView cancelActiveAttempt(long registerId) {
        Scope scope = scope();
        requireRegister(registerId, scope);
        EftposRepository.AttemptRow attempt = repository.findLatestActiveAttempt(scope.vendorId(), registerId)
                .orElseThrow(() -> new BusinessException(40400, "No in-progress EFTPOS attempt found for this register."));
        repository.updateAttemptStatus(scope.vendorId(), attempt.id(), EftposPaymentStatuses.CANCELLED, "CANCELLED_BY_REGISTER");
        EftposRepository.BindingRow binding = bindingForRegister(scope.vendorId(), registerId);
        return toAttemptView(repository.findAttemptById(scope.vendorId(), attempt.id()).orElseThrow(), binding);
    }

    public void requireApprovedAttemptForCheckout(String orderUuid, Long registerId, BigDecimal expectedTotal) {
        if (!properties.isEnforceCardCapture()) return;
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null || orderUuid == null || orderUuid.isBlank()) return;
        EftposRepository.AttemptRow attempt = repository.findAttemptByOrderUuid(vendorId, orderUuid.trim()).orElse(null);
        if (attempt == null) {
            throw new BusinessException(40900, "Card payment must be approved on the terminal before checkout.");
        }
        if (registerId != null && attempt.registerId() != registerId) {
            throw new BusinessException(40900, "The EFTPOS approval does not match this register.");
        }
        if (expectedTotal != null && attempt.amountCents() != toCents(expectedTotal)) {
            throw new BusinessException(40900, "The EFTPOS approval amount does not match this checkout.");
        }
        if (!EftposPaymentStatuses.APPROVED.equals(attempt.status())
                && !EftposPaymentStatuses.APPROVED_PENDING_SETTLEMENT.equals(attempt.status())) {
            throw new BusinessException(40900, "Card payment must be approved on the terminal before checkout.");
        }
    }

    private EftposRepository.BindingRow bindingForRegister(long vendorId, long registerId) {
        return repository.findBinding(vendorId, registerId)
                .orElseThrow(() -> new BusinessException(40900, "EFTPOS is not configured for this register."));
    }

    private RegisterEftposBindingView toBindingView(EftposRepository.BindingRow binding) {
        return new RegisterEftposBindingView(
                binding.registerId(),
                binding.enabled(),
                binding.paymentsEnabled(),
                binding.integrationMode(),
                binding.connectorBaseUrl(),
                binding.terminalLabel(),
                binding.terminalModel(),
                binding.acquirer(),
                binding.connectorToken() != null && !binding.connectorToken().isBlank()
        );
    }

    private RegisterEftposBindingView withRevealedToken(RegisterEftposBindingView view, String token) {
        return new RegisterEftposBindingView(
                view.registerId(),
                view.enabled(),
                view.paymentsEnabled(),
                view.integrationMode(),
                view.connectorBaseUrl(),
                view.terminalLabel(),
                view.terminalModel(),
                view.acquirer(),
                view.hasConnectorToken(),
                token
        );
    }

    private EftposAttemptView toAttemptView(EftposRepository.AttemptRow attempt, EftposRepository.BindingRow binding) {
        return new EftposAttemptView(
                attempt.id(),
                attempt.orderUuid(),
                attempt.amountCents(),
                attempt.currency(),
                attempt.status(),
                attempt.providerReference(),
                attempt.connectorChallenge(),
                binding.connectorBaseUrl(),
                binding.paymentsEnabled()
        );
    }

    private void requireRegister(long registerId, Scope scope) {
        Register register = registerMapper.findById(registerId);
        if (register == null || register.getOutletId() == null || register.getOutletId() != scope.outletId()) {
            throw new BusinessException(40400, "Register not found.");
        }
    }

    private Scope scope() {
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        if (vendorId == null || outletId == null) {
            throw new BusinessException(40100, "Authenticated vendor and outlet are required.");
        }
        return new Scope(vendorId, outletId);
    }

    private static int toCents(BigDecimal value) {
        return value.setScale(2, RoundingMode.HALF_UP).movePointRight(2).intValueExact();
    }

    private static String trim(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }

    private static String normalise(String value, String fallback) {
        if (value == null || value.isBlank()) return fallback;
        return value.trim();
    }

    private record Scope(long vendorId, long outletId) {
    }
}
