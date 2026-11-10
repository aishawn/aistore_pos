package com.orithos.modules.customerpayment;

import com.orithos.common.ApiResult;
import com.orithos.common.PageResult;
import com.orithos.common.BusinessException;
import com.orithos.security.CurrentUser;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/customer-payments")
public class CustomerPaymentController {

    private final CustomerPaymentMapper mapper;
    private final CustomerPaymentAllocationMapper allocationMapper;
    private final CustomerPaymentService paymentService;

    public CustomerPaymentController(CustomerPaymentMapper mapper,
                                     CustomerPaymentAllocationMapper allocationMapper,
                                     CustomerPaymentService paymentService) {
        this.mapper = mapper;
        this.allocationMapper = allocationMapper;
        this.paymentService = paymentService;
    }

    @GetMapping
    public ApiResult<PageResult<CustomerPayment>> list(@RequestParam(required = false) Long customerId,
                                                       @RequestParam(required = false) String status,
                                                       @RequestParam(defaultValue = "1") int page,
                                                       @RequestParam(defaultValue = "20") int size) {
        int offset = Math.max(0, (page - 1) * size);
        Long outletId = requireOutlet();
        var items = mapper.page(customerId, status, outletId, size, offset);
        return ApiResult.ok(PageResult.of(items, mapper.count(customerId, status, outletId), page, size));
    }

    @GetMapping("/{id}")
    public ApiResult<CustomerPayment> get(@PathVariable Long id) {
        return ApiResult.ok(requirePayment(id));
    }

    @PostMapping
    public ApiResult<CustomerPayment> create(@RequestBody CustomerPayment p) {
        return ApiResult.ok(paymentService.create(p));
    }

    @PutMapping("/{id}/void")
    public ApiResult<Void> voidPayment(@PathVariable Long id) {
        paymentService.voidPayment(id);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/allocate")
    public ApiResult<Void> allocate(@PathVariable Long id,
                                    @RequestBody List<CustomerPaymentAllocation> allocations) {
        requirePayment(id);
        if (allocations != null) {
            for (CustomerPaymentAllocation a : allocations) {
                a.setPaymentId(id);
                allocationMapper.insert(a);
            }
        }
        return ApiResult.ok();
    }

    @GetMapping("/{id}/allocations")
    public ApiResult<List<CustomerPaymentAllocation>> allocations(@PathVariable Long id) {
        requirePayment(id);
        return ApiResult.ok(allocationMapper.findByPayment(id));
    }

    private static Long requireOutlet() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new BusinessException(40100, "Authenticated outlet is required.");
        return outletId;
    }

    private CustomerPayment requirePayment(Long id) {
        CustomerPayment payment = mapper.findById(id, requireOutlet());
        if (payment == null) throw new BusinessException(40410, "Payment not found.");
        return payment;
    }
}
