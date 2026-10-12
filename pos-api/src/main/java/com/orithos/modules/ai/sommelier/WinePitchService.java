package com.orithos.modules.ai.sommelier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import java.util.List;
import java.util.Locale;
import java.util.stream.Collectors;

@Service
public class WinePitchService {

    private static final Logger log = LoggerFactory.getLogger(WinePitchService.class);

    private final ObjectProvider<ChatClient> chatClient;

    public WinePitchService(ObjectProvider<ChatClient> chatClient) {
        this.chatClient = chatClient;
    }

    public String pitch(WineCandidate wine, CustomerWineProfile customer, String length) {
        String templated = template(wine, customer, length);
        ChatClient client = chatClient.getIfAvailable();
        if (client == null) return templated;
        try {
            String raw = client.prompt()
                    .system("""
                            You are Orion Sommelier, a wine sales assistant standing next to a liquor-store staff member.
                            Write spoken English the staff can say out loud. No markdown, no quotes, no emoji.
                            Stay faithful to the tasting profile. Do not invent regions, vintages, or awards.
                            Never recommend a bottle that is not the current product unless asked for an alternative.
                            """)
                    .user(llmUser(wine, customer, length))
                    .call()
                    .content();
            if (raw == null || raw.isBlank()) return templated;
            return raw.replace('"', ' ').replace('\n', ' ').trim();
        } catch (Exception e) {
            log.debug("Pitch LLM fallback: {}", e.getMessage());
            return templated;
        }
    }

    public String answer(WineCandidate wine, String question, List<WineMatcher.ScoredWine> alts) {
        String fallback = cannedAnswer(wine, question, alts);
        ChatClient client = chatClient.getIfAvailable();
        if (client == null) return fallback;
        try {
            String raw = client.prompt()
                    .system("""
                            You are Orion Sommelier helping a store staff member answer a customer's wine question.
                            Use only the given product profile and in-stock alternatives. English, 2-4 short sentences.
                            No markdown.
                            """)
                    .user(questionUser(wine, question, alts))
                    .call()
                    .content();
            if (raw == null || raw.isBlank()) return fallback;
            return raw.trim();
        } catch (Exception e) {
            log.debug("Ask LLM fallback: {}", e.getMessage());
            return fallback;
        }
    }

    public String template(WineCandidate wine, CustomerWineProfile customer, String length) {
        WineProfile p = wine.profile();
        String dry = drynessLabel(p == null ? null : p.dryness());
        String body = bodyLabel(p == null ? null : p.body());
        String varietal = p != null && p.varietal() != null ? p.varietal() : wine.name();
        String food = foodPhrase(customer != null ? customer.food() : (p == null ? List.of() : p.foodTags()));
        String aromas = p == null || p.aromaTags().isEmpty()
                ? "ripe fruit"
                : String.join(" and ", p.aromaTags().subList(0, Math.min(2, p.aromaTags().size()))).toLowerCase(Locale.ROOT);
        String price = wine.effectivePrice() == null ? "" : "$" + wine.effectivePrice().stripTrailingZeros().toPlainString();

        if ("10s".equals(length)) {
            return "This is a " + dry.toLowerCase(Locale.ROOT) + ", " + body.toLowerCase(Locale.ROOT)
                    + " " + varietal + (food.isBlank() ? "." : " — great with " + food + ".");
        }
        if ("30s".equals(length)) {
            return "If you like something " + dry.toLowerCase(Locale.ROOT) + " and "
                    + body.toLowerCase(Locale.ROOT) + ", this " + varietal + " is a strong fit. "
                    + "You'll get " + aromas
                    + (p != null && p.finishNote() != null ? ", with a " + p.finishNote().toLowerCase(Locale.ROOT) : "")
                    + ". " + (food.isBlank() ? "Easy to drink tonight." : "I'd recommend it with " + food + ".");
        }
        return "If you're after something " + dry.toLowerCase(Locale.ROOT) + " and "
                + body.toLowerCase(Locale.ROOT)
                + (food.isBlank() ? "" : " to go with " + food)
                + ", I'd go with this " + price + " " + varietal + ". "
                + "It's showing " + aromas + " and still easy to drink.";
    }

    String cannedAnswer(WineCandidate wine, String question, List<WineMatcher.ScoredWine> alts) {
        WineProfile p = wine.profile();
        String q = question == null ? "" : question.toLowerCase(Locale.ROOT);
        String altLine = alts == null || alts.isEmpty()
                ? ""
                : " Try " + alts.get(0).wine().name() + " at $"
                + alts.get(0).wine().effectivePrice().stripTrailingZeros().toPlainString() + " instead.";
        if (q.contains("sweet") || q.contains("dry")) {
            double d = p != null && p.dryness() != null ? p.dryness() : 0.7;
            if (d >= 0.75) return "No — it's on the dry side." + (q.contains("sweet") ? altLine : "");
            if (d <= 0.4) return "Yes, it's on the sweeter, fruitier side.";
            return "It's more dry than sweet, with a bit of fruit in the middle.";
        }
        if (q.contains("cheap") || q.contains("less") || q.contains("similar")) {
            return alts == null || alts.isEmpty()
                    ? "I don't have a cheaper in-stock match in the same style right now."
                    : "Closest cheaper in-stock match:" + altLine;
        }
        if (q.contains("better") || q.contains("upgrade") || q.contains("premium")) {
            return alts == null || alts.isEmpty()
                    ? "This is already one of the stronger bottles we have in this style."
                    : "If you want to step up:" + altLine;
        }
        if (q.contains("food") || q.contains("pair") || q.contains("steak") || q.contains("dinner")) {
            String foods = p == null || p.foodTags().isEmpty()
                    ? "dinner"
                    : p.foodTags().stream().map(WinePitchService::humanFood).collect(Collectors.joining(", "));
            return "Best with " + foods + ".";
        }
        String dry = drynessLabel(p == null ? null : p.dryness());
        String body = bodyLabel(p == null ? null : p.body());
        return "It's a " + dry.toLowerCase(Locale.ROOT) + ", " + body.toLowerCase(Locale.ROOT)
                + " " + (p != null && p.varietal() != null ? p.varietal() : "wine") + ".";
    }

