package com.orithos.modules.classification;

import lombok.Data;

/** Brand / Category / Family / Tag share this shape. */
@Data
public class Classification {
    private Long id;
    private String name;
    private Integer mdbId;
    /** Non-deleted products linked to this classification. */
    private Integer productCount;
}
