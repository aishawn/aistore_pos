package com.orithos.common;

/** Thrown for expected business failures; mapped to a clean ApiResult by the handler. */
public class BusinessException extends RuntimeException {
    private final int code;

    public BusinessException(String message) {
        this(40000, message);
    }

    public BusinessException(int code, String message) {
        super(message);
        this.code = code;
    }

    public int getCode() {
        return code;
    }
}
