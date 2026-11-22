package com.orithos.modules.sale;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.AustraliaTime;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.common.BusinessException;
import com.orithos.common.CashRounding;
import com.orithos.common.Ids;
import com.orithos.modules.payment.PaymentMethod;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.config.CompanySettingsKeys;
import com.orithos.modules.config.CompanySettingsService;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.register.Register;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.register.RegisterSessionMapper;
import com.orithos.modules.sale.dto.RefundRequest;
import com.orithos.modules.sale.dto.RefundResponse;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.security.MessageDigest;
import java.util.Comparator;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;

@Service
public class RefundService {
    private final SaleMapper sales;
    private final SalePaymentMapper payments;
    private final PaymentMethodMapper paymentMethods;
    private final ProductMapper products;
    private final RegisterMapper registers;
    private final RegisterSessionMapper sessions;
    private final CompanySettingsService companySettings;
    private final BusinessTimezoneService businessTimezone;
    private final ObjectMapper json;

    public RefundService(SaleMapper sales, SalePaymentMapper payments, PaymentMethodMapper paymentMethods,
                        ProductMapper products, RegisterMapper registers, RegisterSessionMapper sessions,
                        CompanySettingsService companySettings, ObjectMapper json) {
        this(sales, payments, paymentMethods, products, registers, sessions, companySettings, null, json);
    }

    @Autowired
    public RefundService(SaleMapper sales, SalePaymentMapper payments, PaymentMethodMapper paymentMethods,
                        ProductMapper products, RegisterMapper registers, RegisterSessionMapper sessions,
                        CompanySettingsService companySettings,
                        BusinessTimezoneService businessTimezone,
                        ObjectMapper json) {
        this.sales = sales;
        this.payments = payments;
        this.paymentMethods = paymentMethods;
        this.products = products;
        this.registers = registers;
        this.sessions = sessions;
        this.companySettings = companySettings;
        this.businessTimezone = businessTimezone;
        this.json = json;
    }

    private java.time.LocalDate today(Long vendorId) {
        return businessTimezone == null ? AustraliaTime.today() : businessTimezone.today(vendorId);
    }

    private java.time.LocalDateTime localNow(Long vendorId) {
        return businessTimezone == null ? AustraliaTime.localNow() : businessTimezone.localNow(vendorId);
    }

    @Transactional
    public RefundResponse refund(Long originalSaleId, String idempotencyKey, RefundRequest request) {
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        Long userId = CurrentUser.id();
        if (vendorId == null || outletId == null || userId == null) throw new BusinessException(40100, "Authenticated store and user are required.");
        if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 190) throw bad("Idempotency-Key is required.");
        if (request == null || request.registerId() == null || request.lines() == null || request.lines().isEmpty() || request.lines().size() > 200) throw bad("Choose at least one sale line to refund.");
        String reason = request.reason() == null ? "" : request.reason().trim();
        boolean refundReasonRequired = companySettings.getBoolean(CompanySettingsKeys.REFUNDS_REQUIRE_REASON, true);
        if ((refundReasonRequired && reason.isEmpty()) || reason.length() > 255) {
            throw bad(refundReasonRequired ? "A refund reason of 1 to 255 characters is required."
                    : "A refund reason must be 255 characters or fewer.");
        }

        String key = "refund:" + idempotencyKey;
        String hash = requestHash(originalSaleId, request, reason);
        sales.lockCheckoutKey(vendorId, key);
        String previousHash = sales.findCheckoutRequestHash(vendorId, key);
        if (previousHash != null) {
            if (!previousHash.equals(hash)) throw conflict("Idempotency-Key was already used for a different refund.");
            try { return json.readValue(sales.findCheckoutResponse(vendorId, key), RefundResponse.class); }
            catch (Exception e) { throw conflict("The previous refund response could not be replayed."); }
        }

