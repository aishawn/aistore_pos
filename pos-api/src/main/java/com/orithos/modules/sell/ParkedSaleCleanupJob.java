package com.orithos.modules.sell;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Voids parked sales that outlived the keep window, even if the register is idle. */
@Component
public class ParkedSaleCleanupJob {

    private static final Logger log = LoggerFactory.getLogger(ParkedSaleCleanupJob.class);

    private final SellService sellService;

    public ParkedSaleCleanupJob(SellService sellService) {
        this.sellService = sellService;
    }

    @Scheduled(fixedDelay = 15 * 60 * 1000, initialDelay = 20_000)
    public void expireOverdueParkedSales() {
        int expired = sellService.expireOverdueParkedSales();
        if (expired > 0) {
            log.info("Auto-voided {} parked sale(s) older than the keep window", expired);
        }
    }
}
