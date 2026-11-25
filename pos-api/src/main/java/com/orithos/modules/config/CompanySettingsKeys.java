package com.orithos.modules.config;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Shopfront-aligned company setting keys stored in {@code settings} (vendor scope).
 * Values are Orithos-authoritative after first save / import promote.
 */
public final class CompanySettingsKeys {

    private CompanySettingsKeys() {
    }

    public static final String ROUND_TO = "company.currency.round_to";
    public static final String CURRENCY_CODE = "company.currency.code";
    public static final String NUMBER_LOCALE = "company.currency.number_locale";
    public static final String TIMEZONE = "company.timezone";
    public static final String DATE_FORMAT = "company.date_format";
    public static final String TIME_FORMAT = "company.time_format";
    public static final String START_OF_WEEK = "company.start_of_week";
    public static final String QUANTITY_RATE = "company.general.use_quantity_rate";
    public static final String FAMILY_PRICE = "company.general.family_price_distribution";
    public static final String PRICE_ROUNDING = "company.general.price_rounding_mode";
    public static final String COST_METHOD = "company.general.cost_calculation_method";
    public static final String PROFITABILITY = "company.general.profitability_display";
    public static final String LOGIN_REQUIRE_PASSWORD = "company.login.require_password";
    public static final String DISCOUNTS_REQUIRE_REASON = "company.sell.discounts_require_reason";
    public static final String REFUNDS_REQUIRE_REASON = "company.sell.refunds_require_reason";
    public static final String CASH_OUT_WITHOUT_SALE = "company.sell.allow_cash_out_without_sale";
    public static final String REQUIRE_NOTE_ON_PARKED_SALE = "company.sell.require_note_on_parked_sale";
    public static final String SALE_KEYS_POSITION = "company.misc.sale_keys_position";
    public static final String OWNED_PREFIX = "meta.owned.";

    /** Default values applied when a key is absent (AU bottle-shop pilot). */
    public static Map<String, String> defaults() {
        Map<String, String> d = new LinkedHashMap<>();
        // General
        d.put(QUANTITY_RATE, "HIGH_MIX_PRICE");
        d.put(FAMILY_PRICE, "MATCH_PRICE_POINTS");
        d.put(PRICE_ROUNDING, "REDISTRIBUTE");
        d.put(COST_METHOD, "LAST_COST");
        d.put(PROFITABILITY, "GROSS_PROFIT_MARGIN");
        d.put("company.general.use_components_packages", "false");
        d.put("company.general.products_can_have_weight", "false");
        d.put("company.general.use_barcode_templates", "false");
        d.put("company.general.sell_cases", "true");
        d.put("company.general.cross_promotion_count", "true");
        d.put("company.general.team_message", "");
        d.put("company.general.price_activation_time", "0");
        // Display
        d.put("company.display.single_text", "Item");
        d.put("company.display.case_text", "Case");
        // Login
        d.put("company.login.login_type", "USERNAME_PASSWORD");
        d.put("company.login.mask_username", "false");
        d.put(LOGIN_REQUIRE_PASSWORD, "true");
        d.put("company.login.general_auto_logout_seconds", "7200");
        d.put("company.login.sell_auto_logout_seconds", "0");
        d.put("company.login.auto_logout_during_sale", "false");
        // Sell screen
        d.put("company.sell.show_product_details_on_add", "false");
        d.put("company.sell.display_customer_details_on_add", "false");
        d.put("company.sell.prevent_blur_on_focus_loss", "true");
        d.put("company.sell.keep_select_product_open", "true");
        d.put("company.sell.select_product_paginated", "false");
        d.put(DISCOUNTS_REQUIRE_REASON, "false");
        d.put(REFUNDS_REQUIRE_REASON, "true");
        d.put("company.sell.cash_drawer_require_reason", "false");
        d.put("company.sell.cash_out_reasons", "[]");
        d.put("company.sell.cash_in_reasons", "[]");
        d.put(CASH_OUT_WITHOUT_SALE, "true");
        d.put(REQUIRE_NOTE_ON_PARKED_SALE, "false");
        d.put("company.sell.invoice_number_length", "8");
        // Outlets
        d.put("company.outlets.share_parked_sales", "false");
        d.put("company.outlets.share_gift_cards", "false");
        // Date & time
        d.put(TIMEZONE, "Australia/Melbourne");
        d.put(DATE_FORMAT, "DD/MM/YYYY");
        d.put(TIME_FORMAT, "HH:mm");
        d.put(START_OF_WEEK, "MONDAY");
        // Currency
        d.put(ROUND_TO, "0.05");
        d.put(CURRENCY_CODE, "AUD");
        d.put(NUMBER_LOCALE, "en-AU");
        // Search
        d.put("company.search.customer_level", "STANDARD");
        d.put("company.search.product_level", "STANDARD");
        d.put("company.search.cache_location", "BROWSER");
        // Integrations
        d.put("company.integrations.metcash_host_file", "true");
        // Miscellaneous
        d.put("company.misc.default_sale_keys", "");
        d.put(SALE_KEYS_POSITION, "LEFT");
        d.put("company.misc.price_change_notifications", "false");
        d.put("company.misc.statement_reply_to", "");
        d.put("company.misc.avg_cost_on_price_editor", "false");
        d.put("company.misc.default_new_users_all_outlet_reporting", "true");
        d.put("company.misc.debug_logging_level", "INFO");
        d.put("company.additional_fields_json", "[]");
        d.put("company.page_rules_json", "[]");
        d.put("company.hardware_json", "{\"printer\":\"\",\"cashDrawer\":\"\",\"scanner\":\"browser-keyboard\"}");
        // Enterprise (Wave 1)
        d.put("enterprise.enforce_centralised_pricing", "false");
        d.put("enterprise.lock_product_edits_head_office", "false");
        d.put("enterprise.data_sync_scope", "ALL_OUTLETS");
        d.put("enterprise.allow_local_promotions", "true");
        // Push (Wave 1)
        d.put("push.low_stock_enabled", "false");
        d.put("push.end_of_day_enabled", "false");
        d.put("push.refund_enabled", "false");
        d.put("push.email_delivery_enabled", "false");
        d.put("push.devices_json", "[]");
        d.put("push.rules_json", "[]");
        return d;
    }

    public static String ownedKey(String settingName) {
        return OWNED_PREFIX + settingName;
    }
}
