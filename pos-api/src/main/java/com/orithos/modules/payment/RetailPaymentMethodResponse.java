package com.orithos.modules.payment;

import java.util.List;

public record RetailPaymentMethodResponse(boolean nativePosEnabled, List<RegisterPaymentMethodView> assignments) {}
