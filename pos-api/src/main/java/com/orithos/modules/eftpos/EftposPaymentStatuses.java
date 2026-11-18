package com.orithos.modules.eftpos;

public final class EftposPaymentStatuses {
    public static final String PENDING = "PENDING";
    public static final String APPROVED = "APPROVED";
    public static final String DECLINED = "DECLINED";
    public static final String CANCELLED = "CANCELLED";
    public static final String UNKNOWN = "UNKNOWN";
    public static final String APPROVED_PENDING_SETTLEMENT = "APPROVED_PENDING_SETTLEMENT";

    private EftposPaymentStatuses() {
    }
}