package com.orithos.modules.ai.report;

import com.orithos.common.AustraliaTime;
import org.springframework.stereotype.Component;

import java.time.DayOfWeek;
import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.Month;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.time.format.DateTimeParseException;
import java.time.temporal.TemporalAdjusters;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Resolves report from/to from slots or relative phrases in the question.
 * Missing range defaults to today (start inclusive, next midnight exclusive).
 */
@Component
public class ReportPeriodResolver {

    public record Window(LocalDateTime from, LocalDateTime toExclusive, int days) {}

    private final Clock clock;

    public ReportPeriodResolver() {
        this(Clock.systemUTC());
    }

    ReportPeriodResolver(Clock clock) {
        this.clock = clock;
    }

    private static final DateTimeFormatter ISO = DateTimeFormatter.ISO_LOCAL_DATE;
    private static final DateTimeFormatter MONTH_ABBR = new DateTimeFormatterBuilder()
            .parseCaseInsensitive()
            .appendPattern("MMM")
            .toFormatter(Locale.ENGLISH);
    private static final Pattern DAY_MONTH = Pattern.compile(
            "(?i)\\b(\\d{1,2})(?:st|nd|rd|th)?[\\s,./-]+"
                    + "(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
                    + "jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
                    + "(?:[\\s,./-]+(\\d{4}))?\\b");
    private static final Pattern MONTH_DAY = Pattern.compile(
            "(?i)\\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|"
                    + "jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)"
                    + "[\\s,./-]+(\\d{1,2})(?:st|nd|rd|th)?(?:[\\s,./-]+(\\d{4}))?\\b");
    private static final Pattern ENGLISH_RANGE = Pattern.compile(
            "(?i)\\bfrom\\s+(\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}/\\d{1,2}/\\d{4}|\\d{1,2}(?:st|nd|rd|th)?[\\s,.-]+[a-z]+(?:[\\s,.-]+\\d{4})?)"
                    + "\\s+to\\s+(\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}/\\d{1,2}/\\d{4}|\\d{1,2}(?:st|nd|rd|th)?[\\s,.-]+[a-z]+(?:[\\s,.-]+\\d{4})?)\\b");
    private static final Pattern CHINESE_RANGE = Pattern.compile(
            "(?i)(?:从|自)\\s*(\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}/\\d{1,2}/\\d{4})\\s*(?:到|至)\\s*(\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}/\\d{1,2}/\\d{4})");
    private static final Pattern ENGLISH_MONTH_DAY_RANGE = Pattern.compile(
            "(?i)\\bfrom\\s+([a-z]+[\\s,.-]+\\d{1,2}(?:st|nd|rd|th)?(?:[\\s,.-]+\\d{4})?)"
                    + "\\s+to\\s+([a-z]+[\\s,.-]+\\d{1,2}(?:st|nd|rd|th)?(?:[\\s,.-]+\\d{4})?)\\b");
    private static final Pattern CHINESE_MONTH_DAY_RANGE = Pattern.compile(
            "(?:从|自)\\s*(?:(\\d{4})年)?(\\d{1,2})月(\\d{1,2})日\\s*(?:到|至)\\s*(?:(\\d{4})年)?(\\d{1,2})月(\\d{1,2})日");
    private static final Pattern CHINESE_SINGLE_DATE = Pattern.compile(
            "(?:(\\d{4})年)?(\\d{1,2})月(\\d{1,2})[日号]?");

    public Window resolve(Map<String, String> slots, String question) {
        return resolve(slots, question, 1);
    }

    public Window resolve(Map<String, String> slots, String question, int defaultDays) {
        return resolve(slots, question, defaultDays, AustraliaTime.ZONE);
    }

    public Window resolve(Map<String, String> slots, String question, int defaultDays, ZoneId timezone) {
        ZoneId zone = timezone == null ? AustraliaTime.ZONE : timezone;
        LocalDate today = LocalDate.now(clock.withZone(zone));
        String fromRaw = slot(slots, "from");
        String toRaw = slot(slots, "to");
        Integer days = parseDays(slot(slots, "days"));

        // Relative phrases in the utterance beat LLM from/to — models often put 销量 into
        // dates or emit UTC yesterday when the cashier said 今天.
        Window relative = fromQuestion(question, today);
        if (relative != null) {
            return relative;
        }

        LocalDate from = parseDate(fromRaw);
        LocalDate to = parseDate(toRaw);

        if (from == null && to == null) {
            int spanDays = days == null ? Math.max(1, defaultDays) : days;
            return new Window(today.minusDays(spanDays - 1L).atStartOfDay(),
                    today.plusDays(1).atStartOfDay(), spanDays);
        }
        if (from == null) {
            from = to;
        }
        if (to == null) {
            to = from;
        }
        if (to.isBefore(from)) {
            LocalDate tmp = from;
            from = to;
            to = tmp;
        }
        int spanDays = (int) (to.toEpochDay() - from.toEpochDay() + 1);
        return overlayDays(new Window(from.atStartOfDay(), to.plusDays(1).atStartOfDay(), spanDays), days);
    }

