package com.orithos.modules.sale;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.orithos.common.AustraliaTime;
import com.orithos.common.BusinessException;
import com.orithos.common.CashRounding;
import com.orithos.common.GstMath;
import com.orithos.common.Ids;
import com.orithos.modules.config.CompanySettingsService;
import com.orithos.modules.payment.PaymentMethod;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.modules.register.Register;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.register.RegisterSessionMapper;
import com.orithos.modules.eftpos.EftposService;
import com.orithos.modules.sale.dto.CheckoutRequest;
import com.orithos.modules.sale.dto.CheckoutResponse;
import com.orithos.modules.sale.dto.CheckoutQuoteResponse;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.time.LocalDateTime;
import java.security.MessageDigest;

/**
 * Finalises a Sell-pad cart into a completed sale with one or more tenders.
 * Supports split payment: each tender is persisted immediately; the sale
 * completes once the recorded tenders cover the total.
 */
@Service
public class CheckoutService {

    private final SaleMapper saleMapper;
    private final SalePaymentMapper paymentMapper;
    private final PaymentMethodMapper paymentMethodMapper;
    private final ProductMapper productMapper;
    private final RegisterMapper registerMapper;
    private final RegisterSessionMapper registerSessionMapper;
    private final ObjectMapper objectMapper;
    private final CompanySettingsService companySettings;
    private final EftposService eftposService;

    public CheckoutService(SaleMapper saleMapper, SalePaymentMapper paymentMapper,
                           PaymentMethodMapper paymentMethodMapper, ProductMapper productMapper,
                           RegisterMapper registerMapper, RegisterSessionMapper registerSessionMapper,
                           ObjectMapper objectMapper, CompanySettingsService companySettings,
                           EftposService eftposService) {
        this.saleMapper = saleMapper;
        this.paymentMapper = paymentMapper;
        this.paymentMethodMapper = paymentMethodMapper;
        this.productMapper = productMapper;
        this.registerMapper = registerMapper;
        this.registerSessionMapper = registerSessionMapper;
        this.objectMapper = objectMapper;
        this.companySettings = companySettings;
        this.eftposService = eftposService;
    }

    public CheckoutQuoteResponse quote(CheckoutRequest req) {
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        if (vendorId == null || outletId == null) {
            throw new BusinessException(40100, "Authenticated vendor and outlet are required.");
        }
        if (req == null || req.getItems() == null || req.getItems().isEmpty()) {
            throw new BusinessException(40000, "Cannot quote an empty sale.");
        }
        if (req.getRegisterId() == null) throw new BusinessException(40000, "A register is required for a POS quote.");
        if (req.getItems().size() > 200) throw new BusinessException(40000, "A sale cannot exceed 200 lines.");
        Register register = registerMapper.findById(req.getRegisterId());
        if (register == null || !outletId.equals(register.getOutletId())
                || Boolean.TRUE.equals(register.getClosed())
                || registerSessionMapper.findActiveSession(req.getRegisterId(), vendorId, outletId) == null) {
            throw new BusinessException(40900, "An open Orithos register session is required for a quote.");
        }

        prepareSellItems(req, vendorId, outletId);
        BigDecimal total = calculateTotal(req.getItems());
        BigDecimal gst = gstForItems(req.getItems());
        List<CheckoutQuoteResponse.Line> lines = req.getItems().stream().map(item -> {
            BigDecimal lineTotal = lineAmount(item);
            BigDecimal rate = taxPercent(item.getProductId());
            return new CheckoutQuoteResponse.Line(item.getProductId(), item.getName(), item.getQuantity(),
                    item.getUnitPrice(), item.getDiscountPercent(), lineTotal, rate,
                    GstMath.includedGst(lineTotal, rate));
        }).toList();
        return new CheckoutQuoteResponse(lines, total.subtract(gst).setScale(2, RoundingMode.HALF_UP), gst, total);
    }

