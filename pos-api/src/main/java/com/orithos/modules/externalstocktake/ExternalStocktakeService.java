package com.orithos.modules.externalstocktake;

import com.orithos.common.BusinessException;
import com.orithos.common.ExcelUtils;
import com.orithos.modules.register.OutletMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.List;

@Service
public class ExternalStocktakeService {

    private static final String[] TEMPLATE_HEADERS = {
            "Outlet", "Barcode", "Quantity", "Case Quantity"
    };

    private final ExternalStocktakeMapper mapper;
    private final OutletMapper outletMapper;

    public ExternalStocktakeService(ExternalStocktakeMapper mapper, OutletMapper outletMapper) {
        this.mapper = mapper;
        this.outletMapper = outletMapper;
    }

    public List<ExternalStocktake> list() {
        return mapper.findAll();
    }

    public byte[] importTemplateXlsx() throws IOException {
        return ExcelUtils.writeXlsx("External Stocktake", TEMPLATE_HEADERS,
                new String[]{"Main Store", "9310658001234", "24", "1"},
                new String[]{"Main Store", "9310658005678", "12", "6"});
    }

    public ExternalStocktake importFile(MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new IllegalArgumentException("File is required");
        }
        ExternalStocktake e = new ExternalStocktake();
        e.setZeroStock(false);
        e.setOverrideStock(false);
        e.setStatus("PENDING");
        e.setTimestamp(LocalDateTime.now());
        mapper.insert(e);
        return e;
    }

    public byte[] exportXlsx(Long outletId, boolean includeNoBarcode) throws IOException {
        if (outletId == null) {
            throw new BusinessException("Outlet is required.");
        }
        if (outletMapper.findById(outletId) == null) {
            throw new BusinessException("Outlet not found.");
        }

        List<ExternalStocktakeExportRow> rows = new ArrayList<>(mapper.exportProductsWithBarcodes(outletId));
        if (includeNoBarcode) {
            for (ExternalStocktakeExportRow row : mapper.exportProductsWithoutBarcodes(outletId)) {
                row.setBarcode("");
                rows.add(row);
            }
        }

        String[][] data = rows.stream()
                .map(r -> new String[]{
                        r.getOutletName() != null ? r.getOutletName() : "",
                        r.getBarcode() != null ? r.getBarcode() : "",
                        "",
                        r.getCaseQuantity() != null ? r.getCaseQuantity().toPlainString() : ""
                })
                .toArray(String[][]::new);

        return ExcelUtils.writeXlsx("External Stocktake", TEMPLATE_HEADERS, data);
    }
}