    private Window overlayDays(Window w, Integer days) {
        if (days == null) {
            return w;
        }
        return new Window(w.from(), w.toExclusive(), days);
    }

    private Window fromQuestion(String question, LocalDate today) {
        if (question == null || question.isBlank()) {
            return null;
        }
        String q = question.toLowerCase(Locale.ROOT);
        // Must run before "上周" / "last week": "上周五" contains "上周".
        if (contains(q, "上周五", "last friday")) {
            LocalDate d = today.with(TemporalAdjusters.previous(DayOfWeek.FRIDAY));
            return new Window(d.atStartOfDay(), d.plusDays(1).atStartOfDay(), 1);
        }
        if (contains(q, "上个月", "上一个月", "上月", "前一个月", "前月", "last month", "previous month")) {
            LocalDate first = today.minusMonths(1).withDayOfMonth(1);
            return new Window(first.atStartOfDay(), first.plusMonths(1).atStartOfDay(), 0);
        }
        if (contains(q, "本月", "this month")) {
            LocalDate first = today.withDayOfMonth(1);
            return new Window(first.atStartOfDay(), today.plusDays(1).atStartOfDay(), 0);
        }
        if (containsWeekendSalesPhrase(q)) {
            LocalDate lastSunday = today.with(TemporalAdjusters.previous(DayOfWeek.SUNDAY));
            LocalDate saturday = lastSunday.minusDays(1);
            return new Window(saturday.atStartOfDay(), lastSunday.plusDays(1).atStartOfDay(), 2);
        }
        if (contains(q, "上周", "last week")) {
            LocalDate start = today.minusWeeks(1).with(DayOfWeek.MONDAY);
            return new Window(start.atStartOfDay(), start.plusWeeks(1).atStartOfDay(), 7);
        }
        if (contains(q, "本周", "this week")) {
            LocalDate start = today.with(DayOfWeek.MONDAY);
            return new Window(start.atStartOfDay(), today.plusDays(1).atStartOfDay(), 0);
        }
        // Before "昨天"/"yesterday": "day before yesterday" contains "yesterday".
        if (contains(q, "前天", "day before yesterday")) {
            LocalDate d = today.minusDays(2);
            return new Window(d.atStartOfDay(), d.plusDays(1).atStartOfDay(), 1);
        }
        if (contains(q, "昨天", "昨日", "yesterday")) {
            LocalDate d = today.minusDays(1);
            return new Window(d.atStartOfDay(), today.atStartOfDay(), 1);
        }
        if (contains(q, "今天", "today")) {
            return new Window(today.atStartOfDay(), today.plusDays(1).atStartOfDay(), 1);
        }
        Window range = explicitRange(q, today);
        if (range != null) {
            return range;
        }
        Window explicitDate = explicitDate(q, today);
        if (explicitDate != null) {
            return explicitDate;
        }
        Matcher m = Pattern.compile("(?:近|最近|过去)\\s*(\\d+)\\s*天|(?:last|past|previous)\\s+(\\d+)\\s+days?").matcher(q);
        if (m.find()) {
            int n = Integer.parseInt(m.group(1) != null ? m.group(1) : m.group(2));
            if (n > 0) {
                return new Window(today.minusDays(n - 1L).atStartOfDay(), today.plusDays(1).atStartOfDay(), n);
            }
        }
        return null;
    }

    private Window explicitRange(String question, LocalDate today) {
        Matcher english = ENGLISH_RANGE.matcher(question);
        if (english.find()) {
            LocalDate from = parseFlexibleDate(english.group(1), today);
            LocalDate to = parseFlexibleDate(english.group(2), today);
            return range(from, to);
        }
        Matcher englishMonthDay = ENGLISH_MONTH_DAY_RANGE.matcher(question);
        if (englishMonthDay.find()) {
            LocalDate from = parseFlexibleDate(englishMonthDay.group(1), today);
            LocalDate to = parseFlexibleDate(englishMonthDay.group(2), today);
            return range(from, to);
        }
        Matcher chinese = CHINESE_RANGE.matcher(question);
        if (chinese.find()) {
            LocalDate from = parseFlexibleDate(chinese.group(1), today);
            LocalDate to = parseFlexibleDate(chinese.group(2), today);
            return range(from, to);
        }
        Matcher chineseMonthDay = CHINESE_MONTH_DAY_RANGE.matcher(question);
        if (chineseMonthDay.find()) {
            int fromYear = chineseMonthDay.group(1) == null ? today.getYear() : Integer.parseInt(chineseMonthDay.group(1));
            int toYear = chineseMonthDay.group(4) == null ? fromYear : Integer.parseInt(chineseMonthDay.group(4));
            LocalDate from = safeDate(fromYear, Integer.parseInt(chineseMonthDay.group(2)), Integer.parseInt(chineseMonthDay.group(3)));
            LocalDate to = safeDate(toYear, Integer.parseInt(chineseMonthDay.group(5)), Integer.parseInt(chineseMonthDay.group(6)));
            return range(from, to);
        }
        return null;
    }

