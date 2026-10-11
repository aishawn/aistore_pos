package com.orithos.modules.utility;

import lombok.Data;

import java.time.LocalDateTime;

/** Maps to table mail_log. */
@Data
public class MailLog {
    private Long id;
    private String recipient;
    private String subject;
    private String status;
    private LocalDateTime sentAt;
}
