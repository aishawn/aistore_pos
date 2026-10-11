package com.orithos.modules.giftcard;

import com.orithos.common.ExcelUtils;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.time.format.DateTimeFormatter;
import java.util.List;

@Service
public class GiftCardExportService {

    private static final String[] HEADERS = {
            "Code", "Amount", "Current Amount", "Expiry", "Status", "Outlet ID"
    };

    private static final DateTimeFormatter EXPIRY_FORMAT = DateTimeFormatter.ISO_LOCAL_DATE;

    private final GiftCardMapper mapper;

    public GiftCardExportService(GiftCardMapper mapper) {
        this.mapper = mapper;
    }

    public byte[] exportXlsx(String code, Boolean redeemedExpiredOnly, Long outletId) throws IOException {
        List<GiftCard> rows = mapper.listAll(code, redeemedExpiredOnly, outletId);

        String[][] data = rows.stream()
                .map(g -> new String[]{
                        g.getCode() != null ? g.getCode() : "",
                        g.getOriginalAmount() != null ? g.getOriginalAmount().toPlainString() : "",
                        g.getCurrentAmount() != null ? g.getCurrentAmount().toPlainString() : "",
                        g.getExpiry() != null ? g.getExpiry().format(EXPIRY_FORMAT) : "",
                        g.getStatus() != null ? g.getStatus() : "",
                        g.getOutletId() != null ? g.getOutletId().toString() : "",
                })
                .toArray(String[][]::new);

        return ExcelUtils.writeXlsx("Gift Cards", HEADERS, data);
    }
}
