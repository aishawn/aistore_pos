package com.orithos.common;

import java.util.UUID;
import java.util.concurrent.atomic.AtomicLong;

/** Generates monotonically increasing numbers for non-PK identifiers (e.g. invoice numbers). */
public final class Ids {
    private static final AtomicLong SEQ = new AtomicLong(System.currentTimeMillis());

    private Ids() {}

    public static Long next() {
        return SEQ.incrementAndGet();
    }

    /** Random 32-char hex for non-PK secrets (e.g. webhook signature keys). */
    public static String randomHex() {
        return UUID.randomUUID().toString().replace("-", "");
    }
}
