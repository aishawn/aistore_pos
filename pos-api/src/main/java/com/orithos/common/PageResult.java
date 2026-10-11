package com.orithos.common;

import java.util.List;

/** Simple offset pagination payload. */
public record PageResult<T>(List<T> items, long total, int page, int size) {
    public static <T> PageResult<T> of(List<T> items, long total, int page, int size) {
        return new PageResult<>(items, total, page, size);
    }
}