    private static LocalDate safeDate(int year, int month, int day) {
        try {
            return LocalDate.of(year, month, day);
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static Window range(LocalDate from, LocalDate to) {
        if (from == null || to == null) return null;
        if (to.isBefore(from)) {
            LocalDate tmp = from;
            from = to;
            to = tmp;
        }
        return new Window(from.atStartOfDay(), to.plusDays(1).atStartOfDay(),
                (int) (to.toEpochDay() - from.toEpochDay() + 1));
    }

    private static LocalDate parseFlexibleDate(String raw, LocalDate today) {
        if (raw == null || raw.isBlank()) return null;
        String value = raw.trim();
        Matcher iso = Pattern.compile("(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})").matcher(value);
        if (iso.matches()) return parseDate(iso.group(1) + "-" + iso.group(2) + "-" + iso.group(3));
        Matcher au = Pattern.compile("(\\d{1,2})/(\\d{1,2})/(\\d{4})").matcher(value);
        if (au.matches()) return parseDate(au.group(3) + "-" + au.group(2) + "-" + au.group(1));
        Matcher dayMonth = DAY_MONTH.matcher(value);
        if (dayMonth.matches()) return parseNamedDate(dayMonth.group(2), dayMonth.group(1), dayMonth.group(3), today);
        Matcher monthDay = MONTH_DAY.matcher(value);
        if (monthDay.matches()) return parseNamedDate(monthDay.group(1), monthDay.group(2), monthDay.group(3), today);
        return null;
    }

    private Window explicitDate(String question, LocalDate today) {
        Matcher chinese = CHINESE_SINGLE_DATE.matcher(question);
        if (chinese.find()) {
            int year = chinese.group(1) == null ? today.getYear() : Integer.parseInt(chinese.group(1));
            return singleDate(safeDate(year, Integer.parseInt(chinese.group(2)), Integer.parseInt(chinese.group(3))));
        }
        Matcher dayMonth = DAY_MONTH.matcher(question);
        if (dayMonth.find()) {
            return singleDate(parseNamedDate(dayMonth.group(2), dayMonth.group(1), dayMonth.group(3), today));
        }
        Matcher monthDay = MONTH_DAY.matcher(question);
        if (monthDay.find()) {
            return singleDate(parseNamedDate(monthDay.group(1), monthDay.group(2), monthDay.group(3), today));
        }
        Matcher iso = Pattern.compile("\\b(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})\\b").matcher(question);
        if (iso.find()) {
            return singleDate(parseDate(iso.group(1) + "-" + iso.group(2) + "-" + iso.group(3)));
        }
        Matcher au = Pattern.compile("\\b(\\d{1,2})/(\\d{1,2})/(\\d{4})\\b").matcher(question);
        if (au.find()) {
            return singleDate(parseDate(au.group(3) + "-" + au.group(2) + "-" + au.group(1)));
        }
        return null;
    }

    private static LocalDate parseNamedDate(String monthText, String dayText, String yearText, LocalDate today) {
        try {
            // Month.valueOf("OCT") fails; English MMM abbreviations must go through a formatter.
            Month month = Month.from(MONTH_ABBR.parse(monthText.substring(0, 3)));
            int year = yearText == null ? today.getYear() : Integer.parseInt(yearText);
            return LocalDate.of(year, month, Integer.parseInt(dayText));
        } catch (RuntimeException e) {
            return null;
        }
    }

    private static Window singleDate(LocalDate date) {
        if (date == null) {
            return null;
        }
        return new Window(date.atStartOfDay(), date.plusDays(1).atStartOfDay(), 1);
    }

    private static Integer parseDays(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        try {
            int n = Integer.parseInt(raw.trim());
            return n > 0 && n <= 3650 ? n : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    private static LocalDate parseDate(String raw) {
        if (raw == null || raw.isBlank()) {
            return null;
        }
        String v = raw.trim();
        try {
            return LocalDate.parse(v.length() >= 10 ? v.substring(0, 10) : v, ISO);
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static String slot(Map<String, String> slots, String key) {
        if (slots == null) {
            return null;
        }
        return slots.get(key);
    }

    private static boolean contains(String q, String... needles) {
        for (String n : needles) {
            if (q.contains(n.toLowerCase(Locale.ROOT))) {
                return true;
            }
        }
        return false;
    }

    private static boolean containsWeekendSalesPhrase(String q) {
        return q.matches("(?s).*(?:how did we trade.{0,24}weekend|how did we do.{0,24}weekend|"
                + "weekend\\s+(?:sales|revenue|takings|turnover)|"
                + "(?:sales|revenue|takings|turnover)\\s+(?:for\\s+|over\\s+|during\\s+)?(?:the\\s+)?(?:(?:last|past|previous)\\s+)?weekend|"
                + "(?:trade|trading|sales|营业额|销售额|流水|收入|生意|业绩).{0,24}周末|"
                + "(?:周末|上个周末|上周末).{0,16}(?:营业额|销售额|流水|收入|生意|业绩)).*");
    }
}