    @Transactional
    public CheckoutResponse checkout(CheckoutRequest req, String idempotencyKey) {
        Long vendorId = CurrentUser.vendorId();
        Long authenticatedOutletId = CurrentUser.outletId();
        if (vendorId == null || authenticatedOutletId == null) {
            throw new BusinessException(40100, "Authenticated vendor and outlet are required.");
        }
        if (req == null) throw new BusinessException(40000, "Checkout request is required.");
        if (idempotencyKey == null || idempotencyKey.isBlank() || idempotencyKey.length() > 200) {
            throw new BusinessException(40000, "Idempotency-Key is required for checkout.");
        }
        String requestHash = requestHash(req);
        saleMapper.lockCheckoutKey(vendorId, idempotencyKey);
        String previousHash = saleMapper.findCheckoutRequestHash(vendorId, idempotencyKey);
        if (previousHash != null) {
            if (!previousHash.equals(requestHash)) throw new BusinessException(40900, "Idempotency-Key was already used for a different checkout.");
            try { return objectMapper.readValue(saleMapper.findCheckoutResponse(vendorId, idempotencyKey), CheckoutResponse.class); }
            catch (Exception e) { throw new BusinessException(40900, "The previous checkout response could not be replayed."); }
        }
        if (req.getSaleId() == null && (req.getItems() == null || req.getItems().isEmpty())) {
            throw new BusinessException(40000, "Cannot finalise an empty sale.");
        }
        if (req.getSaleId() == null && (req.getExpectedTotal() == null || req.getExpectedGst() == null)) {
            throw new BusinessException(40000, "Refresh and confirm a server quote before checkout.");
        }
        if (req.getSaleId() == null && "EFTPOS".equals(resolveTenderType(req.getTender())) && !isEftposCashOut(req.getTender())) {
            eftposService.requireApprovedAttemptForCheckout(idempotencyKey, req.getRegisterId(), req.getExpectedTotal());
        }
        if (req.getSaleId() == null && req.getItems().stream().anyMatch(item -> item == null
                || item.getUnitPrice() == null || item.getExpectedTaxRate() == null)) {
            throw new BusinessException(40000, "Each checkout line must include its confirmed quote price and GST rate.");
        }
        String tenderType = resolveTenderType(req.getTender());
        if ("GIFT_CARD".equals(tenderType)) {
            throw new BusinessException(40900, "Gift card payments are unavailable until the gift-card balance ledger is enabled.");
        }
        boolean cash = "CASH".equals(tenderType);
        BigDecimal cashout = nonNeg(req.getCashout());

        Sale sale;
        BigDecimal total;

        if (req.getSaleId() != null) {
            sale = saleMapper.findById(req.getSaleId(), vendorId, authenticatedOutletId);
            if (sale == null || !"PENDING".equals(sale.getStatus())) {
                throw new BusinessException("Sale not found or not open for payment.");
            }
            total = sale.getTotalPrice();
        } else {
            if (req.getItems() == null || req.getItems().isEmpty()) {
                throw new BusinessException("Cannot finalise an empty sale.");
            }
            prepareSellItems(req, vendorId, authenticatedOutletId);
            total = calculateTotal(req.getItems());
            BigDecimal gst = gstForItems(req.getItems());
            if ((req.getExpectedTotal() != null && req.getExpectedTotal().compareTo(total) != 0)
                    || (req.getExpectedGst() != null && req.getExpectedGst().compareTo(gst) != 0)) {
                throw new BusinessException(40900, "The quoted price or GST changed. Refresh the quote before payment.");
            }
            sale = createPendingSale(req, total);
        }

        Long effectiveRegisterId = req.getRegisterId() != null ? req.getRegisterId() : sale.getRegisterId();
        if (effectiveRegisterId == null) throw new BusinessException("An open register is required for checkout.");
        Register register = registerMapper.findById(effectiveRegisterId);
        if (register == null || !authenticatedOutletId.equals(register.getOutletId())
                || Boolean.TRUE.equals(register.getClosed())) {
            throw new BusinessException("Register is not open at this outlet.");
        }
        if (registerSessionMapper.lockActiveSession(effectiveRegisterId, vendorId, authenticatedOutletId) == null) {
            throw new BusinessException("An open Orithos register session is required for checkout.");
        }

        BigDecimal outstanding = sale.getOutstanding() != null ? sale.getOutstanding() : total;
        if (outstanding.signum() <= 0) {
            throw new BusinessException("This sale is already fully paid.");
        }

        boolean eftposCashOut = isEftposCashOut(req.getTender());
        BigDecimal tendered = req.getTendered() != null
                ? req.getTendered()
                : outstanding.add(cash || eftposCashOut ? cashout : BigDecimal.ZERO);

        BigDecimal paymentAmount;
        BigDecimal change;
        BigDecimal rounding = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        BigDecimal cashDue = null;
        if (cash) {
            BigDecimal rounded = CashRounding.roundTo(outstanding, companySettings.cashRoundTo(vendorId));
            rounding = rounded.subtract(outstanding).setScale(2, RoundingMode.HALF_UP);
            BigDecimal required = rounded.add(cashout);
            boolean exactUnrounded = tendered.compareTo(outstanding.add(cashout)) == 0;
            boolean settles = exactUnrounded || tendered.compareTo(required) >= 0;
            if (!settles) {
                paymentAmount = tendered.subtract(cashout.max(BigDecimal.ZERO));
                if (paymentAmount.signum() <= 0) {
                    throw new BusinessException("Insufficient cash tendered: "
                            + tendered + " for amount due " + required + ".");
                }
                change = BigDecimal.ZERO;
                rounding = BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
            } else {
                if (exactUnrounded) {
                    tendered = required;
                }
                paymentAmount = outstanding;
                change = tendered.subtract(required);
                cashDue = rounded;
            }
        } else if (eftposCashOut && cashout.signum() > 0) {
            BigDecimal requiredCard = outstanding.add(cashout);
            if (tendered.compareTo(requiredCard) != 0) {
                throw new BusinessException("Card amount must equal purchase plus cash out ("
                        + requiredCard + ").");
            }
            paymentAmount = outstanding;
            change = BigDecimal.ZERO;
        } else {
            if (tendered.compareTo(outstanding) > 0) {
                throw new BusinessException("Tender amount " + tendered
                        + " exceeds remaining balance " + outstanding + ".");
            }
            paymentAmount = tendered;
            change = BigDecimal.ZERO;
        }

        paymentAmount = paymentAmount.setScale(2, RoundingMode.HALF_UP);
        if (paymentAmount.signum() <= 0) {
            throw new BusinessException("Payment amount must be greater than zero.");
        }

        PaymentMethod method = resolvePaymentMethod(effectiveRegisterId, authenticatedOutletId,
                tenderType, req.getTender());
        SalePayment payment = new SalePayment();
        payment.setSaleId(sale.getId());
        payment.setPaymentMethodId(method != null ? method.getId() : null);
        payment.setSubtype(req.getTender());
        payment.setRegisterId(effectiveRegisterId);
        payment.setOutletId(authenticatedOutletId);
        payment.setStatus("COMPLETED");
        payment.setAmount(paymentAmount);
        payment.setRounding(rounding.signum() == 0 ? null : rounding);
        payment.setCashout(cashout.signum() > 0 ? cashout : null);
        payment.setProcessTime(AustraliaTime.localNow());
        paymentMapper.insert(payment);

        BigDecimal newOutstanding = outstanding.subtract(paymentAmount).setScale(2, RoundingMode.HALF_UP);
        boolean completed = newOutstanding.signum() <= 0;

        BigDecimal totalChange = (sale.getTotalChange() != null ? sale.getTotalChange() : BigDecimal.ZERO)
                .add(change).setScale(2, RoundingMode.HALF_UP);

        sale.setOutstanding(completed ? BigDecimal.ZERO : newOutstanding);
        sale.setTotalChange(totalChange);
        BigDecimal priorRounding = sale.getTotalRounding() != null ? sale.getTotalRounding() : BigDecimal.ZERO;
        sale.setTotalRounding(priorRounding.add(rounding).setScale(2, RoundingMode.HALF_UP));
        if (sale.getTotalTax() == null) {
            sale.setTotalTax(BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP));
        }
        if (sale.getBusinessDate() == null) {
            sale.setBusinessDate(AustraliaTime.today());
        }
        if (sale.getLocalSoldAt() == null) {
            sale.setLocalSoldAt(AustraliaTime.localNow());
        }
        if (completed) {
            sale.setStatus("COMPLETED");
            sale.setBusinessDate(AustraliaTime.today());
            sale.setLocalSoldAt(AustraliaTime.localNow());
            if (sale.getInvoiceId() == null) {
                sale.setInvoiceId(nextInvoiceId());
            }
            if (cashout.signum() > 0) {
                sale.setCashout(cashout);
            }
        }
        saleMapper.updatePaymentState(sale, vendorId, authenticatedOutletId);

