package com.orithos.common;

import org.apache.poi.ss.usermodel.Cell;
import org.apache.poi.ss.usermodel.CellStyle;
import org.apache.poi.ss.usermodel.DataFormatter;
import org.apache.poi.ss.usermodel.Font;
import org.apache.poi.ss.usermodel.Row;
import org.apache.poi.ss.usermodel.Sheet;
import org.apache.poi.ss.usermodel.Workbook;
import org.apache.poi.ss.usermodel.WorkbookFactory;
import org.apache.poi.xssf.usermodel.XSSFWorkbook;
import org.springframework.web.multipart.MultipartFile;

import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

/** Read/write Excel (.xlsx/.xls) and detect spreadsheet uploads alongside CSV. */
public final class ExcelUtils {

    private ExcelUtils() {}

    public static List<String[]> parseSpreadsheet(MultipartFile file) throws IOException {
        if (file == null || file.isEmpty()) {
            return List.of();
        }
        byte[] bytes = file.getBytes();
        if (isExcel(file.getOriginalFilename(), bytes)) {
            return parseXlsx(new ByteArrayInputStream(bytes));
        }
        return CsvParser.parse(new String(bytes, StandardCharsets.UTF_8));
    }

    public static boolean isExcel(String filename, byte[] bytes) {
        if (filename != null) {
            String lower = filename.toLowerCase(Locale.ROOT);
            if (lower.endsWith(".xlsx") || lower.endsWith(".xls")) {
                return true;
            }
        }
        return bytes.length >= 2 && bytes[0] == 'P' && bytes[1] == 'K';
    }

    public static byte[] writeXlsx(String sheetName, String[] headers, String[]... sampleRows) throws IOException {
        return writeXlsx(sheetName, headers, null, sampleRows);
    }

    /** @param requiredColumns when non-null, marks required headers with " *" and bold styling */
    public static byte[] writeXlsx(String sheetName, String[] headers, boolean[] requiredColumns,
                                   String[]... sampleRows) throws IOException {
        try (Workbook workbook = new XSSFWorkbook(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            Sheet sheet = workbook.createSheet(sheetName);
            CellStyle requiredHeaderStyle = null;
            if (requiredColumns != null) {
                Font font = workbook.createFont();
                font.setBold(true);
                requiredHeaderStyle = workbook.createCellStyle();
                requiredHeaderStyle.setFont(font);
            }
            Row headerRow = sheet.createRow(0);
            for (int i = 0; i < headers.length; i++) {
                boolean required = requiredColumns != null && i < requiredColumns.length && requiredColumns[i];
                Cell cell = headerRow.createCell(i);
                cell.setCellValue(required ? headers[i] + " *" : headers[i]);
                if (required && requiredHeaderStyle != null) {
                    cell.setCellStyle(requiredHeaderStyle);
                }
            }
            for (int r = 0; r < sampleRows.length; r++) {
                Row row = sheet.createRow(r + 1);
                String[] values = sampleRows[r];
                for (int c = 0; c < values.length && c < headers.length; c++) {
                    row.createCell(c).setCellValue(values[c]);
                }
            }
            for (int i = 0; i < headers.length; i++) {
                sheet.autoSizeColumn(i);
            }
            workbook.write(out);
            return out.toByteArray();
        }
    }

    private static List<String[]> parseXlsx(InputStream in) throws IOException {
        try (Workbook workbook = WorkbookFactory.create(in)) {
            Sheet sheet = workbook.getSheetAt(0);
            DataFormatter formatter = new DataFormatter();
            List<String[]> rows = new ArrayList<>();

            int maxCols = 0;
            for (Row row : sheet) {
                if (row != null) {
                    maxCols = Math.max(maxCols, row.getLastCellNum());
                }
            }
            if (maxCols <= 0) {
                return List.of();
            }

            for (Row row : sheet) {
                if (row == null) {
                    continue;
                }
                String[] cells = new String[maxCols];
                boolean hasData = false;
                for (int i = 0; i < maxCols; i++) {
                    Cell cell = row.getCell(i);
                    String value = cell == null ? "" : formatter.formatCellValue(cell);
                    cells[i] = value;
                    if (!value.isBlank()) {
                        hasData = true;
                    }
                }
                if (hasData || rows.isEmpty()) {
                    rows.add(cells);
                }
            }
            return rows;
        }
    }
}
