package com.orithos.modules.order;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/order-reviews")
public class OrderReviewController {

    private final OrderReviewMapper mapper;

    public OrderReviewController(OrderReviewMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<OrderReview>> list(@RequestParam(required = false) Long orderId) {
        return ApiResult.ok(mapper.findAll(orderId));
    }

    @GetMapping("/{id}")
    public ApiResult<OrderReview> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<OrderReview> create(@RequestBody OrderReview review) {
        if (review.getStatus() == null) {
            review.setStatus("PENDING");
        }
        mapper.insert(review);
        return ApiResult.ok(review);
    }

    @PutMapping("/{id}")
    public ApiResult<OrderReview> update(@PathVariable Long id, @RequestBody OrderReview review) {
        review.setId(id);
        mapper.update(review);
        return ApiResult.ok(review);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }
}
