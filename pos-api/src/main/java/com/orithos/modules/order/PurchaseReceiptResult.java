package com.orithos.modules.order;

import java.time.LocalDateTime;

public record PurchaseReceiptResult(Long receiptId, Long orderId, String status,
                                    LocalDateTime receivedAt, boolean replayed) {}
