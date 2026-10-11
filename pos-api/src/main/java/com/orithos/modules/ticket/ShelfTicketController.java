package com.orithos.modules.ticket;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/shelf-tickets")
public class ShelfTicketController {

    private final ShelfTicketMapper mapper;

    public ShelfTicketController(ShelfTicketMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<ShelfTicket>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<ShelfTicket> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<ShelfTicket> create(@RequestBody ShelfTicket t) {
        mapper.insert(t);
        return ApiResult.ok(t);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }
}
