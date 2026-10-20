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
        if (contains(q, "上周", "last week")) {
            LocalDate start = today.minusWeeks(1).with(DayOfWeek.MONDAY);
            return new Window(start.atStartOfDay(), start.plusWeeks(1).atStartOfDay(), 7);
        }
        if (contains(q, "本周", "this week")) {
            LocalDate start = today.with(DayOfWeek.MONDAY);
            return new Window(start.atStartOfDay(), today.plusDays(1).atStartOfDay(), 0);
        }
        if (contains(q, "昨天", "昨日", "yesterday")) {
            LocalDate d = today.minusDays(1);
            return new Window(d.atStartOfDay(), today.atStartOfDay(), 1);
        }
        if (contains(q, "今天", "today")) {
            return new Window(today.atStartOfDay(), today.plusDays(1).atStartOfDay(), 1);
        }
        Window explicitDate = explicitDate(q, today);
        if (explicitDate != null) {
            return explicitDate;
        }
        Matcher m = Pattern.compile("近\\s*(\\d+)\\s*天|last\\s+(\\d+)\\s+days?").matcher(q);
        if (m.find()) {
            int n = Integer.parseInt(m.group(1) != null ? m.group(1) : m.group(2));
            if (n > 0) {
                return new Window(today.minusDays(n - 1L).atStartOfDay(), today.plusDays(1).atStartOfDay(), n);
            }
        }
        return null;
    }

    private Window explicitDate(String question, LocalDate today) {
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
}
