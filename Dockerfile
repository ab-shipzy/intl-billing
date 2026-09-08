# Build stage - plain javac, no Maven (deps are vendored in lib/)
FROM eclipse-temurin:21-jdk AS build
WORKDIR /app
COPY src src
COPY lib lib
RUN mkdir -p out && javac -cp "lib/*" -d out src/*.java

# Runtime stage
FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /app/out out
COPY lib lib
COPY public public
EXPOSE 3000
CMD ["java", "-cp", "out:lib/*", "App"]
