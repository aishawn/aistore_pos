package com.orithos.config;

import com.orithos.modules.classification.Classification;
import com.orithos.modules.classification.ClassificationType;
import com.orithos.modules.classification.mapper.ClassificationMapper;
import com.orithos.modules.customer.CustomerGroupService;
import com.orithos.modules.supplier.Supplier;
import com.orithos.modules.supplier.SupplierMapper;
import com.orithos.modules.user.entity.User;
import com.orithos.modules.user.mapper.UserMapper;
import com.orithos.modules.vendor.Vendor;
import com.orithos.modules.vendor.VendorMapper;
import org.springframework.boot.CommandLineRunner;
import org.springframework.dao.DataAccessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Seeds an initial admin user on startup if none exists, so the
 * app is usable immediately. Safe to run repeatedly; skips if the table is missing.
 */
@Component
public class DataInitializer implements CommandLineRunner {

    private static final List<String> DEFAULT_TAGS = List.of(
            "New Arrival", "On Sale", "Featured", "Clearance");
    private static final List<String> DEFAULT_FAMILIES = List.of(
            "Spirits", "Beer", "Wine");
    private static final List<String> DEFAULT_SUPPLIERS = List.of(
            "Lion Nathan", "CUB", "Diageo");

    private final UserMapper userMapper;
    private final VendorMapper vendorMapper;
    private final ClassificationMapper classificationMapper;
    private final SupplierMapper supplierMapper;
    private final CustomerGroupService customerGroupService;
    private final PasswordEncoder encoder;

    @Value("${app.initial-admin-password:123456}")
    private String initialAdminPassword;

    public DataInitializer(UserMapper userMapper,
                           VendorMapper vendorMapper,
                           ClassificationMapper classificationMapper,
                           SupplierMapper supplierMapper,
                           CustomerGroupService customerGroupService,
                           PasswordEncoder encoder) {
        this.userMapper = userMapper;
        this.vendorMapper = vendorMapper;
        this.classificationMapper = classificationMapper;
        this.supplierMapper = supplierMapper;
        this.customerGroupService = customerGroupService;
        this.encoder = encoder;
    }

    @Override
    public void run(String... args) {
        ensureDefaultVendor();
        try {
            if (userMapper.findByVendorAndUsername(1L, "admin") == null
                    && userMapper.findByUsername("admin") == null) {
                User admin = new User();
                admin.setVendorId(1L);
                admin.setName("admin");
                admin.setUsername("admin");
                admin.setPasswordHash(encoder.encode(initialAdminPassword));
                admin.setIsAdmin(true);
                admin.setIsApiUser(false);
                admin.setDarkMode("default");
                admin.setPendingPasswordReset(false);
                admin.setOutletId(1L);
                userMapper.insert(admin);
                System.out.println("[DataInitializer] Seeded initial admin user.");
            }
        } catch (DataAccessException e) {
            System.out.println("[DataInitializer] Skipped seeding (run db/schema.sql first): " + e.getMessage());
        }

        seedDefaultTags();
        seedDefaultFamilies();
        seedDefaultSuppliers();
        seedDefaultCustomerGroup();
    }

    private void ensureDefaultVendor() {
        try {
            if (vendorMapper.findById(1L) != null) return;
            if (vendorMapper.findBySubdomain("default") != null) return;
            Vendor vendor = new Vendor();
            vendor.setName("Default");
            vendor.setSubdomain("default");
            vendor.setStatus("active");
            vendor.setOutletId(1L);
            vendorMapper.insert(vendor);
            System.out.println("[DataInitializer] Seeded default vendor (subdomain=default).");
        } catch (DataAccessException e) {
            System.out.println("[DataInitializer] Skipped default vendor seeding: " + e.getMessage());
        }
    }

    private void seedDefaultCustomerGroup() {
        try {
            customerGroupService.ensureDefaultGroup();
        } catch (Exception e) {
            System.out.println("[DataInitializer] Skipped default customer group seeding: " + e.getMessage());
        }
    }

    private void seedDefaultTags() {
        try {
            if (classificationMapper.count(ClassificationType.TAG.table()) > 0) return;
            for (String name : DEFAULT_TAGS) {
                Classification tag = new Classification();
                tag.setName(name);
                classificationMapper.insert(ClassificationType.TAG.table(), tag);
            }
            System.out.println("[DataInitializer] Seeded default product tags.");
        } catch (DataAccessException e) {
            System.out.println("[DataInitializer] Skipped tag seeding: " + e.getMessage());
        }
    }

    private void seedDefaultFamilies() {
        try {
            if (classificationMapper.count(ClassificationType.FAMILY.table()) > 0) return;
            for (String name : DEFAULT_FAMILIES) {
                Classification family = new Classification();
                family.setName(name);
                classificationMapper.insert(ClassificationType.FAMILY.table(), family);
            }
            System.out.println("[DataInitializer] Seeded default product families.");
        } catch (DataAccessException e) {
            System.out.println("[DataInitializer] Skipped family seeding: " + e.getMessage());
        }
    }

    private void seedDefaultSuppliers() {
        try {
            if (supplierMapper.count(null) > 0) return;
            for (String name : DEFAULT_SUPPLIERS) {
                Supplier supplier = new Supplier();
                supplier.setName(name);
                supplier.setStatus("ACTIVE");
                supplierMapper.insert(supplier);
            }
            System.out.println("[DataInitializer] Seeded default suppliers.");
        } catch (DataAccessException e) {
            System.out.println("[DataInitializer] Skipped supplier seeding: " + e.getMessage());
        }
    }
}
