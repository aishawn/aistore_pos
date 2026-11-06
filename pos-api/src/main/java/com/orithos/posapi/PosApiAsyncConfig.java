package com.orithos.posapi;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import java.util.concurrent.Executor;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

@Configuration
@EnableScheduling
public class PosApiAsyncConfig {
    static final int WORKER_COUNT = 4;
    static final int QUEUE_CAPACITY = 100;

    @Bean("posApiExecutor")
    public Executor posApiExecutor() {
        return new ThreadPoolExecutor(WORKER_COUNT, WORKER_COUNT, 0L, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(QUEUE_CAPACITY), r -> {
                    Thread thread = new Thread(r, "pos-api-operation");
                    thread.setDaemon(true);
                    return thread;
                }, new ThreadPoolExecutor.AbortPolicy());
    }
}
