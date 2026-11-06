package com.orithos.modules.ai;

import com.orithos.common.BusinessException;
import org.junit.jupiter.api.Test;
import org.springframework.mock.web.MockMultipartFile;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

class AiTranscriptionServiceTest {

    private final AiTranscriptionService service = new AiTranscriptionService(
            new AiProperties(true, null, null, null, null, 0.1, 1024, 40, 6, 120),
            null, null);

    @Test
    void rejectsEmptyAudioBeforeCallingProvider() {
        MockMultipartFile file = new MockMultipartFile("file", "empty.webm", "audio/webm", new byte[0]);

        BusinessException error = assertThrows(BusinessException.class, () -> service.transcribe(file, null));

        assertEquals(40010, error.getCode());
    }

    @Test
    void rejectsAudioOverFiveMegabytesBeforeCallingProvider() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "large.webm", "audio/webm", new byte[(int) AiTranscriptionService.MAX_BYTES + 1]);

        BusinessException error = assertThrows(BusinessException.class, () -> service.transcribe(file, null));

        assertEquals(40011, error.getCode());
    }

    @Test
    void rejectsNonAudioMimeTypesBeforeCallingProvider() {
        MockMultipartFile file = new MockMultipartFile(
                "file", "image.jpg", "image/jpeg", new byte[] {1, 2, 3});

        BusinessException error = assertThrows(BusinessException.class, () -> service.transcribe(file, null));

        assertEquals(40013, error.getCode());
    }

    @Test
    void normalizesRecorderMimeParametersAndKeepsKnownAudioTypes() {
        assertEquals("audio/webm", AiTranscriptionService.resolveMime("Audio/WebM;codecs=opus"));
        assertEquals("audio/mp4", AiTranscriptionService.resolveMime("audio/mp4"));
        assertEquals("audio/ogg", AiTranscriptionService.resolveMime("audio/ogg"));
        assertEquals("audio/webm", AiTranscriptionService.resolveMime(null));
    }

}
