package com.orithos.modules.register;

import com.orithos.common.BusinessException;
import com.orithos.common.AustraliaTime;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.modules.config.CompanySettingsKeys;
import com.orithos.modules.config.CompanySettingsService;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

@Service
public class RegisterSessionService {
    private final RegisterSessionMapper sessions;
    private final RegisterClosureMapper closures;
    private final CompanySettingsService companySettings;
    private final BusinessTimezoneService businessTimezone;

    public RegisterSessionService(RegisterSessionMapper sessions, RegisterClosureMapper closures,
                                  CompanySettingsService companySettings) {
        this(sessions, closures, companySettings, null);
    }

    @Autowired
    public RegisterSessionService(RegisterSessionMapper sessions, RegisterClosureMapper closures,
                                  CompanySettingsService companySettings,
                                  BusinessTimezoneService businessTimezone) {
        this.sessions = sessions;
        this.closures = closures;
        this.companySettings = companySettings;
        this.businessTimezone = businessTimezone;
    }

    private LocalDateTime localNow(Long vendorId) {
        return businessTimezone == null ? AustraliaTime.localNow() : businessTimezone.localNow(vendorId);
    }

    public List<Register> list() {
        Scope scope = scope();
        return sessions.listRegisters(scope.vendorId(), scope.outletId());
    }

    public RegisterSession current(Long registerId) {
        Scope scope = scope();
        Register register = sessions.findRegister(registerId, scope.vendorId(), scope.outletId());
        if (register == null) throw notFound();
        return sessions.findActiveSession(registerId, scope.vendorId(), scope.outletId());
    }

    public RegisterSessionSummary summary(Long registerId) {
        Scope scope = scope();
        Register register = sessions.findRegister(registerId, scope.vendorId(), scope.outletId());
        if (register == null) throw notFound();
        RegisterSession session = sessions.findActiveSession(registerId, scope.vendorId(), scope.outletId());
        if (session == null) throw conflict("There is no open register session to close.");
        LocalDateTime now = localNow(scope.vendorId());
        BigDecimal movement = nz(sessions.sumCashMovements(session.getId(), scope.vendorId(), scope.outletId()));
        BigDecimal netCash = nz(sessions.cashSalesNetOfChange(registerId, scope.outletId(), session.getOpenedAt(), now));
        BigDecimal expectedCash = session.getOpeningFloat().add(movement).add(netCash).setScale(2, RoundingMode.HALF_UP);
        List<RegisterSessionSummary.Tender> tenders = sessions.tenderTotals(registerId, scope.outletId(), session.getOpenedAt(), now)
                .stream()
                .filter(tender -> !"CASH".equalsIgnoreCase(tender.getPaymentMethodType()))
                .map(tender -> new RegisterSessionSummary.Tender(tender.getPaymentMethodId(),
                        tender.getPaymentMethodName(), tender.getPaymentMethodType(), nz(tender.getAmount())))
                .toList();
        return new RegisterSessionSummary(session.getId(), registerId, session.getOpenedAt(),
                session.getOpeningFloat(), movement, expectedCash,
                sessions.countSessionSales(registerId, scope.outletId(), session.getOpenedAt(), now),
                sessions.countUnsettledSales(registerId, scope.outletId(), session.getOpenedAt(), now),
                sessions.countUnmappedPayments(registerId, scope.outletId(), session.getOpenedAt(), now), tenders);
    }

    @Transactional
    public RegisterSession open(Long registerId, String key, BigDecimal openingFloat) {
        Scope scope = scope();
        requireKey(key);
        if (openingFloat == null || openingFloat.signum() < 0) throw bad("Opening float must be zero or greater.");
        openingFloat = money(openingFloat);
        Register existing = sessions.lockRegister(registerId, scope.vendorId(), scope.outletId());
        if (existing == null) throw notFound();
        RegisterSession replay = sessions.findOpenReplay(registerId, key);
        if (replay != null) {
            if (!scope.vendorId().equals(replay.getVendorId()) || !scope.outletId().equals(replay.getOutletId())
                    || replay.getOpeningFloat().compareTo(openingFloat) != 0) throw conflict("Open key was reused with different data.");
            return replay;
        }
        if (sessions.lockActiveSession(registerId, scope.vendorId(), scope.outletId()) != null) throw conflict("This register already has an open session.");
        LocalDateTime now = localNow(scope.vendorId());
        RegisterSession session = new RegisterSession();
        session.setVendorId(scope.vendorId()); session.setOutletId(scope.outletId()); session.setRegisterId(registerId);
        session.setOpenedBy(scope.userId()); session.setOpenedAt(now); session.setOpeningFloat(openingFloat.setScale(2, RoundingMode.HALF_UP));
        session.setOpenIdempotencyKey(key);
        sessions.insertSession(session);
        sessions.updateRegisterState(registerId, scope.outletId(), false, now);
        return session;
    }

