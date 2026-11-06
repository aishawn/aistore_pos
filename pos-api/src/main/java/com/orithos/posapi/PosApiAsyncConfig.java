package com.orithos.posapi;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

@Configuration
@EnableScheduling
public class PosApiAsyncConfig {
    @Bean("posApiExecutor")
    public Executor posApiExecutor() { return Executors.newFixedThreadPool(4, r -> { Thread t=new Thread(r,"pos-api-operation");t.setDaemon(true);return t; }); }
}
