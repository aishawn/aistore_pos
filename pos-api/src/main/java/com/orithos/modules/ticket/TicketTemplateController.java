package com.orithos.modules.ticket;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ticket-templates")
public class TicketTemplateController {

    private final TicketTemplateMapper mapper;

    public TicketTemplateController(TicketTemplateMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<TicketTemplate>> list() {
        return ApiResult.ok(mapper.findAll());
    }

    @GetMapping("/{id}")
    public ApiResult<TicketTemplate> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<TicketTemplate> create(@RequestBody TicketTemplate t) {
        mapper.insert(t);
        return ApiResult.ok(t);
    }

    @PutMapping("/{id}")
    public ApiResult<TicketTemplate> update(@PathVariable Long id, @RequestBody TicketTemplate t) {
        t.setId(id);
        mapper.update(t);
        return ApiResult.ok(t);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }

    @PostMapping("/{id}/clone")
    public ApiResult<TicketTemplate> clone(@PathVariable Long id) {
        TicketTemplate source = mapper.findById(id);
        if (source == null) {
            return ApiResult.ok(null);
        }
        source.setName(source.getName() + " (copy)");
        mapper.insert(source);
        return ApiResult.ok(source);
    }
}
