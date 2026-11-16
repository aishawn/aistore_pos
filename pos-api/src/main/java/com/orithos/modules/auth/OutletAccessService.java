package com.orithos.modules.auth;

import com.orithos.common.BusinessException;
import com.orithos.modules.ai.report.UserReportingOutletMapper;
import com.orithos.modules.register.Outlet;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.register.Register;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.user.entity.User;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;

import java.util.HashSet;
import java.util.List;
import java.util.Set;

@Service
public class OutletAccessService {

    private final OutletMapper outletMapper;
    private final RegisterMapper registerMapper;
    private final UserReportingOutletMapper reportingOutletMapper;

    public OutletAccessService(OutletMapper outletMapper,
                               RegisterMapper registerMapper,
                               UserReportingOutletMapper reportingOutletMapper) {
        this.outletMapper = outletMapper;
        this.registerMapper = registerMapper;
        this.reportingOutletMapper = reportingOutletMapper;
    }

    public void requireOutletAccess(Long outletId, User user, Long vendorId) {
        if (outletId == null || vendorId == null || user == null) {
            throw new BusinessException(40100, "Unauthorized");
        }
        Outlet outlet = outletMapper.findByIdAndVendor(outletId, vendorId);
        if (outlet == null) {
            throw new BusinessException(40410, "Outlet not found");
        }
        if (Boolean.TRUE.equals(user.getIsAdmin())) {
            return;
        }
        if (outletId.equals(user.getOutletId())) {
            return;
        }
        Set<Long> reporting = new HashSet<>(reportingOutletMapper.findOutletIds(user.getId()));
        if (reporting.contains(outletId)) {
            return;
        }
        throw new BusinessException(40300, "You do not have access to this outlet");
    }

    public Register requireRegisterForOutlet(Long registerId, Long outletId, Long vendorId) {
        if (registerId == null) {
            return null;
        }
        Register register = registerMapper.findByIdAndVendor(registerId, vendorId);
        if (register == null || !outletId.equals(register.getOutletId())) {
            throw new BusinessException(40410, "Register not found");
        }
        return register;
    }

    public Long requireVendor() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) {
            throw new BusinessException(40100, "Unauthorized");
        }
        return vendorId;
    }
}