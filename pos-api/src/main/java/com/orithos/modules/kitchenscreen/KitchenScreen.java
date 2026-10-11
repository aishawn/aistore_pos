package com.orithos.modules.kitchenscreen;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class KitchenScreen {
    private Long id;
    private String name;
    private String rules;
    private LocalDateTime createdAt;
}
