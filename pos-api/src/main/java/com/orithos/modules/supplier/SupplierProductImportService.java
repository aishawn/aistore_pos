package com.orithos.modules.supplier;

import com.orithos.common.BusinessException;
import com.orithos.modules.product.Product;
import com.orithos.modules.product.ProductService;
import com.orithos.modules.supplier.mapper.SupplierProductImportMapper;
import org.springframework.stereotype.Service;

import java.util.List;

@Service
public class SupplierProductImportService {

    private final SupplierMapper supplierMapper;
    private final SupplierProductImportMapper importMapper;
    private final ProductService productService;

    public SupplierProductImportService(SupplierMapper supplierMapper,
                                        SupplierProductImportMapper importMapper,
                                        ProductService productService) {
        this.supplierMapper = supplierMapper;
        this.importMapper = importMapper;
        this.productService = productService;
    }

    public SupplierProductImportResult importProducts(Long supplierId, String productList) {
        if (supplierId == null) {
            throw new BusinessException("Please select a supplier.");
        }
        if (supplierMapper.findById(supplierId) == null) {
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
                if (importMapper.countExisting(supplierId, code) > 0) {
                    result.setSkipped(result.getSkipped() + 1);
                    continue;
                }

                Long productId = importMapper.findProductIdByCode(code);
                if (productId == null) {
                    productId = importMapper.findProductIdByMasterReference(code);
                }
                if (productId == null) {
                    productId = createFromMasterDatabase(code);
                }

                importMapper.insertLink(productId, supplierId, code);
                result.setImported(result.getImported() + 1);
            } catch (BusinessException e) {
                result.getErrors().add(new SupplierProductImportError(lineNum, e.getMessage()));
            } catch (Exception e) {
                result.getErrors().add(new SupplierProductImportError(
                        lineNum, e.getMessage() != null ? e.getMessage() : "Import failed"));
            }
        }

        if (result.getImported() == 0 && result.getSkipped() == 0 && result.getErrors().isEmpty()) {
            throw new BusinessException("No supplier product codes found.");
        }
        return result;
    }

    private Long createFromMasterDatabase(String code) {
        Product product = new Product();
        product.setName(code);
        product.setType("STANDARD");
        product.setStatus("ACTIVE");
        product.setTrackInventory(true);
        productService.create(product);
        return product.getId();
    }

    public record ImportRequest(Long supplierId, String productList) {}
}
