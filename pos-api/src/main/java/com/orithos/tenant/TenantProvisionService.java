package com.orithos.tenant;

import com.orithos.common.BusinessException;
import com.orithos.modules.payment.PaymentMethod;
import com.orithos.modules.payment.PaymentMethodMapper;
import com.orithos.modules.register.Outlet;
import com.orithos.modules.register.OutletMapper;
import com.orithos.modules.register.Register;
import com.orithos.modules.register.RegisterMapper;
import com.orithos.modules.tax.TaxRate;
import com.orithos.modules.tax.TaxRateMapper;
import com.orithos.modules.user.UserService;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import com.orithos.security.AccountTokenStore;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;
import java.util.regex.Pattern;

@Service
public class TenantProvisionService {

    private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

    private final VendorMapper vendorMapper;
    private final OutletMapper outletMapper;
    private final UserService userService;
    private final TaxRateMapper taxRateMapper;
    private final PaymentMethodMapper paymentMethodMapper;
    private final RegisterMapper registerMapper;
    private final TenantSlugParser slugParser;
    private final TenantProperties tenantProperties;
    private final AccountTokenStore accountTokenStore;

    public TenantProvisionService(VendorMapper vendorMapper,
                                  OutletMapper outletMapper,
                                  UserService userService,
                                  TaxRateMapper taxRateMapper,
                                  PaymentMethodMapper paymentMethodMapper,
                                  RegisterMapper registerMapper,
                                  TenantSlugParser slugParser,
                                  TenantProperties tenantProperties,
                                  AccountTokenStore accountTokenStore) {
        this.vendorMapper = vendorMapper;
        this.outletMapper = outletMapper;
        this.userService = userService;
        this.taxRateMapper = taxRateMapper;
        this.paymentMethodMapper = paymentMethodMapper;
        this.registerMapper = registerMapper;
        this.slugParser = slugParser;
        this.tenantProperties = tenantProperties;
        this.accountTokenStore = accountTokenStore;
    }

    public record ProvisionRequest(
            String organisationName,
            String subdomain,
            String ownerName,
            String username,
            String email,
            String password,
            String phone,
            Integer trialDays,
            List<OutletSpec> outlets,
            Boolean dummyData
    ) {}

    public record OutletSpec(String name, Integer registerCount) {}

    public record ProvisionResult(
            Long vendorId,
            String subdomain,
            String redirectHost,
            String bootstrapToken,
            Long userId,
            Long outletId
    ) {}

    public boolean isSubdomainAvailable(String rawSlug) {
        String slug = slugParser.normalizeSlug(rawSlug);
        if (slug == null || slugParser.isReserved(slug)) {
            return false;
        }
        return vendorMapper.countBySubdomain(slug) == 0;
    }

