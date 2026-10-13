package com.orithos.modules.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.mail.SimpleMailMessage;
import org.springframework.mail.javamail.JavaMailSender;
import org.springframework.stereotype.Service;

/** Optional SMTP delivery. When MAIL_HOST is unset, admins copy invite/reset links instead. */
@Service
public class MailService {

    private static final Logger log = LoggerFactory.getLogger(MailService.class);

    private final JavaMailSender mailSender;
    private final String host;
    private final String from;

    public MailService(
            ObjectProvider<JavaMailSender> mailSender,
            @Value("${spring.mail.host:}") String host,
            @Value("${app.mail.from:noreply@orithos.com.au}") String from) {
        this.mailSender = mailSender.getIfAvailable();
        this.host = host == null ? "" : host.trim();
        this.from = from;
    }

    public boolean isConfigured() {
        return mailSender != null && !host.isBlank();
    }

    public boolean send(String to, String subject, String body) {
        if (!isConfigured() || to == null || to.isBlank()) return false;
        try {
            SimpleMailMessage message = new SimpleMailMessage();
            message.setFrom(from);
            message.setTo(to.trim());
            message.setSubject(subject);
            message.setText(body);
            mailSender.send(message);
            return true;
        } catch (Exception e) {
            log.warn("Failed to send email to {}: {}", to, e.getMessage());
            return false;
        }
    }
}
