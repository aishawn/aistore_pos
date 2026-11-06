package com.orithos.posapi;

import org.junit.jupiter.api.Test;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executor;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class PosApiAsyncConfigTest {
    @Test
    void rejectsWorkAfterTheBoundedQueueIsFull() throws Exception {
        Executor configured = new PosApiAsyncConfig().posApiExecutor();
        ThreadPoolExecutor executor = (ThreadPoolExecutor) configured;
        CountDownLatch releaseWorkers = new CountDownLatch(1);
        try {
            for (int i = 0; i < PosApiAsyncConfig.WORKER_COUNT; i++) {
                executor.execute(() -> {
                    try {
                        releaseWorkers.await();
                    } catch (InterruptedException e) {
                        Thread.currentThread().interrupt();
                    }
                });
            }
            for (int i = 0; i < PosApiAsyncConfig.QUEUE_CAPACITY; i++) {
                executor.execute(() -> { });
            }

            assertEquals(PosApiAsyncConfig.QUEUE_CAPACITY, executor.getQueue().size());
            assertThrows(RejectedExecutionException.class, () -> executor.execute(() -> { }));
        } finally {
            releaseWorkers.countDown();
            executor.shutdownNow();
        }
    }
}
