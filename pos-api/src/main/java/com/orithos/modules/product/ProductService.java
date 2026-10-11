package com.orithos.modules.product;

import com.orithos.common.BarcodeUtils;
import com.orithos.common.BusinessException;
import com.orithos.common.CaseQuantityUtils;
import com.orithos.common.LiquorProducts;
import com.orithos.common.PriceQuantityUtils;
import com.orithos.common.QuantityUtils;
import com.orithos.common.SqlConstraintUtils;
import com.orithos.modules.product.mapper.ProductMapper;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class ProductService {

    public static final int DUPLICATE_NAME_CODE = 40902;
    public static final int DUPLICATE_BARCODE_CODE = 40903;

    private final ProductMapper mapper;
    private final ProductRevisionService revisionService;

    public ProductService(ProductMapper mapper, ProductRevisionService revisionService) {
        this.mapper = mapper;
        this.revisionService = revisionService;
    }

    private void normalizeLiquorFields(Product p) {
        if (p.getVolumeMl() == null) {
            p.setVolumeMl(LiquorProducts.volumeMlFromName(p.getName()));
        }
        LiquorProducts.requireVolumeMl(p.getVolumeMl());
        p.setRegion(LiquorProducts.normalizeRegion(p.getRegion()));
        p.setVintage(LiquorProducts.normalizeVintage(p.getVintage()));
    }

    private void requireLiquorAbv(Product p) {
        String category = p.getCategoryName();
        if ((category == null || category.isBlank()) && p.getCategoryId() != null) {
            category = mapper.findCategoryName(p.getCategoryId());
        }
        if (LiquorProducts.isLiquor(p.getName(), category)) {
            LiquorProducts.requireAbv(p.getAbv());
        } else if (p.getAbv() != null) {
            LiquorProducts.requireAbv(p.getAbv());
        }
    }

    public void ensureUniqueActiveName(String name, Long excludeId) {
        if (name == null || name.isBlank()) {
            throw new BusinessException("Product name is required.");
        }
        String trimmed = name.trim();
        long count = excludeId == null
                ? mapper.countActiveByName(trimmed)
                : mapper.countActiveByNameExcluding(trimmed, excludeId);
        if (count > 0) {
            throw new BusinessException(DUPLICATE_NAME_CODE, "A product with this name already exists.");
        }
    }

    public Product create(Product p) {
        ensureUniqueActiveName(p.getName(), null);
        CaseQuantityUtils.validate(p.getCaseQuantity());
        QuantityUtils.validateNonNegative(p.getCost(), "Cost");
        PriceQuantityUtils.validatePrice(p.getPrice());
        if (p.getType() == null) p.setType("STANDARD");
        if (p.getStatus() == null) p.setStatus("ACTIVE");
        if (p.getTrackInventory() == null) p.setTrackInventory(true);
        if (p.getCostPercentage() == null) p.setCostPercentage(false);
        if (p.getPreventManualDiscounts() == null) p.setPreventManualDiscounts(false);
        if (p.getRequestPrice() == null) p.setRequestPrice(false);
        if (p.getRequestQuantity() == null) p.setRequestQuantity(false);
        if (p.getShowShortcuts() == null) p.setShowShortcuts(false);
        normalizeLiquorFields(p);
        requireLiquorAbv(p);
        try {
            mapper.insert(p);
        } catch (RuntimeException e) {
            throw constraintOrRethrow(e);
        }
        revisionService.logCreated(p.getId());
        return p;
    }

    public Product update(Product p) {
        Product before = mapper.findById(p.getId());
        if (before == null) {
            throw new BusinessException("Product not found.");
        }
        if (p.getName() != null) {
            ensureUniqueActiveName(p.getName(), p.getId());
        }
        CaseQuantityUtils.validate(p.getCaseQuantity());
        QuantityUtils.validateNonNegative(p.getCost(), "Cost");
        PriceQuantityUtils.validatePrice(p.getPrice());
        normalizeLiquorFields(p);
        requireLiquorAbv(p);
        try {
            mapper.update(p);
        } catch (RuntimeException e) {
            throw constraintOrRethrow(e);
        }
        if (p.getPrice() != null) {
            Long priceId = mapper.findDefaultPriceId(p.getId());
            if (priceId != null) {
                mapper.updatePriceById(priceId, p.getPrice());
            } else {
                mapper.insertDefaultPrice(p.getId(), p.getPrice());
            }
        }
        Product after = mapper.findById(p.getId());
        revisionService.logUpdated(before, after);
        return after;
    }

    /**
     * Two-step delete: non-inactive products are deactivated first; inactive products are soft-deleted.
     */
    public void delete(Long id) {
        Product product = mapper.findById(id);
        if (product == null) {
            throw new BusinessException("Product not found.");
        }
        if ("INACTIVE".equalsIgnoreCase(product.getStatus())) {
            mapper.softDelete(id);
            revisionService.logDeleted(id);
        } else {
            mapper.updateStatus(id, "INACTIVE");
            revisionService.logDeactivated(id);
        }
    }

    @Transactional
    public void bulkDelete(List<Long> ids) {
        if (ids == null || ids.isEmpty()) {
            return;
        }
        for (Long id : ids) {
            if (id != null) {
                delete(id);
            }
        }
    }

    public List<ProductRevision> getRevisions(Long id, int page, int size) {
        if (mapper.findById(id) == null) {
            throw new BusinessException("Product not found.");
        }
        return revisionService.list(id, page, size);
    }

    public long getRevisionCount(Long id) {
        return revisionService.count(id);
    }

    public void associateBarcode(Long productId, String barcode) {
        String code = BarcodeUtils.normalize(barcode);
        BarcodeUtils.validateFormat(code);
        ensureBarcodeAvailable(code, productId);
        try {
            mapper.insertBarcode(productId, code);
        } catch (RuntimeException e) {
            throw duplicateBarcodeOrRethrow(e);
        }
    }

    public record BarcodeAvailability(boolean available, String productName) {}

    /** Returns whether {@code barcode} can be assigned, optionally ignoring an existing link on {@code excludeProductId}. */
    public BarcodeAvailability checkBarcodeAvailability(String barcode, Long excludeProductId) {
        String code = BarcodeUtils.normalize(barcode);
        if (code.isEmpty()) {
            return new BarcodeAvailability(true, null);
        }
        Long ownerId = mapper.findProductIdByBarcode(code);
        if (ownerId == null) {
            return new BarcodeAvailability(true, null);
        }
        if (excludeProductId != null && excludeProductId.equals(ownerId)) {
            return new BarcodeAvailability(true, null);
        }
        Product owner = mapper.findById(ownerId);
        return new BarcodeAvailability(false, owner != null ? owner.getName() : null);
    }

    private void ensureBarcodeAvailable(String code, Long excludeProductId) {
        BarcodeAvailability availability = checkBarcodeAvailability(code, excludeProductId);
        if (!availability.available()) {
            String message = availability.productName() != null && !availability.productName().isBlank()
                    ? "This barcode is already assigned to \"" + availability.productName() + "\"."
                    : "This barcode is already assigned to another product.";
            throw new BusinessException(DUPLICATE_BARCODE_CODE, message);
        }
    }

    private RuntimeException constraintOrRethrow(RuntimeException e) {
        if (SqlConstraintUtils.isDuplicateProductName(e)) {
            return new BusinessException(DUPLICATE_NAME_CODE, "A product with this name already exists.");
        }
        if (SqlConstraintUtils.isInvalidCaseQuantity(e)) {
            return new BusinessException("Case quantity must be greater than zero.");
        }
        if (SqlConstraintUtils.isInvalidPriceQuantity(e)) {
            return new BusinessException("Price quantity must be greater than zero.");
        }
        return e;
    }

    private RuntimeException duplicateBarcodeOrRethrow(RuntimeException e) {
        if (SqlConstraintUtils.isDuplicateBarcode(e)) {
            return new BusinessException(DUPLICATE_BARCODE_CODE, "This barcode is already assigned to another product.");
        }
        return e;
    }
}