    static String drynessLabel(Double v) {
        if (v == null) return "Dry";
        if (v < 0.35) return "Sweet";
        if (v < 0.55) return "A little fruity";
        if (v < 0.75) return "Dry";
        return "Very Dry";
    }

    static String bodyLabel(Double v) {
        if (v == null) return "Medium";
        if (v < 0.35) return "Light";
        if (v < 0.6) return "Medium";
        if (v < 0.82) return "Full Body";
        return "Very Full Body";
    }

    static String foodPhrase(List<String> foods) {
        if (foods == null || foods.isEmpty()) return "";
        List<String> human = foods.stream().map(WinePitchService::humanFood).toList();
        if (human.size() == 1) return human.get(0);
        return String.join(" or ", human.subList(0, Math.min(2, human.size())));
    }

    static String humanFood(String raw) {
        String c = WineLexicon.canonicalFoodOne(raw);
        if (c == null) return raw;
        return switch (c) {
            case "steak" -> "steak";
            case "lamb" -> "lamb";
            case "chicken" -> "chicken";
            case "fish" -> "fish";
            case "seafood" -> "seafood";
            case "pasta" -> "pasta";
            case "pizza" -> "pizza";
            case "cheese" -> "cheese";
            case "spicy" -> "spicy food";
            case "asian" -> "Asian food";
            case "bbq" -> "BBQ";
            case "grilled_meat" -> "grilled meat";
            default -> c.replace('_', ' ');
        };
    }

    public static String whyUpgrade(WineCandidate from, WineCandidate to) {
        if (from == null || to == null || to.profile() == null) {
            return "A step up in style and finish.";
        }
        WineProfile a = from.profile();
        WineProfile b = to.profile();
        List<String> bits = new java.util.ArrayList<>();
        if (b.body() != null && (a == null || a.body() == null || b.body() > a.body() + 0.08)) {
            bits.add("More body");
        }
        if (!b.foodTags().isEmpty()) bits.add("Better " + humanFood(b.foodTags().get(0)) + " pairing");
        if (b.finishNote() != null) bits.add(b.finishNote());
        if (bits.isEmpty()) bits.add("More complexity");
        return String.join(". ", bits.subList(0, Math.min(3, bits.size()))) + ".";
    }

    private static String llmUser(WineCandidate wine, CustomerWineProfile customer, String length) {
        WineProfile p = wine.profile();
        String target = switch (length) {
            case "10s" -> "Write a 10-second version (one sentence).";
            case "30s" -> "Write a 30-second version (three short sentences).";
            default -> "Write a floor pitch the staff can read in about 12 seconds.";
        };
        return """
                Product: %s
                Price: %s
                Type: %s
                Varietal: %s
                Dryness: %s
                Body: %s
                Aromas: %s
                Palate: %s
                Food: %s
                Finish: %s
                Customer food: %s
                Customer occasion: %s
                %s
                """.formatted(
                wine.name(),
                wine.effectivePrice(),
                p == null ? "" : p.wineType(),
                p == null ? "" : p.varietal(),
                drynessLabel(p == null ? null : p.dryness()),
                bodyLabel(p == null ? null : p.body()),
                p == null ? "" : String.join(", ", p.aromaTags()),
                p == null ? "" : String.join(", ", p.palateTags()),
                p == null ? "" : String.join(", ", p.foodTags()),
                p == null ? "" : p.finishNote(),
                customer == null ? "" : String.join(", ", customer.food()),
                customer == null ? "" : customer.occasion(),
                target
        );
    }

    private static String questionUser(WineCandidate wine, String question, List<WineMatcher.ScoredWine> alts) {
        WineProfile p = wine.profile();
        String alt = (alts == null || alts.isEmpty())
                ? "none"
                : alts.stream()
                .limit(3)
                .map(s -> s.wine().name() + " $" + s.wine().effectivePrice()
                        + " match " + WineMatcher.pct(s.match()) + "%")
                .collect(Collectors.joining("; "));
        return """
                Current bottle: %s ($%s) %s %s, dryness=%s body=%s food=%s
                In-stock alternatives: %s
                Customer question: %s
                """.formatted(
                wine.name(),
                wine.effectivePrice(),
                p == null ? "" : p.wineType(),
                p == null ? "" : p.varietal(),
                drynessLabel(p == null ? null : p.dryness()),
                bodyLabel(p == null ? null : p.body()),
                p == null ? "" : String.join(",", p.foodTags()),
                alt,
                question
        );
    }
}
