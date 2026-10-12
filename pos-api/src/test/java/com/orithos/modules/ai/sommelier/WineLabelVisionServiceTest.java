package com.orithos.modules.ai.sommelier;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

class WineLabelVisionServiceTest {

    private final ObjectMapper mapper = new ObjectMapper();

    @Test
    void parseExtractsFieldsAndBarcodeDigits() {
        WineLabelRead read = WineLabelVisionService.parse("""
                ```json
                {
                  "brand": "Penfolds",
                  "name": "Bin 28 Kalimna Shiraz",
                  "vintage": "2021",
                  "varietal": "Shiraz",
                  "barcode": "EAN 9311234567890",
                  "queries": ["Penfolds Bin 28", "Penfolds Shiraz"]
                }
                ```
                """, mapper);
        assertNotNull(read);
        assertEquals("Penfolds", read.brand());
        assertEquals("Bin 28 Kalimna Shiraz", read.name());
        assertEquals("2021", read.vintage());
        assertEquals("Shiraz", read.varietal());
        assertEquals("9311234567890", read.barcode());
        assertTrue(read.searchQueries().contains("Penfolds Bin 28"));
        assertTrue(read.displayName().contains("Penfolds"));
        assertTrue(read.displayName().contains("2021"));
    }

    @Test
    void extractTextReadsOpenAiContent() throws Exception {
        String json = """
                {"choices":[{"message":{"content":"{\\"name\\":\\"House Shiraz\\"}"}}]}
                """;
        String text = WineLabelVisionService.extractText(mapper.readTree(json));
        assertEquals("{\"name\":\"House Shiraz\"}", text);
        WineLabelRead read = WineLabelVisionService.parse(text, mapper);
        assertNotNull(read);
        assertEquals("House Shiraz", read.name());
    }
}