    @Transactional
    public RegisterCashMovement moveCash(Long sessionId, String key, String type, BigDecimal amount, String reason) {
        Scope scope = scope();
        requireKey(key);
        String normalizedType = type == null ? "" : type.trim().toUpperCase();
        if (!List.of("CASH_IN", "CASH_OUT").contains(normalizedType)) throw bad("Movement type must be CASH_IN or CASH_OUT.");
        if (amount == null || amount.signum() <= 0 || reason == null || reason.isBlank()) throw bad("Amount and reason are required.");
        amount = money(amount);
        RegisterSession session = sessions.lockSession(sessionId, scope.vendorId(), scope.outletId());
        if (session == null) throw notFound();
        RegisterCashMovement prior = sessions.findMovementReplay(sessionId, scope.vendorId(), scope.outletId(), key);
        if (prior != null) {
            if (!normalizedType.equals(prior.getMovementType()) || amount.compareTo(prior.getAmount()) != 0
                    || !reason.trim().equals(prior.getReason())) throw conflict("Movement key was reused with different data.");
            return prior;
        }
        if ("CASH_OUT".equals(normalizedType)
                && !companySettings.getBoolean(CompanySettingsKeys.CASH_OUT_WITHOUT_SALE, true)) {
            throw conflict("Cash out without a sale is disabled for this company.");
        }
        if (session.getClosedAt() != null) throw conflict("Open register session not found.");
        RegisterCashMovement movement = new RegisterCashMovement();
        movement.setSessionId(sessionId); movement.setVendorId(scope.vendorId()); movement.setOutletId(scope.outletId());
        movement.setRegisterId(session.getRegisterId()); movement.setUserId(scope.userId()); movement.setMovementType(normalizedType);
        movement.setAmount(amount.setScale(2, RoundingMode.HALF_UP)); movement.setReason(reason.trim()); movement.setIdempotencyKey(key);
        sessions.insertMovement(movement);
        return movement;
    }

