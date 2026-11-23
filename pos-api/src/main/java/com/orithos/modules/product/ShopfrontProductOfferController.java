package com.orithos.modules.product;

import com.orithos.common.ApiResult;
import com.orithos.common.BusinessException;
import com.orithos.common.BusinessTimezoneService;
import com.orithos.security.CurrentUser;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class ShopfrontProductOfferController {
    private final ShopfrontProductOfferService offers;
    private final BusinessTimezoneService timezones;

    public ShopfrontProductOfferController(ShopfrontProductOfferService offers, BusinessTimezoneService timezones) {
        this.offers = offers;
        this.timezones = timezones;
    }

    @GetMapping("/api/products/{id}/shopfront-offers")
    public ApiResult<Offers> offers(@PathVariable long id) {
        Long vendorId = CurrentUser.vendorId();
        Long outletId = CurrentUser.outletId();
        if (vendorId == null || outletId == null) {
            throw new BusinessException(40100, "Authenticated vendor and outlet are required.");
        }
        return ApiResult.ok(new Offers(timezones.zoneForVendor(vendorId).getId(),
                offers.currentOffers(vendorId, outletId, List.of(id)).getOrDefault(id, List.of())));
    }

    public record Offers(String timeZone, List<ShopfrontProductOfferService.Offer> items) {}
}