    @Transactional
    public ProvisionResult provision(ProvisionRequest req) {
        String org = trim(req.organisationName());
        if (org == null || org.length() < 2) {
            throw new BusinessException(40001, "Organisation name is required");
        }
        String slug = slugParser.normalizeSlug(req.subdomain());
        if (slug == null) {
            throw new BusinessException(40001, "Invalid store subdomain");
        }
        if (slugParser.isReserved(slug)) {
            throw new BusinessException(40001, "This subdomain is reserved");
        }
        if (vendorMapper.countBySubdomain(slug) > 0) {
            throw new BusinessException(40910, "This subdomain is already taken");
        }

        String username = trim(req.username());
        if (username == null || username.length() < 3) {
            throw new BusinessException(40001, "Username must be at least 3 characters");
        }
        String ownerName = trim(req.ownerName());
        if (ownerName == null) ownerName = username;

        String email = trim(req.email());
        if (email == null || !EMAIL.matcher(email).matches()) {
            throw new BusinessException(40001, "A valid email is required");
        }
        validatePassword(req.password());

        int days = req.trialDays() != null && req.trialDays() > 0
                ? req.trialDays()
                : tenantProperties.getTrialDays();

        Vendor vendor = new Vendor();
        vendor.setName(org);
        vendor.setSubdomain(slug);
        vendor.setStatus("trial");
        vendor.setContactName(ownerName);
        vendor.setUrl(tenantProperties.storeUrl(slug));
        vendor.setTrialEndsAt(LocalDateTime.now().plusDays(days));
        vendor.setOutletId(1L);
        try {
            vendorMapper.insert(vendor);
        } catch (DataIntegrityViolationException e) {
            throw new BusinessException(40910, "This subdomain is already taken");
        }

        List<OutletSpec> requestedOutlets = req.outlets() == null || req.outlets().isEmpty()
                ? List.of(new OutletSpec(org, 1))
                : req.outlets();
        if (requestedOutlets.size() > 5) {
            throw new BusinessException(40001, "Trial stores support up to 5 outlets");
        }
        Outlet firstOutlet = null;
        for (OutletSpec spec : requestedOutlets) {
            String outletName = trim(spec.name());
            if (outletName == null) throw new BusinessException(40001, "Outlet name is required");
            if (outletName.length() > 120) {
                throw new BusinessException(40001, "Outlet name is too long");
            }
            int registerCount = spec.registerCount() == null ? 1 : spec.registerCount();
            if (registerCount < 1 || registerCount > 10) {
                throw new BusinessException(40001, "Register count must be between 1 and 10");
            }
            Outlet outlet = new Outlet();
            outlet.setVendorId(vendor.getId());
            outlet.setName(outletName);
            outlet.setLoyaltyEnabled(false);
            outlet.setHasKitchenScreen(false);
            outletMapper.insert(outlet);
            if (firstOutlet == null) firstOutlet = outlet;
            seedDefaults(outlet.getId());
            for (int registerIndex = 1; registerIndex <= registerCount; registerIndex++) {
                Register register = new Register();
                register.setName("Register #" + registerIndex);
                register.setOutletId(outlet.getId());
                register.setInvoiceNumber("1000");
                register.setClosed(true);
                registerMapper.insert(register);
            }
        }

        vendor.setOutletId(firstOutlet.getId());
        vendorMapper.updateProvisioning(vendor);

        User owner = new User();
        owner.setVendorId(vendor.getId());
        owner.setName(ownerName);
        owner.setUsername(username);
        owner.setEmail(email);
        owner.setPhone(trim(req.phone()));
        owner.setIsAdmin(true);
        owner.setIsApiUser(false);
        owner.setDarkMode("default");
        owner.setPendingPasswordReset(false);
        owner.setOutletId(firstOutlet.getId());
        userService.create(owner, req.password());

        String bootstrap = accountTokenStore.issue(
                owner.getId(), AccountTokenStore.PURPOSE_BOOTSTRAP, Duration.ofMinutes(5));

        return new ProvisionResult(
                vendor.getId(),
                slug,
                tenantProperties.storeUrl(slug),
                bootstrap,
                owner.getId(),
                firstOutlet.getId());
    }

    private void seedDefaults(Long outletId) {
        TaxRate gst = new TaxRate();
        gst.setName("GST");
        gst.setAmount(new BigDecimal("10.0000"));
        gst.setIsDefault(true);
        gst.setOutletId(outletId);
        taxRateMapper.insert(gst);

        PaymentMethod cash = new PaymentMethod();
        cash.setName("Cash");
        cash.setType("CASH");
        cash.setSurcharge(BigDecimal.ZERO);
        cash.setAlwaysOpenDrawer(true);
        cash.setAlwaysPrint(false);
        cash.setUseRounding(true);
        cash.setDefaultPayExact(false);
        cash.setOutletId(outletId);
        paymentMethodMapper.insert(cash);
        // Registers are created by the outlet loop (count from signup / admin request).
    }

    private static void validatePassword(String password) {
        if (password == null || password.length() < 8) {
            throw new BusinessException(40001, "Password must be at least 8 characters");
        }
        if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            throw new BusinessException(40001, "Password must be no more than 72 UTF-8 bytes");
        }
    }

    private static String trim(String value) {
        if (value == null) return null;
        String t = value.trim();
        return t.isEmpty() ? null : t;
    }
}
