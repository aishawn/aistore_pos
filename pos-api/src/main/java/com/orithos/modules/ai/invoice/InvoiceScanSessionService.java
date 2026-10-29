package com.orithos.modules.ai.invoice;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.orithos.common.BusinessException;
import com.orithos.security.AuthUser;
import com.orithos.security.CurrentUser;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.util.StringUtils;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Set;

@Service
public class InvoiceScanSessionService {

    private static final Set<String> EDITABLE = Set.of("draft", "matched", "failed");
    private static final Set<String> SOURCE_TYPES = Set.of("upload", "camera", "pdf", "api");
    private static final Set<String> MATCH_STATUSES = Set.of("unmatched", "suggested", "confirmed", "skipped");
    private static final Set<String> LINK_STATUSES = Set.of("matched", "po_created", "received", "failed");

    private final InvoiceScanSessionMapper mapper;
    private final ObjectMapper objectMapper;

    public InvoiceScanSessionService(InvoiceScanSessionMapper mapper, ObjectMapper objectMapper) {
        this.mapper = mapper;
        this.objectMapper = objectMapper;
    }

    public InvoiceScanSessionDtos.ListResponse list(String status, String query, int limit, int offset) {
        AuthUser user = requireAdmin();
        int safeLimit = Math.min(Math.max(limit, 1), 100);
        int safeOffset = Math.max(offset, 0);
        String statusFilter = blankToNull(status);
        String queryFilter = blankToNull(query);
        List<InvoiceScanSessionEntity> rows = mapper.list(user.vendorId(), statusFilter, queryFilter, safeLimit, safeOffset);
        InvoiceScanSessionDtos.ListResponse response = new InvoiceScanSessionDtos.ListResponse();
        response.setLimit(safeLimit);
        response.setOffset(safeOffset);
        response.setTotal(mapper.count(user.vendorId(), statusFilter, queryFilter));
        for (InvoiceScanSessionEntity row : rows) {
            response.getItems().add(toSummary(row));
        }
        return response;
    }

    public InvoiceScanSessionDtos.SessionView get(long id) {
        AuthUser user = requireAdmin();
        InvoiceScanSessionEntity session = requireOwned(id, user.vendorId());
        return toDetail(session);
    }

    @Transactional
    public InvoiceScanSessionDtos.SessionView create(InvoiceScanSessionDtos.SaveRequest request) {
        AuthUser user = requireAdmin();
        if (request == null) {
            throw new BusinessException(40010, "Invoice scan payload is required.");
        }
        if (!request.isReviewConfirmed()) {
            throw new BusinessException(40010, "Review the extracted invoice details and confirm before saving.");
        }
        InvoiceScanSessionEntity session = new InvoiceScanSessionEntity();
        session.setVendorId(user.vendorId());
        session.setCreatedBy(user.id());
        session.setStatus("draft");
        session.setSourceType(normalizeSource(request.getSourceType()));
        applyHeader(session, request.getSupplierName(), request.getSupplierAbn(), request.getInvoiceNumber(),
                request.getInvoiceDate(), request.getDueDate(), request.getTotalPayable(), request.getGstIncluded(),
                request.getOdooSupplierId(), request.getOdooOutletId(), request.getNotes(), request.getInternalNotes());
        session.setSourceFilename(trimToNull(request.getSourceFilename()));
        session.setSourceContentType(trimToNull(request.getSourceContentType()));
        try {
            session.setOcrJson(objectMapper.writeValueAsString(request));
        } catch (Exception e) {
            session.setOcrJson(null);
        }
        rememberSupplier(user.vendorId(), session);
        mapper.insert(session);
        replaceLines(session.getId(), request.getLines());
        refreshMatchStatus(session);
        mapper.update(session);
        return toDetail(requireOwned(session.getId(), user.vendorId()));
    }

    @Transactional
    public InvoiceScanSessionDtos.SessionView patch(long id, InvoiceScanSessionDtos.PatchRequest request) {
        AuthUser user = requireAdmin();
        InvoiceScanSessionEntity session = requireOwned(id, user.vendorId());
        if (!EDITABLE.contains(session.getStatus())) {
            throw new BusinessException(40020, "This invoice scan can no longer be edited.");
        }
        if (request == null) {
            throw new BusinessException(40010, "Invoice scan patch is required.");
        }
        applyHeader(session, request.getSupplierName(), request.getSupplierAbn(), request.getInvoiceNumber(),
                request.getInvoiceDate(), request.getDueDate(), request.getTotalPayable(), request.getGstIncluded(),
                request.getOdooSupplierId(), request.getOdooOutletId(), request.getNotes(), request.getInternalNotes());
        if (request.getLines() != null) {
            replaceLines(session.getId(), request.getLines());
        }
        rememberSupplier(user.vendorId(), session);
        refreshMatchStatus(session);
        mapper.update(session);
        return toDetail(requireOwned(id, user.vendorId()));
    }

