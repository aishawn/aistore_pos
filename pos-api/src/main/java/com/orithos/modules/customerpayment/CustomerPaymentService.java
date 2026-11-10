package com.orithos.modules.customerpayment;

import com.orithos.common.BusinessException;
import com.orithos.modules.customer.CustomerDetail;
import com.orithos.modules.customer.CustomerRevisionService;
import com.orithos.modules.customer.mapper.CustomerMapper;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.time.LocalDateTime;

@Service
public class CustomerPaymentService {

    private final CustomerPaymentMapper paymentMapper;
    private final CustomerMapper customerMapper;
    private final CustomerRevisionService revisionService;

    public CustomerPaymentService(CustomerPaymentMapper paymentMapper,
                                  CustomerMapper customerMapper,
                                  CustomerRevisionService revisionService) {
        this.paymentMapper = paymentMapper;
        this.customerMapper = customerMapper;
        this.revisionService = revisionService;
    }

    @Transactional
    public CustomerPayment create(CustomerPayment payment) {
        Long outletId = requireOutlet();
        if (payment.getCustomerId() == null) {
            throw new BusinessException("Customer is required.");
        }
        if (payment.getAmount() == null || payment.getAmount().compareTo(BigDecimal.ZERO) <= 0) {
            throw new BusinessException("Payment amount must be greater than zero.");
        }

        CustomerDetail customer = customerMapper.findDetailById(payment.getCustomerId());
        if (customer == null) {
            throw new BusinessException("Customer not found.");
        }
        if (!outletId.equals(customerMapper.findOutletId(payment.getCustomerId()))) {
            throw new BusinessException(40410, "Customer not found.");
        }
        payment.setOutletId(outletId);

        BigDecimal owing = customer.getCurrentOwing() != null ? customer.getCurrentOwing() : BigDecimal.ZERO;
        payment.setStartBalance(owing);
        if (payment.getTimestamp() == null) payment.setTimestamp(LocalDateTime.now());
        if (payment.getStatus() == null) payment.setStatus("COMPLETED");
        if (payment.getUserId() == null) payment.setUserId(CurrentUser.id());

        BigDecimal newOwing = owing.subtract(payment.getAmount());
        if (newOwing.compareTo(BigDecimal.ZERO) < 0) newOwing = BigDecimal.ZERO;
        customerMapper.updateCurrentOwing(payment.getCustomerId(), newOwing);

        paymentMapper.insert(payment);
        revisionService.logPayment(payment.getCustomerId(), payment);
        return paymentMapper.findById(payment.getId(), outletId);
    }

    @Transactional
    public void voidPayment(Long id) {
        CustomerPayment payment = paymentMapper.findById(id, requireOutlet());
        if (payment == null) {
            throw new BusinessException("Payment not found.");
        }
        if ("VOIDED".equalsIgnoreCase(payment.getStatus())) {
            throw new BusinessException("Payment is already voided.");
        }

        CustomerDetail customer = customerMapper.findDetailById(payment.getCustomerId());
        if (customer == null) {
            throw new BusinessException("Customer not found.");
        }

        BigDecimal owing = customer.getCurrentOwing() != null ? customer.getCurrentOwing() : BigDecimal.ZERO;
        BigDecimal restored = owing.add(payment.getAmount() != null ? payment.getAmount() : BigDecimal.ZERO);
        customerMapper.updateCurrentOwing(payment.getCustomerId(), restored);

        paymentMapper.voidPayment(id);
        revisionService.logPaymentVoided(payment.getCustomerId(), payment);
    }

    private static Long requireOutlet() {
        Long outletId = CurrentUser.outletId();
        if (outletId == null) throw new BusinessException(40100, "Authenticated outlet is required.");
        return outletId;
    }
}