        sale.setItems(saleMapper.findItemsBySaleId(sale.getId()));
        if (completed) {
            deductStock(sale);
            saleMapper.markStockApplied(sale.getId(), vendorId);
        }

        CheckoutResponse res = new CheckoutResponse();
        res.setSale(sale);
        res.setSaleId(sale.getId());
        res.setInvoiceId(sale.getInvoiceId());
        res.setPaymentMethod(method != null ? method.getName() : req.getTender());
        res.setTenderType(tenderType);
        BigDecimal gst = sale.getTotalTax() != null ? sale.getTotalTax() : BigDecimal.ZERO;
        res.setAmountDue(total);
        res.setGst(gst);
        res.setSubtotalExGst(total.subtract(gst).setScale(2, RoundingMode.HALF_UP));
        res.setRounding(rounding);
        res.setCashDue(cashDue);
        res.setTendered(paymentAmount);
        res.setChange(change);
        res.setCashout(cashout);
        res.setRemaining(completed ? BigDecimal.ZERO : newOutstanding);
        res.setCompleted(completed);
        try {
            saleMapper.insertCheckoutResponse(vendorId, idempotencyKey, requestHash, objectMapper.writeValueAsString(res));
        } catch (Exception e) {
            throw new BusinessException(50000, "Checkout completed but its retry record could not be saved.");
        }
        return res;
    }

    String requestHash(CheckoutRequest req) {
        try {
            ObjectNode intent = objectMapper.createObjectNode();
            intent.put("saleId", req.getSaleId());
            intent.put("registerId", req.getRegisterId());
            intent.put("customerId", req.getCustomerId());
            intent.put("tender", req.getTender());
            intent.put("tendered", req.getTendered() == null ? null : req.getTendered().stripTrailingZeros().toPlainString());
            intent.put("cashout", req.getCashout() == null ? null : req.getCashout().stripTrailingZeros().toPlainString());
            intent.put("expectedTotal", req.getExpectedTotal() == null ? null : req.getExpectedTotal().stripTrailingZeros().toPlainString());
            intent.put("expectedGst", req.getExpectedGst() == null ? null : req.getExpectedGst().stripTrailingZeros().toPlainString());
            if (req.getItems() != null) {
                ArrayNode items = intent.putArray("items");
                for (CheckoutRequest.Item item : req.getItems()) {
                    ObjectNode line = items.addObject();
                    line.put("productId", item.getProductId());
                    BigDecimal quantity = item.getQuantity() == null ? BigDecimal.ONE : item.getQuantity();
                    line.put("quantity", quantity.stripTrailingZeros().toPlainString());
                    putDecimal(line, "unitPrice", item.getUnitPrice());
                    BigDecimal discount = item.getDiscountPercent() == null
                            ? BigDecimal.ZERO : item.getDiscountPercent();
                    putDecimal(line, "discountPercent", discount);
                    putDecimal(line, "expectedTaxRate", item.getExpectedTaxRate());
                }
            }
            byte[] digest = MessageDigest.getInstance("SHA-256").digest(objectMapper.writeValueAsBytes(intent));
            StringBuilder out = new StringBuilder(64);
            for (byte b : digest) out.append(String.format("%02x", b));
            return out.toString();
        } catch (Exception e) { throw new BusinessException(40000, "Invalid checkout request."); }
    }

    private void deductStock(Sale sale) {
        if (sale.getItems() == null) {
            return;
        }
        Long outletId = sale.getOutletId();
        Long vendorId = CurrentUser.vendorId();
        for (SaleItem item : sale.getItems()) {
            if (item.getProductId() == null || item.getQuantity() == null || item.getQuantity().signum() == 0) {
                continue;
            }
            BigDecimal delta = item.getQuantity().negate();
            Product product = productMapper.findByIdAndOutlet(item.getProductId(), vendorId, outletId);
            if (product == null) throw new BusinessException("Product not found in this tenant.");
            boolean track = !Boolean.FALSE.equals(product.getTrackInventory());
            if (delta.signum() < 0 && track) {
                int updated = productMapper.adjustInventoryIfAvailable(item.getProductId(), outletId, delta);
                if (updated == 0) {
                    String name = product != null && product.getName() != null ? product.getName() : "this product";
                    throw new BusinessException(
                            "Insufficient stock for " + name + ". Sale would take inventory below zero.");
                }
            } else {
                productMapper.adjustInventory(item.getProductId(), outletId, delta);
            }
            saleMapper.insertSaleInventoryMovement(vendorId, outletId, item.getProductId(), delta,
                    sale.getId(), item.getId(), "pos-sale:" + sale.getId() + ":" + item.getId(), CurrentUser.id());
        }
    }

    static BigDecimal calculateTotal(java.util.List<CheckoutRequest.Item> items) {
        BigDecimal total = BigDecimal.ZERO;
        for (CheckoutRequest.Item item : items) total = total.add(lineAmount(item));
        return total.setScale(2, RoundingMode.HALF_UP);
    }

    private Sale createPendingSale(CheckoutRequest req, BigDecimal total) {
        int quantity = 0;
        for (CheckoutRequest.Item item : req.getItems()) {
            BigDecimal qty = item.getQuantity() == null ? BigDecimal.ONE : item.getQuantity();
            quantity += qty.intValue();
        }

        BigDecimal gst = gstForItems(req.getItems());
        BigDecimal discountTotal = BigDecimal.ZERO;
        for (CheckoutRequest.Item item : req.getItems()) {
            BigDecimal gross = item.getQuantity().multiply(item.getUnitPrice());
            discountTotal = discountTotal.add(gross.subtract(lineAmount(item)));
        }
        Sale sale = new Sale();
        sale.setStatus("PENDING");
        sale.setRegisterId(req.getRegisterId());
        sale.setOutletId(CurrentUser.outletId());
        sale.setUserId(CurrentUser.id());
        sale.setCustomerId(resolveCustomerId(req.getCustomerId()));
        sale.setTotalQuantity(quantity);
        sale.setTotalPrice(total);
        sale.setTotalTax(gst);
        sale.setTotalDiscount(discountTotal.setScale(2, RoundingMode.HALF_UP));
        sale.setOutstanding(total);
        sale.setTotalChange(BigDecimal.ZERO);
        sale.setBusinessDate(AustraliaTime.today());
        sale.setLocalSoldAt(AustraliaTime.localNow());
        saleMapper.insert(sale);

        for (CheckoutRequest.Item item : req.getItems()) {
            SaleItem si = new SaleItem();
            si.setSaleId(sale.getId());
            si.setOutletId(sale.getOutletId());
            BigDecimal qty = item.getQuantity() == null ? BigDecimal.ONE : item.getQuantity();
            BigDecimal unit = item.getUnitPrice();
            BigDecimal lineTotal = lineAmount(item);
            BigDecimal gross = qty.multiply(unit);
            si.setQuantity(qty);
            si.setBasePrice(unit);
            si.setTotalPrice(lineTotal);
            si.setSavings(gross.subtract(lineTotal).setScale(2, RoundingMode.HALF_UP));
            Long productId = item.getProductId();
            Product product = productMapper.findSellableForOutlet(productId, CurrentUser.vendorId(),
                    CurrentUser.outletId(), qty);
            si.setProductId(productId);
            si.setCaseQuantity(product.getCaseQuantity());
            si.setNote(product.getName());
            si.setTaxRateId(saleMapper.findTaxRateId(productId, CurrentUser.vendorId(), CurrentUser.outletId()));
            si.setTax(GstMath.includedGst(lineTotal, taxPercent(productId)));
            saleMapper.insertItem(si);
        }
        return sale;
    }

    private BigDecimal gstForItems(java.util.List<CheckoutRequest.Item> items) {
        BigDecimal gst = BigDecimal.ZERO;
        for (CheckoutRequest.Item item : items) {
            gst = gst.add(GstMath.includedGst(lineAmount(item), taxPercent(item.getProductId())));
        }
        return gst.setScale(2, RoundingMode.HALF_UP);
    }

    /** GST-inclusive rate from the product's explicit tax configuration. */
    private BigDecimal taxPercent(Long productId) {
        BigDecimal rate = saleMapper.findSellTaxPercent(productId, CurrentUser.vendorId(), CurrentUser.outletId());
        if (rate == null) throw new BusinessException("Product tax rate is missing. Configure GST before selling.");
        return rate;
    }

    void prepareSellItems(CheckoutRequest req, Long vendorId, Long outletId) {
        if (req.getCustomerId() != null
                && saleMapper.customerHasAssignedPriceList(req.getCustomerId(), outletId) > 0) {
            throw new BusinessException(40900,
                    "This customer has an assigned price list. Customer-specific pricing is not yet supported; remove the customer or use a supported price before selling.");
        }
        for (CheckoutRequest.Item item : req.getItems()) {
            if (item == null || item.getProductId() == null) {
                throw new BusinessException(40000, "Each sale line must reference a catalogue product.");
            }
            BigDecimal quantity = item.getQuantity() == null ? BigDecimal.ONE : item.getQuantity();
            if (quantity.signum() <= 0) throw new BusinessException(40000, "Sale quantity must be greater than zero.");
            BigDecimal discount = item.getDiscountPercent() == null ? BigDecimal.ZERO : item.getDiscountPercent();
            if (discount.signum() < 0 || discount.compareTo(new BigDecimal("100")) > 0) {
                throw new BusinessException(40000, "Line discount must be between 0 and 100 percent.");
            }
            Product product = productMapper.findSellableForOutlet(item.getProductId(), vendorId, outletId, quantity);
            if (product == null) throw new BusinessException("Product is not available at this outlet.");
            if (discount.signum() > 0 && Boolean.TRUE.equals(product.getPreventManualDiscounts())) {
                throw new BusinessException(40900, "Manual discounts are disabled for " + product.getName() + ".");
            }
            BigDecimal unitPrice = product.getPrice();
            if (unitPrice == null || unitPrice.signum() < 0) {
                throw new BusinessException("Product has no valid outlet price. Configure a price before selling.");
            }
            Long taxRateId = saleMapper.findTaxRateId(product.getId(), vendorId, outletId);
            BigDecimal taxPercent = saleMapper.findSellTaxPercent(product.getId(), vendorId, outletId);
            if (taxRateId == null || taxPercent == null) {
                throw new BusinessException("Product tax rate is missing. Configure GST before selling.");
            }
            if (req.getExpectedTotal() != null
                    && ((item.getUnitPrice() != null && item.getUnitPrice().compareTo(unitPrice) != 0)
                    || (item.getExpectedTaxRate() != null && item.getExpectedTaxRate().compareTo(taxPercent) != 0))) {
                throw new BusinessException(40900, "A quoted product price or GST rate changed. Refresh the quote before payment.");
            }
            item.setQuantity(quantity);
            item.setUnitPrice(unitPrice);
            item.setDiscountPercent(discount);
            BigDecimal gross = quantity.multiply(unitPrice);
            item.setLineTotal(gross.multiply(BigDecimal.ONE.subtract(discount.movePointLeft(2)))
                    .setScale(2, RoundingMode.HALF_UP));
            item.setExpectedTaxRate(taxPercent);
            item.setName(product.getName());
        }
    }

    /**
     * Charge the cent total the till showed. Dividing that total back into a
     * unit price and multiplying by quantity (2 × $2.27 = $4.54 vs a $4.53 line)
     * leaves a phantom cent and blocks an exact cash tender.
     */
    static BigDecimal lineAmount(CheckoutRequest.Item item) {
        BigDecimal qty = item.getQuantity() == null ? BigDecimal.ONE : item.getQuantity();
        BigDecimal unit = item.getUnitPrice() == null ? BigDecimal.ZERO : item.getUnitPrice();
        if (item.getLineTotal() != null) return item.getLineTotal().setScale(2, RoundingMode.HALF_UP);
        return qty.multiply(unit).setScale(2, RoundingMode.HALF_UP);
    }

    private static void putDecimal(ObjectNode node, String field, BigDecimal value) {
        node.put(field, value == null ? null : value.stripTrailingZeros().toPlainString());
    }

    PaymentMethod resolvePaymentMethod(Long registerId, Long outletId, String tenderType, String tenderLabel) {
        PaymentMethod method = paymentMethodMapper.findForRegisterByType(registerId, outletId, tenderType);
        if (method == null && tenderLabel != null) {
            method = paymentMethodMapper.findForRegisterByName(registerId, outletId, tenderLabel);
        }
        if (method == null) throw new BusinessException("Payment method is not configured on this register.");
        return method;
    }

    /** EFTPOS Cash Out — card pays for the purchase plus extra cash given from the till. */
    private static boolean isEftposCashOut(String tender) {
        if (tender == null) return false;
        String t = tender.toLowerCase();
        return t.contains("eftpos") && t.contains("cash out");
    }

    /** Map a Sell-pad tender label to a {@code payment_method.type}. */
    private String resolveTenderType(String tender) {
        if (tender == null) return "EFTPOS";
        String t = tender.toLowerCase();
        if (t.contains("cheque")) return "CHEQUE";
        if (t.contains("direct deposit")) return "DIRECT_DEPOSIT";
        if (t.contains("cash") && !t.contains("eftpos") && !t.contains("cashout")) return "CASH";
        if (t.contains("gift")) return "GIFT_CARD";
        return "EFTPOS";
    }

    /** Only attach a customer that actually exists, to satisfy the FK. */
    private Long resolveCustomerId(Long customerId) {
        if (customerId != null && saleMapper.customerExists(customerId,
                CurrentUser.vendorId(), CurrentUser.outletId()) > 0) {
            return customerId;
        }
        if (customerId != null) throw new BusinessException("Customer is not available at this outlet.");
        return null;
    }

    private static String nextInvoiceId() {
        return "INV-" + Ids.next();
    }

    private static BigDecimal nonNeg(BigDecimal v) {
        return v == null || v.signum() < 0 ? BigDecimal.ZERO : v;
    }
}
