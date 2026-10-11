package com.orithos.modules.cappedpricing;

import com.orithos.common.PageResult;
import com.orithos.modules.cappedpricing.mapper.CappedPriceMapper;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.List;

@Service
public class CappedPriceService {

    private final CappedPriceMapper mapper;

    public CappedPriceService(CappedPriceMapper mapper) {
        this.mapper = mapper;
    }

    public List<CappedPriceRow> list(CappedPriceQuery q) {
        return mapper.list(q);
    }

    public PageResult<CappedPriceRow> page(CappedPriceQuery q) {
        var items = mapper.list(q);
        return PageResult.of(items, mapper.count(q), q.getPage(), q.getSize());
    }

    public void updateCurrentPrice(Long priceId, BigDecimal price) {
        if (priceId == null || price == null) {
            throw new IllegalArgumentException("priceId and price are required");
        }
        mapper.updateCurrentPrice(priceId, price);
    }

    public record CurrentPriceUpdate(Long priceId, BigDecimal price) {}
}
