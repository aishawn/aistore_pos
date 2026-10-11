package com.orithos.modules.giftcard;

import java.util.List;

public record GiftCardImportResult(int imported, int skipped, List<GiftCardImportError> errors) {}
