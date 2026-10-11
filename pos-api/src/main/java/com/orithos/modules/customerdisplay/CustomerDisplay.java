package com.orithos.modules.customerdisplay;

import lombok.Data;

import java.time.LocalDateTime;

@Data
public class CustomerDisplay {
    private Long id;
    private String name;
    private String mainColour;
    private String textColour;
    private String idle;
    private String sale;
    private LocalDateTime createdAt;
}
