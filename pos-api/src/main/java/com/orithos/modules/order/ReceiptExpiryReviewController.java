package com.orithos.modules.order;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

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
    public ApiResult<Review> review(@RequestParam(defaultValue = "1") int page,
                                    @RequestParam(defaultValue = "all") String status) {
        permissions.requirePermission("stock.purchases");
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        if (vendorId == null || outletId == null) {
            throw new BusinessException(40310, "Select a store before opening the expiry review.");
        }
        if (page < 1 || !List.of("all", "upcoming", "expired").contains(status)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "Invalid expiry review page or status.");
        }
        LocalDate today = timezone.today(vendorId);
        LocalDate through = today.plusDays(14);
        LocalDate from = "upcoming".equals(status) ? today : null;
        LocalDate end = "expired".equals(status) ? today.minusDays(1) : through;
        List<Batch> rows = orders.findExpiryReview(vendorId, outletId, from, end, (page - 1L) * PAGE_SIZE);
        return ApiResult.ok(new Review(today, through, rows.stream().limit(PAGE_SIZE).toList(),
                rows.size() > PAGE_SIZE, page, orders.expiryReviewCoverage(vendorId, outletId)));
    }

    public record Review(LocalDate businessDate, LocalDate throughDate, List<Batch> batches,
                         boolean truncated, int page, Coverage coverage) {}

    public record Coverage(long receivedLines, long linesWithoutBatches) {}

    public record Batch(Long orderId, Long receiptLineId, Long productId, String productName,
                        String batchCode, LocalDate expiryDate, BigDecimal receivedUnits,
                        PurchaseReceiptRequest.DateType dateType) {}
}
