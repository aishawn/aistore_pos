package com.orithos.modules.config;

import lombok.Data;
import java.time.LocalDateTime;

@Data
public class Transferee {
    private Long id;
    private String name;
    private Long contactId;
    private Boolean orderAutomaticEmail;
    private String emailFormat;
    private Boolean sendOrdersToAccountsFlow;
    private LocalDateTime deletedAt;
}
