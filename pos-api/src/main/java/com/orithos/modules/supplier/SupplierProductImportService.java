package com.orithos.modules.supplier;

import com.orithos.common.BusinessException;
import com.orithos.modules.supplier.mapper.SupplierProductImportMapper;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;

@Service
public class SupplierProductImportService {

    private final SupplierMapper supplierMapper;
    private final SupplierProductImportMapper importMapper;
    public SupplierProductImportService(SupplierMapper supplierMapper,
                                        SupplierProductImportMapper importMapper) {
        this.supplierMapper = supplierMapper;
        this.importMapper = importMapper;
    }

    @Transactional
    public SupplierProductImportResult importProducts(Long supplierId, String productList) {
        Long vendorId = CurrentUser.vendorId();
        if (vendorId == null) throw new BusinessException(40310, "Tenant context is required.");
        if (supplierId == null) {
            throw new BusinessException("Please select a supplier.");
        }
        if (supplierMapper.findByIdAndVendor(supplierId, vendorId) == null) {
            throw new BusinessException("Supplier not found.");
        }
        if (productList == null || productList.isBlank()) {
            throw new BusinessException("Please enter at least one supplier product code.");
        }

        SupplierProductImportResult result = new SupplierProductImportResult();
        String[] lines = productList.split("\\R");
        for (int i = 0; i < lines.length; i++) {
            String code = lines[i].trim();
            int lineNum = i + 1;
            if (code.isEmpty()) continue;

            try {
                importMapper.lockSupplierProductCode(vendorId, supplierId, code);
                if (importMapper.countExisting(supplierId, code, vendorId) > 0) {
                    result.setSkipped(result.getSkipped() + 1);
                    continue;
                }

                Long productId = importMapper.findProductIdByCode(code, vendorId);
                if (productId == null) {
                    productId = importMapper.findProductIdByMasterReference(code, vendorId);
                }
                if (productId == null) {
                    throw new BusinessException("No unique product match in this tenant. Create or map the product first.");
                }

                if (importMapper.insertLink(productId, supplierId, code, vendorId) != 1) {
                    throw new BusinessException("Product or supplier is no longer available in this tenant.");
                }
                result.setImported(result.getImported() + 1);
            } catch (BusinessException e) {
                result.getErrors().add(new SupplierProductImportError(lineNum, e.getMessage()));
            }
        }

        if (result.getImported() == 0 && result.getSkipped() == 0 && result.getErrors().isEmpty()) {
            throw new BusinessException("No supplier product codes found.");
        }
        return result;
    }

    public record ImportRequest(Long supplierId, String productList) {}
}
