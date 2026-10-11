package com.orithos.modules.ticket;

import com.orithos.common.ApiResult;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api/ticket-template-pages")
public class TicketTemplatePageController {

    private final TicketTemplatePageMapper mapper;

    public TicketTemplatePageController(TicketTemplatePageMapper mapper) {
        this.mapper = mapper;
    }

    @GetMapping
    public ApiResult<List<TicketTemplatePage>> list(@RequestParam(required = false) Long ticketTemplateId) {
        return ApiResult.ok(mapper.findAll(ticketTemplateId));
    }

    @GetMapping("/{id}")
    public ApiResult<TicketTemplatePage> get(@PathVariable Long id) {
        return ApiResult.ok(mapper.findById(id));
    }

    @PostMapping
    public ApiResult<TicketTemplatePage> create(@RequestBody TicketTemplatePage p) {
        mapper.insert(p);
        return ApiResult.ok(p);
    }

    @PutMapping("/{id}")
    public ApiResult<TicketTemplatePage> update(@PathVariable Long id, @RequestBody TicketTemplatePage p) {
        p.setId(id);
        mapper.update(p);
        return ApiResult.ok(p);
    }

    @DeleteMapping("/{id}")
    public ApiResult<Void> delete(@PathVariable Long id) {
        mapper.delete(id);
        return ApiResult.ok();
    }
}