    @Transactional
    public InvoiceScanSessionDtos.SessionView linkPurchase(long id, InvoiceScanSessionDtos.LinkPurchaseRequest request) {
        AuthUser user = requireAdmin();
        InvoiceScanSessionEntity session = requireOwned(id, user.vendorId());
        if (request == null) {
            throw new BusinessException(40010, "Purchase link payload is required.");
        }
        String status = blankToNull(request.getStatus());
        if (status == null || !LINK_STATUSES.contains(status)) {
            status = request.getOdooPickingId() != null ? "received" : "po_created";
        }
        if (!"failed".equals(status) && (request.getOdooPoId() == null || request.getOdooPoId() < 1)) {
            throw new BusinessException(40010, "Odoo purchase order id is required.");
        }
        if (request.getOdooPoId() != null && request.getOdooPoId() > 0) {
            session.setOdooPoId(request.getOdooPoId());
            session.setOdooPoName(trimToNull(request.getOdooPoName()));
        }
        session.setOdooPickingId(request.getOdooPickingId());
        session.setOdooPickingName(trimToNull(request.getOdooPickingName()));
        session.setStatus(status);
        if (!"failed".equals(status)) {
            session.setConfirmedBy(user.id());
            session.setConfirmedAt(Instant.now());
        }
        mapper.update(session);
        return toDetail(requireOwned(id, user.vendorId()));
    }

    @Transactional
    public void discard(long id) {
        AuthUser user = requireAdmin();
        InvoiceScanSessionEntity session = requireOwned(id, user.vendorId());
        if (!EDITABLE.contains(session.getStatus())) {
            throw new BusinessException(40020, "Only draft invoice scans can be discarded.");
        }
        mapper.softDelete(id, user.vendorId());
    }

    public Long suggestedSupplierId(String supplierAbn) {
        AuthUser user = requireAdmin();
        String abn = normalizeAbn(supplierAbn);
        if (abn == null) return null;
        return mapper.findMappedSupplier(user.vendorId(), abn);
    }

    private void replaceLines(long sessionId, List<InvoiceScanSessionDtos.LineInput> lines) {
        mapper.deleteLines(sessionId);
        if (lines == null || lines.isEmpty()) return;
        int index = 0;
        for (InvoiceScanSessionDtos.LineInput input : lines) {
            if (input == null) continue;
            InvoiceScanLineEntity line = new InvoiceScanLineEntity();
            line.setSessionId(sessionId);
            line.setLineIndex(index++);
            line.setDescription(trimToNull(input.getDescription()));
            line.setBrand(trimToNull(input.getBrand()));
            line.setPackQty(input.getPackQty());
            line.setQtyCases(input.getQtyCases());
            line.setUnitPrice(input.getUnitPrice());
            line.setLineTotal(input.getLineTotal());
            line.setOdooProductId(input.getOdooProductId());
            line.setOdooProductName(trimToNull(input.getOdooProductName()));
            line.setMatchStatus(normalizeMatch(input.getMatchStatus(), input.getOdooProductId()));
            line.setConfidence(input.getConfidence());
            mapper.insertLine(line);
        }
    }

    private void refreshMatchStatus(InvoiceScanSessionEntity session) {
        List<InvoiceScanLineEntity> lines = mapper.listLines(session.getId());
        boolean hasOpen = false;
        boolean hasConfirmed = session.getOdooSupplierId() != null;
        for (InvoiceScanLineEntity line : lines) {
            String match = line.getMatchStatus() == null ? "unmatched" : line.getMatchStatus();
            if ("unmatched".equals(match) || "suggested".equals(match)) {
                hasOpen = true;
            }
            if ("confirmed".equals(match) || "skipped".equals(match)) {
                hasConfirmed = true;
            }
        }
        if (session.getOdooSupplierId() != null && !hasOpen && !lines.isEmpty()) {
            session.setStatus("matched");
        } else if (hasConfirmed || session.getOdooSupplierId() != null) {
            session.setStatus("draft");
        } else {
            session.setStatus("draft");
        }
    }

    private void rememberSupplier(long vendorId, InvoiceScanSessionEntity session) {
        String abn = normalizeAbn(session.getSupplierAbn());
        if (abn == null || session.getOdooSupplierId() == null) return;
        mapper.upsertAbnMap(vendorId, abn, session.getOdooSupplierId(), session.getSupplierName());
    }

    private InvoiceScanSessionDtos.SessionView toSummary(InvoiceScanSessionEntity session) {
        InvoiceScanSessionDtos.SessionView view = new InvoiceScanSessionDtos.SessionView();
        copyHeader(view, session);
        return view;
    }

