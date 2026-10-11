package com.orithos.modules.quickmenu;

import lombok.Data;

@Data
public class QuickMenuItem {
    private Long id;
    private Long userId;
    private String name;
    private String url;
    private Boolean external;
    private Integer position;
}
