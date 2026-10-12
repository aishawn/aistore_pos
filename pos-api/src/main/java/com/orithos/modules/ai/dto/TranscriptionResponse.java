package com.orithos.modules.ai.dto;

/** Result of speech-to-text transcription. */
public record TranscriptionResponse(String text, String lang) {}
