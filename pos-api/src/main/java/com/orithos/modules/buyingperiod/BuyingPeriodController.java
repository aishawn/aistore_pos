package com.orithos.modules.buyingperiod;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.PageResult;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.mapper.ProductMapper;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import com.orithos.security.PermissionAccess;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/buying-periods")
public class BuyingPeriodController {

    private final BuyingPeriodMapper mapper;
    private final ProductMapper products;
    private final PermissionAccess permissions;

    public BuyingPeriodController(BuyingPeriodMapper mapper, ProductMapper products, PermissionAccess permissions) {
        this.mapper = mapper;
        this.products = products;
        this.permissions = permissions;
    }

    @GetMapping
    public ApiResult<PageResult<BuyingPeriod>> list(@RequestParam(defaultValue = "1") int page,
                                                    @RequestParam(defaultValue = "10") int size) {
        AuthUser user = requireUser();
        permissions.requirePermission("stock.products.view");
        int safePage = Math.max(1, page);
        int safeSize = Math.min(100, Math.max(1, size));
        int offset = (safePage - 1) * safeSize;
        var items = mapper.pageByOutlet(user.outletId(), safeSize, offset);
        return ApiResult.ok(PageResult.of(items, mapper.countByOutlet(user.outletId()), safePage, safeSize));
    }

    @GetMapping("/{id}")
    public ApiResult<BuyingPeriod> get(@PathVariable Long id) {
        AuthUser user = requireUser();
        permissions.requirePermission("stock.products.view");
        return ApiResult.ok(requirePeriod(id, user));
    }

    @PostMapping
    public ApiResult<BuyingPeriod> create(@RequestBody BuyingPeriod b) {
        AuthUser user = requireUser();
        permissions.requirePermission("stock.purchases");
        validateProduct(b, user);
        b.setId(null);
        b.setOutletId(user.outletId());
        mapper.insert(b);
        return ApiResult.ok(b);
    }

    @PutMapping("/{id}")
    public ApiResult<BuyingPeriod> update(@PathVariable Long id, @RequestBody BuyingPeriod b) {
        AuthUser user = requireUser();
        permissions.requirePermission("stock.purchases");
        BuyingPeriod existing = requirePeriod(id, user);
        if (b.getItemId() == null) b.setItemId(existing.getItemId());
        if (b.getItemType() == null || b.getItemType().isBlank()) b.setItemType(existing.getItemType());
        validateProduct(b, user);
        b.setId(id);
        b.setOutletId(user.outletId());
        mapper.update(b, user.outletId());
        return ApiResult.ok(b);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        AuthUser user = requireUser();
        permissions.requirePermission("stock.purchases");
        requirePeriod(id, user);
        mapper.delete(id, user.outletId());
        return ApiResult.ok();
    }

    private BuyingPeriod requirePeriod(Long id, AuthUser user) {
        BuyingPeriod period = mapper.findByIdAndOutlet(id, user.outletId());
        if (period == null) throw new BusinessException(40400, "Buying period not found.");
        return period;
    }

    private AuthUser requireUser() {
        AuthUser user = CurrentUser.get();
        if (user == null || user.vendorId() == null || user.outletId() == null) {
            throw new BusinessException(40100, "Authenticated store and outlet are required.");
        }
        return user;
    }

    private void validateProduct(BuyingPeriod period, AuthUser user) {
        String itemType = period.getItemType();
        if (itemType == null || itemType.isBlank()) {
            period.setItemType("PRODUCT");
        } else if (!"PRODUCT".equalsIgnoreCase(itemType.trim())) {
            throw new BusinessException(40000, "Only product buying periods are supported.");
        } else {
            period.setItemType("PRODUCT");
        }
        if (period.getItemId() != null) {
            Product product = products.findByIdAndOutlet(period.getItemId(), user.vendorId(), user.outletId());
            if (product == null) throw new BusinessException(40400, "Product not found in this outlet.");
        }
    }
}
