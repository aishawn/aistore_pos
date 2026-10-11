package com.orithos.modules.order;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class OrderReview {
    private Long id;
    private Long orderId;
    private String status;
    private String notes;
    private String data;
    private LocalDateTime createdAt;
}
