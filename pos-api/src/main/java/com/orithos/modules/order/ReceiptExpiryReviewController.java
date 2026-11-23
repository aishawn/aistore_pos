package com.orithos.modules.order;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

@RestController
public class ReceiptExpiryReviewController {
    private static final int PAGE_SIZE = 100;
    private final OrderMapper orders;
    private final BusinessTimezoneService timezone;
    private final PermissionAccess permissions;

    public ReceiptExpiryReviewController(OrderMapper orders, BusinessTimezoneService timezone, PermissionAccess permissions) {
        this.orders = orders;
        this.timezone = timezone;
        this.permissions = permissions;
    }

    @GetMapping("/api/orders/expiry-review")
    public ApiResult<Review> review() {
        permissions.requirePermission("stock.purchases");
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        if (vendorId == null || outletId == null) {
            throw new BusinessException(40310, "Select a store before opening the expiry review.");
        }
        LocalDate today = timezone.today(vendorId);
        LocalDate through = today.plusDays(14);
        List<Batch> rows = orders.findExpiryReview(vendorId, outletId, through);
        return ApiResult.ok(new Review(today, through, rows.stream().limit(PAGE_SIZE).toList(), rows.size() > PAGE_SIZE));
    }

    public record Review(LocalDate businessDate, LocalDate throughDate, List<Batch> batches, boolean truncated) {}

    public record Batch(Long orderId, Long receiptLineId, Long productId, String productName,
                        String batchCode, LocalDate expiryDate, BigDecimal receivedUnits) {}
}
