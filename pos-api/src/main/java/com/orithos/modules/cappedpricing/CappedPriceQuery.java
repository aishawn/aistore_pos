package com.orithos.modules.cappedpricing;

import lombok.Data;

@Data
public class CappedPriceQuery {
    /** PROVIDED, IMPORTED, or ALL (both). */
    private String sourceType = "PROVIDED";
    private int page = 1;
    private int size = 10;

    public int getOffset() {
        return Math.max(0, (page - 1) * size);
    }
}
