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

    @Test
    void providerConfigurationDetailsAreNotShownToStaff() {
        String message = WineLabelVisionService.visionFailureMessage(
                "Label recognition failed", "qwen-vl-plus", "InvalidParameter");
        assertEquals("Label recognition failed: AI provider configuration is invalid. Check the AI configuration and try again.", message);
    }

    @Test
    void arbitraryProviderDetailsAreReplacedWithSafeRetryGuidance() {
        String message = WineLabelVisionService.visionFailureMessage(
                "Label recognition failed", "qwen-vl-plus", "unknown_error");

        assertEquals("Label recognition failed: The AI provider could not process this image. Try again or contact your administrator.", message);
    }

    @Test
    void providerErrorParserReadsOnlyStructuredErrorCode() throws Exception {
        String payload = "{\"error\":{\"code\":\"model_not_found\",\"message\":\"private invoice data\",\"request_id\":\"private-id\"}}";

        assertEquals("model_not_found", WineLabelVisionService.providerErrorCode(mapper.readTree(payload)));
    }

    @Test
    void missingVisionModelKeepsActionableConfigurationGuidance() {
        String message = WineLabelVisionService.visionFailureMessage(
                "Label recognition failed", "qwen-vl-plus", "model_not_found");

        assertTrue(message.contains("remote AI service"));
    }

    @Test
    void promptKeepsWineNameSeparateFromGrapeVarietal() {
        String prompt = WineLabelVisionService.PROMPT.toLowerCase().replaceAll("\\s+", " ");

        assertTrue(prompt.contains("if the label says \"vino rosso\", set name to \"vino rosso\""));
        assertTrue(prompt.contains("varietal field is only a grape variety"));
        assertTrue(prompt.contains("rosso, bianco, blanco, red, white, or rose are not grape varieties"));
    }
}
