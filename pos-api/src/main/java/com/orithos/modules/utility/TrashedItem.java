package com.orithos.modules.utility;

import lombok.Data;

import java.time.LocalDateTime;

/** Maps to table trashed_item. */
@Data
public class TrashedItem {
    private Long id;
    private String itemType;
    private Long itemId;
    private String name;
    private LocalDateTime deletedAt;
}
