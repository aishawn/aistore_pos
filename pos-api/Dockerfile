# ============================================
# Stage 1: Build the Spring Boot fat JAR
# ============================================
FROM maven:3.9-eclipse-temurin-21 AS builder

WORKDIR /build

# Cache dependencies first (only re-downloads when pom.xml changes)
COPY pom.xml ./
RUN --mount=type=cache,target=/root/.m2 mvn -q dependency:go-offline

# Build
COPY src ./src
ARG SOURCE_COMMIT=
RUN printf 'commit=%s\nbuiltAt=%s\n' "$SOURCE_COMMIT" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" > src/main/resources/build-identity.properties
# The exact Java 21 image candidate must pass the full Maven test suite before packaging.
RUN --mount=type=cache,target=/root/.m2 mvn -B clean verify

# ============================================
# Stage 2: Run the JAR on a slim JRE
# ============================================
FROM eclipse-temurin:21-jre AS runner

WORKDIR /app

# Non-root user
RUN useradd -r -u 1001 spring
USER spring

COPY --from=builder /build/target/pos-api-*.jar app.jar

ENV SERVER_PORT=8080
EXPOSE 8080

ENTRYPOINT ["java", "-jar", "/app/app.jar"]
