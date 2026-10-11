package com.orithos.modules.ticket;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class ShelfTicket {
    private Long id;
    private Long productId;
    private Long outletId;
    private Long userId;
    private LocalDateTime createdAt;
}
