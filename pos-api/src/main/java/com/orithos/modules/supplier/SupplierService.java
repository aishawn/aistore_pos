package com.orithos.modules.supplier;

import com.orithos.common.BusinessException;
import com.orithos.modules.customer.Contact;
import com.orithos.modules.customer.mapper.ContactMapper;
import com.orithos.modules.supplier.mapper.SupplierAdditionalContactMapper;
import com.orithos.modules.supplier.mapper.SupplierAuthenticationMapper;
import com.orithos.modules.register.OutletMapper;
import com.orithos.security.CurrentUser;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class SupplierService {

    private final SupplierMapper supplierMapper;
    private final ContactMapper contactMapper;
    private final SupplierAuthenticationMapper authenticationMapper;
    private final SupplierAdditionalContactMapper additionalContactMapper;
    private final PasswordEncoder passwordEncoder;
    private final OutletMapper outletMapper;

    public SupplierService(SupplierMapper supplierMapper,
                           ContactMapper contactMapper,
                           SupplierAuthenticationMapper authenticationMapper,
                           SupplierAdditionalContactMapper additionalContactMapper,
                           PasswordEncoder passwordEncoder,
                           OutletMapper outletMapper) {
        this.supplierMapper = supplierMapper;
        this.contactMapper = contactMapper;
        this.authenticationMapper = authenticationMapper;
        this.additionalContactMapper = additionalContactMapper;
        this.passwordEncoder = passwordEncoder;
        this.outletMapper = outletMapper;
    }

    public SupplierDetail getDetail(Long id) {
        Long vendorId = requireVendorId();
        SupplierDetail detail = supplierMapper.findDetailByIdAndVendor(id, vendorId);
        if (detail == null) {
            throw new BusinessException("Supplier not found.");
        }
        attachAuthentication(detail);
        attachAdditionalContacts(detail);
        return sanitizeForResponse(detail);
    }

    @Transactional
    public SupplierDetail create(SupplierDetail input) {
        Long vendorId = requireVendorId();
        Long outletId = CurrentUser.outletId();
        if (outletId == null || outletMapper.findByIdAndVendor(outletId, vendorId) == null) {
            throw new BusinessException(40310, "A tenant outlet is required to create a supplier.");
        }
        SupplierDetail detail = prepareForSave(input);
        if (detail.getBusinessNumber() != null && !detail.getBusinessNumber().isBlank()) {
            List<Supplier> matches = supplierMapper.findMatchesByNameOrAbnForVendor(
                    null, detail.getBusinessNumber(), vendorId);
            if (!matches.isEmpty()) {
                throw new BusinessException("ABN / Tax ID already belongs to " + matches.getFirst().getName() + ".");
            }
        }
        detail.setOutletId(outletId);
        applyPersistableDefaults(detail);
        detail.setContactId(upsertContact(null, toContact(detail), outletId));
        supplierMapper.insertDetail(detail);
        saveAuthentication(detail.getId(), outletId, detail, null);
        saveAdditionalContacts(detail.getId(), outletId, detail.getAdditionalContacts());
        return getDetail(detail.getId());
    }

    @Transactional
    public SupplierDetail update(Long id, SupplierDetail input) {
        Long vendorId = requireVendorId();
        SupplierDetail existing = supplierMapper.findDetailByIdAndVendor(id, vendorId);
        if (existing == null) {
            throw new BusinessException("Supplier not found.");
        }

        SupplierDetail detail = prepareForSave(input);
        detail.setId(id);
        detail.setOutletId(existing.getOutletId());
        ensurePersistableDefaults(detail, existing);
        detail.setContactId(upsertContact(existing.getContactId(), toContact(detail), existing.getOutletId()));
        supplierMapper.updateDetail(detail);
        saveAuthentication(id, existing.getOutletId(), detail,
                authenticationMapper.findBySupplierId(id, existing.getOutletId()));
        saveAdditionalContacts(id, existing.getOutletId(), detail.getAdditionalContacts());
        return getDetail(id);
    }

    @Transactional
    public void delete(Long id) {
        if (supplierMapper.findDetailByIdAndVendor(id, requireVendorId()) == null
                || supplierMapper.softDelete(id, requireVendorId()) == 0) {
            throw new BusinessException("Supplier not found.");
        }
    }

    @Transactional
    public void merge(Long targetId, List<Long> sourceIds) {
        Long vendorId = requireVendorId();
        if (supplierMapper.findDetailByIdAndVendor(targetId, vendorId) == null) {
            throw new BusinessException("Supplier not found.");
        }
        if (sourceIds == null) return;
        for (Long sourceId : sourceIds) {
            if (sourceId == null || sourceId.equals(targetId)) continue;
            if (supplierMapper.findDetailByIdAndVendor(sourceId, vendorId) == null) {
                throw new BusinessException("Supplier not found.");
            }
            supplierMapper.reassignProductCoreSupplier(targetId, sourceId, vendorId);
            supplierMapper.reassignProductSupplier(targetId, sourceId, vendorId);
            supplierMapper.reassignOrderFrom(targetId, sourceId, vendorId);
            supplierMapper.reassignOrderProductSupplier(targetId, sourceId, vendorId);
            supplierMapper.reassignFutureCostSupplier(targetId, sourceId, vendorId);
            if (supplierMapper.softDelete(sourceId, vendorId) == 0) {
                throw new BusinessException("Supplier not found.");
            }
        }
    }

    private static Long requireVendorId() {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40310, "Tenant context is required.");
        return vendorId;
    }

    private SupplierDetail prepareForSave(SupplierDetail input) {
        SupplierDetail detail = normalize(input);
        applyPersistableDefaults(detail);
        return detail;
    }

    private static SupplierDetail normalize(SupplierDetail detail) {
        if (detail.getName() == null || detail.getName().isBlank()) {
            throw new BusinessException("Name is required.");
        }
        detail.setName(detail.getName().trim());
        return detail;
    }

    private static void applyPersistableDefaults(SupplierDetail detail) {
        if (detail.getOrderAutomaticEmail() == null) detail.setOrderAutomaticEmail(false);
        if (detail.getFreightIncludedOnInvoices() == null) detail.setFreightIncludedOnInvoices(true);
        if (detail.getAllowOrderBelowMinimum() == null) detail.setAllowOrderBelowMinimum(false);
        if (detail.getStatus() == null || detail.getStatus().isBlank()) detail.setStatus("ACTIVE");
    }

    private static void ensurePersistableDefaults(SupplierDetail detail, SupplierDetail existing) {
        if (detail.getOrderAutomaticEmail() == null) {
            detail.setOrderAutomaticEmail(
                    existing.getOrderAutomaticEmail() != null ? existing.getOrderAutomaticEmail() : false);
        }
        if (detail.getFreightIncludedOnInvoices() == null) {
            detail.setFreightIncludedOnInvoices(
                    existing.getFreightIncludedOnInvoices() != null ? existing.getFreightIncludedOnInvoices() : true);
        }
        if (detail.getAllowOrderBelowMinimum() == null) {
            detail.setAllowOrderBelowMinimum(
                    existing.getAllowOrderBelowMinimum() != null ? existing.getAllowOrderBelowMinimum() : false);
        }
    }

    private void attachAuthentication(SupplierDetail detail) {
        SupplierAuthentication auth = authenticationMapper.findBySupplierId(detail.getId(), detail.getOutletId());
        if (auth == null) return;
        detail.setAuthAccountNumber(auth.getAccountNumber());
        detail.setUsername(auth.getUsername());
        detail.setAdditionalAuth(auth.getAdditionalAuth());
    }

    private void attachAdditionalContacts(SupplierDetail detail) {
        detail.setAdditionalContacts(additionalContactMapper.findBySupplierId(detail.getId(), detail.getOutletId()));
    }

    private SupplierDetail sanitizeForResponse(SupplierDetail detail) {
        detail.setPassword(null);
        return detail;
    }

    private void saveAuthentication(Long supplierId, Long outletId, SupplierDetail input,
                                    SupplierAuthentication existing) {
        SupplierAuthentication auth = new SupplierAuthentication();
        auth.setSupplierId(supplierId);
        auth.setOutletId(outletId);
        auth.setAccountNumber(trimToNull(input.getAuthAccountNumber()));
        auth.setUsername(trimToNull(input.getUsername()));
        auth.setAdditionalAuth(trimToNull(input.getAdditionalAuth()));

        String password = trimToNull(input.getPassword());
        if (password != null) {
            auth.setPasswordHash(passwordEncoder.encode(password));
        } else if (existing != null) {
            auth.setPasswordHash(existing.getPasswordHash());
        }

        if (auth.isBlank()) {
            authenticationMapper.deleteBySupplierId(supplierId, outletId);
            return;
        }

        if (existing == null) {
            authenticationMapper.insert(auth);
        } else {
            authenticationMapper.update(auth);
        }
    }

    private void saveAdditionalContacts(Long supplierId, Long outletId,
                                        List<SupplierAdditionalContact> contacts) {
        additionalContactMapper.deleteBySupplierId(supplierId, outletId);
        if (contacts == null || contacts.isEmpty()) return;

        int order = 0;
        for (SupplierAdditionalContact contact : contacts) {
            if (contact == null || contact.isBlank()) continue;
            SupplierAdditionalContact row = new SupplierAdditionalContact();
            row.setSupplierId(supplierId);
            row.setOutletId(outletId);
            row.setName(trimToNull(contact.getName()));
            row.setEmail(trimToNull(contact.getEmail()));
            row.setPhone(trimToNull(contact.getPhone()));
            row.setSortOrder(order++);
            additionalContactMapper.insert(row);
        }
    }

    private Long upsertContact(Long existingId, Contact contact, Long outletId) {
        contact.setOutletId(outletId);
        if (existingId == null) {
            if (contact.isBlank()) return null;
            contactMapper.insertForOutlet(contact);
            return contact.getId();
        }
        contact.setId(existingId);
        if (contactMapper.updateForOutlet(contact) == 0) {
            throw new BusinessException("Supplier contact not found.");
        }
        return existingId;
    }

    private static Contact toContact(SupplierDetail detail) {
        Contact contact = new Contact();
        contact.setOutletId(detail.getOutletId());
        contact.setEmail(trimToNull(detail.getEmail()));
        contact.setFax(trimToNull(detail.getFax()));
        contact.setPhone(trimToNull(detail.getPhone()));
        contact.setMobile(trimToNull(detail.getMobile()));
        contact.setWebsite(trimToNull(detail.getWebsite()));
        contact.setTwitter(trimToNull(detail.getTwitter()));
        contact.setFacebook(trimToNull(detail.getFacebook()));
        contact.setAddressStreet1(trimToNull(detail.getStreetAddress1()));
        contact.setAddressStreet2(trimToNull(detail.getStreetAddress2()));
        contact.setAddressSuburb(trimToNull(detail.getSuburb()));
        contact.setAddressCity(trimToNull(detail.getCity()));
        contact.setAddressPostcode(trimToNull(detail.getPostCode()));
        contact.setAddressRegion(trimToNull(detail.getRegion()));
        contact.setAddressCountry(trimToNull(detail.getCountry()));
        return contact;
    }

    private static String trimToNull(String value) {
        if (value == null) return null;
        String trimmed = value.trim();
        return trimmed.isEmpty() ? null : trimmed;
    }
}
