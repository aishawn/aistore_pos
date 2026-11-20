package com.orithos.modules.ai.report;

import com.orithos.common.AustraliaTime;

import java.time.LocalDate;
import java.time.Month;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeFormatterBuilder;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** Parses exactly two explicit single dates for the supported sales comparison. */
final class ExplicitReportDates {
    private static final Pattern COMPARISON_MARKER = Pattern.compile(
            "(?i)\\b(?:compare(?:d)?|comparison|versus|vs\\.?)\\b|比较|对比|相比");
    private static final Pattern DATE = Pattern.compile(
            "(?i)(?:\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}|\\d{1,2}/\\d{1,2}/\\d{4}|"
                    + "\\d{1,2}(?:st|nd|rd|th)?[\\s,.-]+(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)(?:[\\s,.-]+\\d{4})?|"
                    + "(?:jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:tember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)[\\s,.-]+\\d{1,2}(?:st|nd|rd|th)?(?:[\\s,.-]+\\d{4})?|"
                    + "(?:\\d{4}年)?\\d{1,2}月\\d{1,2}[日号]?)");
    private static final DateTimeFormatter MONTH = new DateTimeFormatterBuilder()
            .parseCaseInsensitive().appendPattern("MMM").toFormatter(Locale.ENGLISH);

    private ExplicitReportDates() {}

    static Optional<List<LocalDate>> parsePair(String question) {
        return parsePair(question, AustraliaTime.ZONE);
    }

    static Optional<List<LocalDate>> parsePair(String question, ZoneId timezone) {
        if (question == null || !COMPARISON_MARKER.matcher(question).find()) return Optional.empty();
        Matcher matcher = DATE.matcher(question);
        List<Match> matches = new ArrayList<>();
        while (matcher.find()) {
            LocalDate date = parse(matcher.group(), timezone);
            if (date == null) return Optional.empty();
            matches.add(new Match(matcher.start(), date));
        }
        if (matches.size() != 2 || matches.get(0).date().equals(matches.get(1).date())) return Optional.empty();
        matches.sort(Comparator.comparingInt(Match::start));
        return Optional.of(matches.stream().map(Match::date).toList());
    }

    private static LocalDate parse(String raw, ZoneId timezone) {
        String value = raw.trim();
        try {
            if (value.matches("\\d{4}[-/.]\\d{1,2}[-/.]\\d{1,2}")) {
                String[] parts = value.split("[-/ .]");
                return LocalDate.of(Integer.parseInt(parts[0]), Integer.parseInt(parts[1]), Integer.parseInt(parts[2]));
            }
            if (value.matches("\\d{1,2}/\\d{1,2}/\\d{4}")) {
                String[] parts = value.split("/");
                return LocalDate.of(Integer.parseInt(parts[2]), Integer.parseInt(parts[1]), Integer.parseInt(parts[0]));
            }
            Matcher chinese = Pattern.compile("(?:(\\d{4})年)?(\\d{1,2})月(\\d{1,2})[日号]?").matcher(value);
            if (chinese.matches()) return LocalDate.of(year(chinese.group(1), timezone), Integer.parseInt(chinese.group(2)), Integer.parseInt(chinese.group(3)));
            Matcher dayMonth = Pattern.compile("(?i)(\\d{1,2})(?:st|nd|rd|th)?[\\s,.-]+([a-z]+)(?:[\\s,.-]+(\\d{4}))?").matcher(value);
            Matcher monthDay = Pattern.compile("(?i)([a-z]+)[\\s,.-]+(\\d{1,2})(?:st|nd|rd|th)?(?:[\\s,.-]+(\\d{4}))?").matcher(value);
            String month; String day; String explicitYear;
            if (dayMonth.matches()) { day = dayMonth.group(1); month = dayMonth.group(2); explicitYear = dayMonth.group(3); }
            else if (monthDay.matches()) { month = monthDay.group(1); day = monthDay.group(2); explicitYear = monthDay.group(3); }
            else return null;
            return LocalDate.of(year(explicitYear, timezone), Month.from(MONTH.parse(month.substring(0, 3))).getValue(), Integer.parseInt(day));
        } catch (RuntimeException ex) {
            return null;
        }
    }

    private static int year(String value, ZoneId timezone) {
        return value == null ? LocalDate.now(timezone).getYear() : Integer.parseInt(value);
    }

    private record Match(int start, LocalDate date) {}
}