        Sale original = sales.lockForRefund(originalSaleId, vendorId, outletId);
        if (original == null || !("COMPLETED".equals(original.getStatus()) || "REFUNDED".equals(original.getStatus()))
                || original.getTotalPrice() == null || original.getTotalPrice().signum() <= 0
                || original.getOutstanding() == null || original.getOutstanding().signum() != 0) {
            throw new BusinessException(40400, "Completed sale not found in this store.");
        }
        Register register = registers.findById(request.registerId());
        if (register == null || !outletId.equals(register.getOutletId()) || Boolean.TRUE.equals(register.getClosed())
                || sessions.lockActiveSession(request.registerId(), vendorId, outletId) == null) {
            throw conflict("An open Orithos register session is required to refund.");
        }
        PaymentMethod method = paymentMethods.findForRegisterByType(request.registerId(), outletId, "CASH");
        if (method == null) throw conflict("A cash refund payment method must be configured on this register.");

        List<SaleItem> originalLines = sales.findItemsBySaleId(originalSaleId);
        if (originalLines == null || originalLines.isEmpty()) throw conflict("The original sale has no refundable lines.");
        List<RefundRequest.Line> requestedLines = request.lines().stream()
                .sorted(Comparator.comparing(RefundRequest.Line::saleItemId, Comparator.nullsLast(Long::compareTo)))
                .toList();
        var requestedLineIds = new HashSet<Long>();
        for (RefundRequest.Line line : requestedLines) {
            if (line.saleItemId() == null || !requestedLineIds.add(line.saleItemId())) {
                throw bad("Each original sale line may only appear once in a refund.");
            }
        }
        Sale refund = new Sale();
        refund.setLinkedSaleId(originalSaleId);
        refund.setRefundReason(reason.isEmpty() ? null : reason);
        refund.setRegisterId(request.registerId());
        refund.setUserId(userId);
        refund.setCustomerId(original.getCustomerId());
        refund.setOutletId(outletId);
        refund.setInvoiceId("REF-" + Ids.next());
        refund.setBusinessDate(today(vendorId));
        refund.setLocalSoldAt(localNow(vendorId));
        refund.setTotalPrice(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        refund.setTotalTax(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        refund.setTotalDiscount(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        refund.setItems(new ArrayList<>());
        int totalQuantity = 0;

        for (RefundRequest.Line requested : requestedLines) {
            if (requested.saleItemId() == null || requested.quantity() == null || requested.quantity().signum() <= 0
                    || requested.quantity().stripTrailingZeros().scale() > 4) throw bad("Refund line quantity must be positive and use at most four decimal places.");
            SaleItem source = originalLines.stream().filter(line -> requested.saleItemId().equals(line.getId())).findFirst()
                    .orElseThrow(() -> new BusinessException(40400, "Sale line not found on the original sale."));
            BigDecimal sold = nz(source.getQuantity());
            BigDecimal already = nz(sales.refundedQuantity(originalSaleId, source.getId()));
            BigDecimal remaining = sold.subtract(already);
            BigDecimal quantity = requested.quantity().setScale(4, RoundingMode.UNNECESSARY);
            if (sold.signum() <= 0 || quantity.compareTo(remaining) > 0) throw conflict("Refund quantity exceeds the quantity remaining on the original sale.");
            BigDecimal amountRemaining = nz(source.getTotalPrice()).subtract(nz(sales.refundedLineAmount(originalSaleId, source.getId())));
            BigDecimal taxRemaining = nz(source.getTax()).subtract(nz(sales.refundedLineTax(originalSaleId, source.getId())));
            boolean finalQuantity = quantity.compareTo(remaining) == 0;
            BigDecimal factor = quantity.divide(sold, 8, RoundingMode.HALF_UP);
            BigDecimal amount = finalQuantity ? amountRemaining : nz(source.getTotalPrice()).multiply(factor).setScale(2, RoundingMode.HALF_UP);
            BigDecimal tax = finalQuantity ? taxRemaining : nz(source.getTax()).multiply(factor).setScale(2, RoundingMode.HALF_UP);
            if (amount.signum() <= 0 || amount.compareTo(amountRemaining) > 0) throw conflict("Refund amount is invalid for the selected sale line.");

            SaleItem item = new SaleItem();
            item.setSaleId(refund.getId());
            item.setRefundOfSaleItemId(source.getId());
            item.setProductId(source.getProductId());
            item.setOutletId(outletId);
            item.setQuantity(quantity.negate());
            item.setCaseQuantity(source.getCaseQuantity() == null ? null : source.getCaseQuantity().multiply(factor).negate());
            item.setCost(source.getCost());
            item.setBasePrice(source.getBasePrice());
            item.setTotalPrice(amount.negate());
            item.setSavings(source.getSavings() == null ? null : source.getSavings().multiply(factor).negate());
            item.setTax(tax.negate());
            item.setTaxRateId(source.getTaxRateId());
            item.setNote(source.getNote());
            refund.getItems().add(item);
            refund.setTotalPrice(refund.getTotalPrice().subtract(amount));
            refund.setTotalTax(refund.getTotalTax().subtract(tax));
            refund.setTotalDiscount(refund.getTotalDiscount().add(nz(item.getSavings())));
            totalQuantity += quantity.intValue();
        }

        refund.setTotalQuantity(-totalQuantity);
        BigDecimal refundAmount = refund.getTotalPrice().negate().setScale(2, RoundingMode.HALF_UP);
        if (refundAmount.signum() <= 0) throw bad("Refund total must be greater than zero.");
        BigDecimal cashPaid = CashRounding.toNearestFiveCents(refundAmount);
        refund.setTotalRounding(refundAmount.subtract(cashPaid));
        sales.insertRefund(refund);
        for (SaleItem item : refund.getItems()) {
            item.setSaleId(refund.getId());
            sales.insertItem(item);
            if (item.getProductId() != null) {
                Product product = products.findByIdAndOutlet(item.getProductId(), vendorId, outletId);
                if (product == null) throw new BusinessException(40400, "Refund product is no longer available in this store.");
                products.adjustInventory(item.getProductId(), outletId, item.getQuantity().negate());
                sales.insertRefundInventoryMovement(vendorId, outletId, item.getProductId(), item.getQuantity().negate(),
                        refund.getId(), item.getId(), "pos-refund:" + refund.getId() + ":" + item.getId(), userId);
            }
        }
        SalePayment payment = new SalePayment();
        payment.setSaleId(refund.getId());
        payment.setPaymentMethodId(method.getId());
        payment.setSubtype(method.getName());
        payment.setRegisterId(request.registerId());
        payment.setOutletId(outletId);
        payment.setStatus("COMPLETED");
        payment.setAmount(refundAmount.negate());
        BigDecimal cashRounding = refundAmount.subtract(cashPaid);
        payment.setRounding(cashRounding.signum() == 0 ? null : cashRounding);
        payment.setProcessTime(localNow(vendorId));
        payments.insert(payment);

        boolean fullyRefunded = originalLines.stream().allMatch(line ->
                nz(sales.refundedQuantity(originalSaleId, line.getId())).compareTo(nz(line.getQuantity())) >= 0);
        if (fullyRefunded) sales.markRefunded(originalSaleId, outletId);

        RefundResponse response = new RefundResponse(refund.getId(), originalSaleId, refund.getInvoiceId(),
                refundAmount, refund.getTotalTax().negate(), cashPaid, reason);
        try {
            sales.insertCheckoutResponse(vendorId, key, hash, json.writeValueAsString(response));
        } catch (Exception e) {
            throw new BusinessException(50000, "Refund was recorded but its retry record could not be saved.");
        }
        return response;
    }

    private String requestHash(Long saleId, RefundRequest request, String reason) {
        try {
            StringBuilder value = new StringBuilder().append(saleId).append('|').append(request.registerId()).append('|').append(reason);
            request.lines().stream().sorted(Comparator.comparing(RefundRequest.Line::saleItemId, Comparator.nullsLast(Long::compareTo)))
                    .forEach(line -> value.append('|').append(line.saleItemId()).append(':')
                            .append(line.quantity() == null ? "null" : line.quantity().stripTrailingZeros().toPlainString()));
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(value.toString().getBytes(java.nio.charset.StandardCharsets.UTF_8));
            StringBuilder hash = new StringBuilder(64);
            for (byte b : digest) hash.append(String.format("%02x", b));
            return hash.toString();
        } catch (Exception e) { throw bad("Refund request could not be normalized."); }
    }

    private static BigDecimal nz(BigDecimal value) { return value == null ? BigDecimal.ZERO : value; }
    private static BusinessException bad(String message) { return new BusinessException(40000, message); }
    private static BusinessException conflict(String message) { return new BusinessException(40900, message); }
}