    private InvoiceScanSessionDtos.SessionView toDetail(InvoiceScanSessionEntity session) {
        InvoiceScanSessionDtos.SessionView view = toSummary(session);
        if (StringUtils.hasText(session.getInvoiceNumber())) {
            List<Long> duplicates = new ArrayList<>(mapper.findDuplicateIds(
                    session.getVendorId(),
                    session.getInvoiceNumber(),
                    session.getOdooSupplierId(),
                    normalizeAbn(session.getSupplierAbn())));
            duplicates.removeIf(id -> id.equals(session.getId()));
            view.setDuplicateIds(duplicates);
        }
        List<InvoiceScanSessionDtos.LineView> lines = new ArrayList<>();
        for (InvoiceScanLineEntity line : mapper.listLines(session.getId())) {
            InvoiceScanSessionDtos.LineView row = new InvoiceScanSessionDtos.LineView();
            row.setId(line.getId());
            row.setLineIndex(line.getLineIndex());
            row.setDescription(line.getDescription());
            row.setBrand(line.getBrand());
            row.setPackQty(line.getPackQty());
            row.setQtyCases(line.getQtyCases());
            row.setUnitPrice(line.getUnitPrice());
            row.setLineTotal(line.getLineTotal());
            row.setOdooProductId(line.getOdooProductId());
            row.setOdooProductName(line.getOdooProductName());
            row.setMatchStatus(line.getMatchStatus());
            row.setConfidence(line.getConfidence());
            lines.add(row);
        }
        view.setLines(lines);
        return view;
    }

    private static void copyHeader(InvoiceScanSessionDtos.SessionView view, InvoiceScanSessionEntity session) {
        view.setId(session.getId());
        view.setStatus(session.getStatus());
        view.setSourceType(session.getSourceType());
        view.setSupplierName(session.getSupplierName());
        view.setSupplierAbn(session.getSupplierAbn());
        view.setInvoiceNumber(session.getInvoiceNumber());
        view.setInvoiceDate(session.getInvoiceDate());
        view.setDueDate(session.getDueDate());
        view.setTotalPayable(session.getTotalPayable());
        view.setGstIncluded(session.getGstIncluded());
        view.setOdooSupplierId(session.getOdooSupplierId());
        view.setOdooOutletId(session.getOdooOutletId());
        view.setOdooPoId(session.getOdooPoId());
        view.setOdooPoName(session.getOdooPoName());
        view.setOdooPickingId(session.getOdooPickingId());
        view.setOdooPickingName(session.getOdooPickingName());
        view.setSourceFilename(session.getSourceFilename());
        view.setSourceContentType(session.getSourceContentType());
        view.setNotes(session.getNotes());
        view.setInternalNotes(session.getInternalNotes());
        view.setCreatedAt(session.getCreatedAt());
        view.setUpdatedAt(session.getUpdatedAt());
        view.setConfirmedAt(session.getConfirmedAt());
    }

    private static void applyHeader(InvoiceScanSessionEntity session,
                                    String supplierName,
                                    String supplierAbn,
                                    String invoiceNumber,
                                    java.time.LocalDate invoiceDate,
                                    java.time.LocalDate dueDate,
                                    java.math.BigDecimal totalPayable,
                                    java.math.BigDecimal gstIncluded,
                                    Long odooSupplierId,
                                    Long odooOutletId,
                                    String notes,
                                    String internalNotes) {
        session.setSupplierName(trimToNull(supplierName));
        session.setSupplierAbn(normalizeAbn(supplierAbn));
        session.setInvoiceNumber(trimToNull(invoiceNumber));
        session.setInvoiceDate(invoiceDate);
        session.setDueDate(dueDate);
        session.setTotalPayable(totalPayable);
        session.setGstIncluded(gstIncluded);
        session.setOdooSupplierId(odooSupplierId);
        session.setOdooOutletId(odooOutletId);
        session.setNotes(trimToNull(notes));
        session.setInternalNotes(trimToNull(internalNotes));
    }

    private InvoiceScanSessionEntity requireOwned(long id, long vendorId) {
        InvoiceScanSessionEntity session = mapper.findOwned(id, vendorId);
        if (session == null) {
            throw new BusinessException(40410, "Invoice scan not found.");
        }
        return session;
    }

    private static AuthUser requireAdmin() {
        com.orithos.security.AdminAccess.requireAdmin();
        AuthUser user = CurrentUser.get();
        if (user == null || user.vendorId() == null) {
            throw new BusinessException(40101, "Sign in again to manage invoice scans.");
        }
        return user;
    }

    private static String normalizeSource(String sourceType) {
        String value = blankToNull(sourceType);
        if (value == null) return "upload";
        value = value.toLowerCase(Locale.ROOT);
        if (!SOURCE_TYPES.contains(value)) {
            throw new BusinessException(40010, "Unsupported invoice source type.");
        }
        return value;
    }

    private static String normalizeMatch(String matchStatus, Long productId) {
        String value = blankToNull(matchStatus);
        if (value == null) {
            return productId != null ? "confirmed" : "unmatched";
        }
        value = value.toLowerCase(Locale.ROOT);
        if (!MATCH_STATUSES.contains(value)) {
            return productId != null ? "confirmed" : "unmatched";
        }
        return value;
    }

    private static String normalizeAbn(String abn) {
        String value = trimToNull(abn);
        if (value == null) return null;
        return value.replaceAll("\\s+", "");
    }

    private static String blankToNull(String value) {
        return StringUtils.hasText(value) ? value.trim() : null;
    }

    private static String trimToNull(String value) {
        return blankToNull(value);
    }
}
