package com.orithos.modules.classification;

import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/** Brand / Category / Family / Tag share this shape. */
@Data
public class Classification {
    private Long id;
    private String name;
    private Integer mdbId;
    /** brand | category | family | tag — set by list responses for the UI table. */
    private String type;
    /** Non-deleted products linked to this classification in the caller's outlet. */
    private Integer productCount;
    /** Units sold per Adelaide business day for the past 30 days (oldest → newest). */
    private List<BigDecimal> performance30d;
}