    @Transactional
    public RegisterClosure close(Long registerId, String key, BigDecimal countedCash,
                                 Map<Long, BigDecimal> countedTenders, String note) {
        Scope scope = scope();
        requireKey(key);
        String closeRequestHash = closeRequestHash(countedCash, countedTenders, note);
        RegisterSession replay = sessions.findCloseReplay(registerId, scope.vendorId(), scope.outletId(), key);
        if (replay != null) {
            if (!closeRequestHash.equals(replay.getCloseRequestHash())) throw conflict("Close key was reused with different totals.");
            RegisterClosure previous = closures.findByIdUnscoped(replay.getClosureId());
            if (previous != null) previous.setPayments(closures.findPaymentsByClosureId(previous.getId()));
            return previous;
        }
        Register register = sessions.lockRegister(registerId, scope.vendorId(), scope.outletId());
        if (register == null) throw notFound();
        RegisterSession session = sessions.lockActiveSession(registerId, scope.vendorId(), scope.outletId());
        if (session == null) throw conflict("There is no open register session to close.");
        LocalDateTime now = localNow(scope.vendorId());
        if (sessions.countUnsettledSales(registerId, scope.outletId(), session.getOpenedAt(), now) > 0) {
            throw conflict("An unpaid sale remains open; finish or cancel it before closing the register.");
        }
        if (sessions.countUnmappedPayments(registerId, scope.outletId(), session.getOpenedAt(), now) > 0) {
            throw conflict("A completed payment has no mapped payment method; close is blocked.");
        }
        List<RegisterTenderLine> tenders = sessions.tenderTotals(registerId, scope.outletId(), session.getOpenedAt(), now);
        BigDecimal movement = sessions.sumCashMovements(session.getId(), scope.vendorId(), scope.outletId());
        BigDecimal cashExpected = session.getOpeningFloat().add(movement)
                .add(nz(sessions.cashSalesNetOfChange(registerId, scope.outletId(), session.getOpenedAt(), now)));
        if (countedCash == null || countedCash.signum() < 0) throw bad("Counted cash is required to close the register.");
        BigDecimal expectedTotal = cashExpected;
        BigDecimal receivedTotal = countedCash;
        for (RegisterTenderLine tender : tenders) {
            Long methodId = tender.getPaymentMethodId();
            BigDecimal expected = nz(tender.getAmount());
            boolean cash = "CASH".equalsIgnoreCase(tender.getPaymentMethodType());
            if (cash) expected = nz(sessions.cashSalesNetOfChange(registerId, scope.outletId(), session.getOpenedAt(), now));
            BigDecimal received = cash ? countedCash.subtract(session.getOpeningFloat()).subtract(movement)
                    : countedTenders == null ? null : countedTenders.get(methodId);
            if (received == null || (!cash && received.signum() < 0)) throw bad("Counted totals are required for every non-cash payment method.");
            tender.setAmount(expected.setScale(2, RoundingMode.HALF_UP));
            tender.setRounding(received.setScale(2, RoundingMode.HALF_UP));
            if (!cash) {
                expectedTotal = expectedTotal.add(expected);
                receivedTotal = receivedTotal.add(received);
            }
        }
        if (countedTenders != null) {
            for (Long methodId : countedTenders.keySet()) {
                boolean knownNonCashMethod = tenders.stream().anyMatch(t -> methodId.equals(t.getPaymentMethodId())
                        && !"CASH".equalsIgnoreCase(t.getPaymentMethodType()));
                if (!knownNonCashMethod) throw bad("Counted total contains an unknown or cash payment method.");
            }
        }
        RegisterClosure closure = new RegisterClosure();
        closure.setRegisterId(registerId); closure.setOutletId(scope.outletId()); closure.setUserId(scope.userId());
        closure.setOpenedAt(session.getOpenedAt()); closure.setClosedAt(now);
        closure.setTotalExpected(expectedTotal.setScale(2, RoundingMode.HALF_UP)); closure.setTotalReceived(receivedTotal.setScale(2, RoundingMode.HALF_UP));
        closure.setMovement(closure.getTotalReceived().subtract(closure.getTotalExpected()).setScale(2, RoundingMode.HALF_UP));
        closure.setTotalTransactions(sessions.countSessionSales(registerId, scope.outletId(), session.getOpenedAt(), now));
        closure.setTotalSurcharge(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP)); closure.setNote(note);
        closures.insert(closure);
        for (RegisterTenderLine tender : tenders) {
            RegisterClosurePayment payment = new RegisterClosurePayment();
            payment.setClosureId(closure.getId()); payment.setPaymentMethodId(tender.getPaymentMethodId());
            payment.setExpected(tender.getAmount()); payment.setReceived(tender.getRounding()); payment.setOutletId(scope.outletId());
            closures.insertPayment(payment);
        }
        session.setClosedAt(now); session.setClosureId(closure.getId()); session.setCloseIdempotencyKey(key);
        session.setCloseRequestHash(closeRequestHash);
        if (sessions.closeSession(session) != 1) throw conflict("Register session was already closed.");
        sessions.updateRegisterState(registerId, scope.outletId(), true, register.getOpenTime());
        closure.setPayments(closures.findPaymentsByClosureId(closure.getId()));
        return closure;
    }

    private static BigDecimal nz(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }
    private static BigDecimal money(BigDecimal value) {
        if (value.precision() - value.scale() > 12) throw bad("Amount exceeds the supported register limit.");
        return value.setScale(2, RoundingMode.HALF_UP);
    }
    private static String closeRequestHash(BigDecimal countedCash, Map<Long, BigDecimal> countedTenders, String note) {
        if (countedCash == null) throw bad("Counted cash is required to close the register.");
        try {
            StringBuilder canonical = new StringBuilder(countedCash.stripTrailingZeros().toPlainString());
            new TreeMap<>(countedTenders == null ? Map.<Long, BigDecimal>of() : countedTenders)
                    .forEach((id, amount) -> canonical.append('|').append(id).append(':')
                            .append(amount == null ? "null" : amount.stripTrailingZeros().toPlainString()));
            canonical.append('|').append(note == null ? "" : note.trim());
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(canonical.toString().getBytes(StandardCharsets.UTF_8));
            StringBuilder hash = new StringBuilder(64);
            for (byte value : digest) hash.append(String.format("%02x", value));
            return hash.toString();
        } catch (Exception e) {
            throw new BusinessException(40000, "Close request could not be normalized.");
        }
    }
    private static Scope scope() {
        Long vendor = CurrentUser.vendorId(), outlet = CurrentUser.outletId(), user = CurrentUser.id();
        if (vendor == null || outlet == null || user == null) throw new BusinessException(40100, "Authenticated tenant, outlet and user are required.");
        return new Scope(vendor, outlet, user);
    }
    private static void requireKey(String key) { if (key == null || key.isBlank() || key.length() > 200) throw bad("Idempotency-Key is required."); }
    private static BusinessException bad(String message) { return new BusinessException(40000, message); }
    private static BusinessException conflict(String message) { return new BusinessException(40900, message); }
    private static BusinessException notFound() { return new BusinessException(40400, "Register not found in this outlet."); }
    private record Scope(Long vendorId, Long outletId, Long userId) {}
}
