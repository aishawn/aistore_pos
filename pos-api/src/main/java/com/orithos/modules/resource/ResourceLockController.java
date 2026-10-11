package com.orithos.modules.resource;

import com.orithos.common.ApiResult;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.web.bind.annotation.*;

import java.time.Duration;

/** lockResource / unlockResource — mirrors the live register "in use" lock, backed by Redis. */
@RestController
@RequestMapping("/api/resources")
public class ResourceLockController {

    private final RedisTemplate<String, Object> redis;

    public ResourceLockController(RedisTemplate<String, Object> redis) {
        this.redis = redis;
    }

    @PostMapping("/{id}/lock")
    public ApiResult<Void> lockResource(@PathVariable Long id) {
        redis.opsForValue().set("lock:resource:" + id, "locked", Duration.ofMinutes(5));
        return ApiResult.ok();
    }

    @PostMapping("/{id}/unlock")
    public ApiResult<Void> unlockResource(@PathVariable Long id) {
        redis.delete("lock:resource:" + id);
        return ApiResult.ok();
    }
}
