package com.orithos.common;

import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.validation.FieldError;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

import com.orithos.modules.customer.CustomerGroupService;
import com.orithos.modules.customer.CustomerService;
import com.orithos.modules.product.ProductService;

import java.util.ArrayList;
import java.util.List;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final String DUPLICATE_PRODUCT_NAME_MESSAGE = "A product with this name already exists.";
    private static final String DUPLICATE_BARCODE_MESSAGE = "This barcode is already assigned to another product.";
    private static final String DUPLICATE_CUSTOMER_CODE_MESSAGE = "A customer with this code already exists.";
    private static final String DUPLICATE_CUSTOMER_EMAIL_MESSAGE = "A customer with this email already exists.";
    private static final String DUPLICATE_CUSTOMER_GROUP_NAME_MESSAGE =
            "Customer group name is already in use. Please choose another name.";
    private static final String INVALID_CASE_QUANTITY_MESSAGE = "Case quantity must be greater than zero.";
    private static final String INVALID_PRICE_QUANTITY_MESSAGE = "Price quantity must be greater than zero.";

    @ExceptionHandler(BusinessException.class)
    public ResponseEntity<ApiResult<Void>> business(BusinessException e) {
        return ResponseEntity.ok(ApiResult.fail(e.getCode(), e.getMessage()));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<ApiResult<Void>> dataIntegrity(DataIntegrityViolationException e) {
        if (SqlConstraintUtils.isDuplicateProductName(e)) {
            return duplicateProductNameResponse();
        }
        if (SqlConstraintUtils.isDuplicateBarcode(e)) {
            return duplicateBarcodeResponse();
        }
        if (SqlConstraintUtils.isDuplicateCustomerCode(e)) {
            return duplicateCustomerCodeResponse();
        }
        if (SqlConstraintUtils.isDuplicateCustomerEmail(e)) {
            return duplicateCustomerEmailResponse();
        }
        if (SqlConstraintUtils.isDuplicateCustomerGroupName(e)) {
            return duplicateCustomerGroupNameResponse();
        }
        if (SqlConstraintUtils.isInvalidCaseQuantity(e)) {
            return invalidCaseQuantityResponse();
        }
        if (SqlConstraintUtils.isInvalidPriceQuantity(e)) {
            return invalidPriceQuantityResponse();
        }
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(ApiResult.fail(40900, "Data constraint violation."));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<ApiResult<Void>> unreadable(HttpMessageNotReadableException e) {
        Throwable cause = e.getMostSpecificCause();
        String detail = cause != null ? cause.getMessage() : e.getMessage();
        String msg = "Invalid request body.";
        if (detail != null && detail.toLowerCase().contains("java.lang.long")) {
            msg = "A product or customer id was not a valid number.";
        } else if (detail != null && !detail.isBlank()) {
            msg = detail;
        }
        return ResponseEntity.badRequest().body(ApiResult.fail(40000, msg));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<ApiResult<Void>> validation(MethodArgumentNotValidException e) {
        List<FieldError> errors = e.getBindingResult().getFieldErrors();
        String msg = formatValidationErrors(errors);
        return ResponseEntity.badRequest().body(ApiResult.fail(40001, msg));
    }

    private static String formatValidationErrors(List<FieldError> errors) {
        List<String> messages = errors.stream()
                .map(GlobalExceptionHandler::formatFieldError)
                .distinct()
                .toList();

        if (messages.size() == 1) {
            return messages.get(0);
        }

        if (messages.stream().allMatch(m -> m.endsWith(" is required"))) {
            List<String> labels = messages.stream()
                    .map(m -> m.substring(0, m.length() - " is required".length()))
                    .toList();
            return joinNaturalList(labels) + " are required";
        }

        return String.join("; ", messages);
    }

    private static String formatFieldError(FieldError error) {
        String message = error.getDefaultMessage();
        if (message != null && !message.isBlank() && Character.isUpperCase(message.charAt(0))) {
            return message;
        }
        return friendlyLabel(error.getField()) + " " + (message != null ? message : "is required");
    }

    private static String friendlyLabel(String field) {
        return switch (field) {
            case "username" -> "Username";
            case "password" -> "Password";
            case "question" -> "Question";
            case "threadId" -> "Thread ID";
            default -> field.substring(0, 1).toUpperCase() + field.substring(1);
        };
    }

    private static String joinNaturalList(List<String> items) {
        if (items.isEmpty()) {
            return "";
        }
        if (items.size() == 1) {
            return items.get(0);
        }
        if (items.size() == 2) {
            return items.get(0) + " and " + items.get(1);
        }
        List<String> copy = new ArrayList<>(items);
        String last = copy.remove(copy.size() - 1);
        return String.join(", ", copy) + " and " + last;
    }

    @ExceptionHandler(AccessDeniedException.class)
    public ResponseEntity<ApiResult<Void>> denied(AccessDeniedException e) {
        return ResponseEntity.status(HttpStatus.FORBIDDEN)
                .body(ApiResult.fail(40300, "Access denied"));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<ApiResult<Void>> generic(Exception e) {
        if (SqlConstraintUtils.isDuplicateProductName(e)) {
            return duplicateProductNameResponse();
        }
        if (SqlConstraintUtils.isDuplicateBarcode(e)) {
            return duplicateBarcodeResponse();
        }
        if (SqlConstraintUtils.isDuplicateCustomerCode(e)) {
            return duplicateCustomerCodeResponse();
        }
        if (SqlConstraintUtils.isDuplicateCustomerEmail(e)) {
            return duplicateCustomerEmailResponse();
        }
        if (SqlConstraintUtils.isDuplicateCustomerGroupName(e)) {
            return duplicateCustomerGroupNameResponse();
        }
        if (SqlConstraintUtils.isInvalidCaseQuantity(e)) {
            return invalidCaseQuantityResponse();
        }
        if (SqlConstraintUtils.isInvalidPriceQuantity(e)) {
            return invalidPriceQuantityResponse();
        }
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(ApiResult.fail(50000, e.getMessage()));
    }

    private static ResponseEntity<ApiResult<Void>> duplicateProductNameResponse() {
        return ResponseEntity.ok(ApiResult.fail(
                ProductService.DUPLICATE_NAME_CODE,
                DUPLICATE_PRODUCT_NAME_MESSAGE));
    }

    private static ResponseEntity<ApiResult<Void>> duplicateBarcodeResponse() {
        return ResponseEntity.ok(ApiResult.fail(
                ProductService.DUPLICATE_BARCODE_CODE,
                DUPLICATE_BARCODE_MESSAGE));
    }

    private static ResponseEntity<ApiResult<Void>> duplicateCustomerCodeResponse() {
        return ResponseEntity.ok(ApiResult.fail(
                CustomerService.DUPLICATE_CODE,
                DUPLICATE_CUSTOMER_CODE_MESSAGE));
    }

    private static ResponseEntity<ApiResult<Void>> duplicateCustomerEmailResponse() {
        return ResponseEntity.ok(ApiResult.fail(
                CustomerService.DUPLICATE_EMAIL,
                DUPLICATE_CUSTOMER_EMAIL_MESSAGE));
    }

    private static ResponseEntity<ApiResult<Void>> duplicateCustomerGroupNameResponse() {
        return ResponseEntity.ok(ApiResult.fail(
                CustomerGroupService.DUPLICATE_NAME_CODE,
                DUPLICATE_CUSTOMER_GROUP_NAME_MESSAGE));
    }

    private static ResponseEntity<ApiResult<Void>> invalidCaseQuantityResponse() {
        return ResponseEntity.badRequest().body(ApiResult.fail(40002, INVALID_CASE_QUANTITY_MESSAGE));
    }

    private static ResponseEntity<ApiResult<Void>> invalidPriceQuantityResponse() {
        return ResponseEntity.badRequest().body(ApiResult.fail(40003, INVALID_PRICE_QUANTITY_MESSAGE));
    }
}
