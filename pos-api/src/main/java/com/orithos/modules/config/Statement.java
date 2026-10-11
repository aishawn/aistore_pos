package com.orithos.modules.config;

import lombok.Data;

@Data
public class Statement {
    private Long id;
    private String name;
    private String components;
    private String signature;
    private String replyTo;
    private String subject;
}
