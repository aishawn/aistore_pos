package com.orithos.modules.ai;

import com.orithos.common.BusinessException;
import ch.qos.logback.classic.Logger;
import ch.qos.logback.classic.spi.ILoggingEvent;
import ch.qos.logback.core.read.ListAppender;
import org.junit.jupiter.api.Test;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.web.client.MockRestServiceServer;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;

class AiTranscriptionServiceTest {

    private final AiTranscriptionService service = new AiTranscriptionService(
            new AiProperties(true, null, null, null), "test-key", "https://dashscope.aliyuncs.com");

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

    @Test
    void providerErrorDetailsAreNotReturnedOrLogged() {
        String providerDetail = "private-provider-diagnostic";
        org.springframework.web.client.RestClient.Builder builder =
                org.springframework.web.client.RestClient.builder();
        MockRestServiceServer mockServer = MockRestServiceServer.bindTo(builder).build();
        mockServer.expect(requestTo("https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"))
                .andExpect(method(HttpMethod.POST))
                .andRespond(withStatus(HttpStatus.INTERNAL_SERVER_ERROR)
                        .contentType(MediaType.APPLICATION_JSON)
                        .body("{\"error\":\"" + providerDetail + "\"}"));
        AiTranscriptionService testService = new AiTranscriptionService(
                new AiProperties(true, null, null, null), "test-key", "https://dashscope.aliyuncs.com", builder);
        MockMultipartFile file = new MockMultipartFile("file", "voice.webm", "audio/webm", new byte[] {1, 2, 3});

        Logger logger = (Logger) LoggerFactory.getLogger(AiTranscriptionService.class);
        ListAppender<ILoggingEvent> appender = new ListAppender<>();
        appender.start();
        logger.addAppender(appender);
        try {
            BusinessException error = assertThrows(BusinessException.class,
                    () -> testService.transcribe(file, null));

            assertEquals(50211, error.getCode());
            assertFalse(error.getMessage().contains(providerDetail));
            mockServer.verify();
        } finally {
            logger.detachAppender(appender);
            appender.stop();
        }

        assertFalse(appender.list.stream()
                .map(ILoggingEvent::getFormattedMessage)
                .anyMatch(message -> message.contains(providerDetail)));
    }
}
