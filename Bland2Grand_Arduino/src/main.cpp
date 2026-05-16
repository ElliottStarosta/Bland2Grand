// ============================================================
//  main.cpp  —  Bland2Grand  (No-Scale / Dead-Reckoning Mode)
//
//  Full app integration (WiFi, HTTP server, SSE push).
//  Auger runs non-blocking so WiFi pushes don't stall motors.
//  Weight updates are sent on a separate timer thread via the
//  loop() so the stepper never misses a step.
// ============================================================

#include <Arduino.h>
#include <AccelStepper.h>
#include <WiFiS3.h>
#include <ArduinoJson.h>
#include "Constants.h"

// -------------------------------------------------------
//  WiFi credentials — edit these
// -------------------------------------------------------
const char *WIFI_SSID = "bland2grand";
const char *WIFI_PASSWORD = "password";

// -------------------------------------------------------
//  Tuning
// -------------------------------------------------------
static constexpr float GRAMS_PER_CYCLE = 0.8f;
static constexpr uint32_t SETTLE_MS = 400;

// -------------------------------------------------------
//  Motors
// -------------------------------------------------------
AccelStepper carousel(AccelStepper::DRIVER, PIN_CAROUSEL_STEP, PIN_CAROUSEL_DIR);
AccelStepper auger(AccelStepper::DRIVER, PIN_AUGER_STEP, PIN_AUGER_DIR);

uint8_t currentSlot = 1;

// -------------------------------------------------------
//  Dispense state machine
// -------------------------------------------------------
enum class DispenseState
{
    IDLE,
    INDEXING,      // carousel moving
    DISPENSING,    // auger running forward
    PURGING,       // auger running backward
    PUSH_COMPLETE, // send spice-complete then check if session done
    DONE
};

DispenseState dispenseState = DispenseState::IDLE;

struct ActiveDispense
{
    uint8_t slot;
    char spiceName[24];
    char recipeName[48];
    float targetGrams;
    uint8_t slotIdx;
    uint8_t total;
    long totalSteps;
    uint32_t lastPushMs;
};

ActiveDispense active;

// -------------------------------------------------------
//  HTTP POST helper  (blocking, but only called when idle)
// -------------------------------------------------------
bool httpPost(const char *path, const String &body)
{
    WiFiClient client;
    client.setTimeout(2000);
    if (!client.connect(FLASK_SERVER_HOST, FLASK_SERVER_PORT))
    {
        Serial.print(F("[WiFi] POST failed: "));
        Serial.println(path);
        return false;
    }
    client.print(F("POST "));
    client.print(path);
    client.println(F(" HTTP/1.1"));
    client.print(F("Host: "));
    client.println(FLASK_SERVER_HOST);
    client.println(F("Content-Type: application/json"));
    client.print(F("Content-Length: "));
    client.println(body.length());
    client.println(F("Connection: close"));
    client.println();
    client.print(body);
    uint32_t t = millis();
    while (!client.available() && millis() - t < 2000)
        delay(1);
    bool ok = false;
    if (client.available())
    {
        String status = client.readStringUntil('\n');
        ok = status.indexOf("200") >= 0;
    }
    client.stop();
    return ok;
}

// -------------------------------------------------------
//  Non-blocking weight push — called from loop() while
//  auger is running so it doesn't stall the stepper.
//  Uses a short timeout so we don't block long.
// -------------------------------------------------------
void pushWeightUpdateNonBlocking(float current, float target)
{
    WiFiClient client;
    client.setTimeout(80); // very short — best effort
    if (!client.connect(FLASK_SERVER_HOST, FLASK_SERVER_PORT))
        return;

    StaticJsonDocument<96> doc;
    doc["slot"] = active.slot;
    doc["current_weight"] = serialized(String(current, 2));
    doc["target_weight"] = serialized(String(target, 2));
    String b;
    serializeJson(doc, b);

    client.print(F("POST /api/arduino/weight-push HTTP/1.1\r\n"));
    client.print(F("Host: "));
    client.println(FLASK_SERVER_HOST);
    client.println(F("Content-Type: application/json"));
    client.print(F("Content-Length: "));
    client.println(b.length());
    client.println(F("Connection: close\r\n"));
    client.print(b);
    // Don't wait for response — fire and forget
    client.stop();
}

void pushNearlyThere()
{
    StaticJsonDocument<128> doc;
    doc["slot"] = active.slot;
    doc["spice_name"] = active.spiceName;
    String b;
    serializeJson(doc, b);
    httpPost("/api/arduino/nearly-there", b);
}

// -------------------------------------------------------
//  Push helpers  (blocking — only called when motors idle)
// -------------------------------------------------------
void pushIndexing()
{
    StaticJsonDocument<128> doc;
    doc["slot"] = active.slot;
    doc["spice_name"] = active.spiceName;
    doc["slot_index"] = active.slotIdx;
    doc["total_slots"] = active.total;
    String b;
    serializeJson(doc, b);
    httpPost("/api/arduino/indexing", b);
}

void pushDispenseStart()
{
    StaticJsonDocument<192> doc;
    doc["slot"] = active.slot;
    doc["spice_name"] = active.spiceName;
    doc["target_weight"] = serialized(String(active.targetGrams, 2));
    doc["slot_index"] = active.slotIdx;
    doc["total_slots"] = active.total;
    String b;
    serializeJson(doc, b);
    httpPost("/api/arduino/dispense-start", b);
}

void pushSpiceComplete()
{
    StaticJsonDocument<192> doc;
    doc["slot"] = active.slot;
    doc["spice_name"] = active.spiceName;
    doc["actual"] = serialized(String(active.targetGrams, 2));
    doc["target"] = serialized(String(active.targetGrams, 2));
    doc["status"] = "done";
    doc["slot_index"] = active.slotIdx;
    String b;
    serializeJson(doc, b);
    httpPost("/api/arduino/spice-complete", b);
}

void pushSessionComplete()
{
    StaticJsonDocument<96> doc;
    doc["recipe_name"] = active.recipeName;
    String b;
    serializeJson(doc, b);
    httpPost("/api/arduino/session-complete", b);
}

// -------------------------------------------------------
//  Carousel move  (blocking — called only from INDEXING)
// -------------------------------------------------------
void doCarouselMove(uint8_t target)
{
    if (target < 1 || target > CAROUSEL_SLOT_COUNT)
        return;
    if (target == currentSlot)
    {
        Serial.println(F("[CAROUSEL] Already at target slot."));
        // Already here — fire nearly-there immediately then settle
        pushNearlyThere();
        delay(INDEX_SETTLE_MS);
        return;
    }

    int8_t fwd = (int8_t)target - (int8_t)currentSlot;
    if (fwd < 0)
        fwd += (int8_t)CAROUSEL_SLOT_COUNT;
    int8_t bwd = (int8_t)CAROUSEL_SLOT_COUNT - fwd;
    long steps = (fwd <= bwd)
                     ? (long)fwd * (long)STEPS_PER_SLOT
                     : -(long)bwd * (long)STEPS_PER_SLOT;

    carousel.move(steps);
    while (carousel.distanceToGo() != 0)
        carousel.run();  // pure stepper loop — no HTTP calls in here

    currentSlot = target;

    // Motor has fully stopped — safe to do blocking HTTP now,
    // before the settle delay so the sound plays during the settle pause
    pushNearlyThere();
    delay(INDEX_SETTLE_MS);

    Serial.print(F("[CAROUSEL] Arrived at slot "));
    Serial.println(currentSlot);
}

// -------------------------------------------------------
//  State machine tick — called every loop()
// -------------------------------------------------------
void tickDispense()
{
    switch (dispenseState)
    {

    case DispenseState::IDLE:
        break;

    case DispenseState::INDEXING:
        // Carousel move is blocking but short — do it once then transition
        pushIndexing();
        auger.enableOutputs();
        doCarouselMove(active.slot);

        // Set up auger forward move
        active.totalSteps = max(1L, (long)roundf(active.targetGrams / GRAMS_PER_CYCLE)) * (long)STEPS_PER_AUGER_CYCLE;

        pushDispenseStart();

        auger.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        auger.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
        auger.move(active.totalSteps);
        active.lastPushMs = millis();

        Serial.print(F("[AUGER] Dispensing "));
        Serial.print(active.targetGrams);
        Serial.print(F("g -> "));
        Serial.print(active.totalSteps / STEPS_PER_AUGER_CYCLE);
        Serial.println(F(" cycles"));

        dispenseState = DispenseState::DISPENSING;
        break;

    case DispenseState::DISPENSING:
        // Pure stepper — zero WiFi calls, maximum smoothness
        auger.run();

        if (auger.distanceToGo() == 0)
        {
            Serial.println(F("[AUGER] Forward done. Sending progress burst..."));

            // Send a burst of fake progress updates so the app
            // animates smoothly — all sent after motors stop
            for (int i = 1; i <= 8; i++)
            {
                float progress = active.targetGrams * (i / 8.0f);
                StaticJsonDocument<96> doc;
                doc["slot"] = active.slot;
                doc["current_weight"] = serialized(String(progress, 2));
                doc["target_weight"] = serialized(String(active.targetGrams, 2));
                String b;
                serializeJson(doc, b);
                httpPost("/api/arduino/weight-push", b);
                delay(40);
            }

            delay(SETTLE_MS);
            auger.setMaxSpeed(BACK_PURGE_SPEED_STEPS_S);
            auger.setAcceleration(BACK_PURGE_SPEED_STEPS_S * 2.0f);
            auger.move(-active.totalSteps);
            Serial.println(F("[AUGER] Back-purging..."));
            dispenseState = DispenseState::PURGING;
        }
        break;
    case DispenseState::PURGING:
        auger.run();

        if (auger.distanceToGo() == 0)
        {
            // Restore forward settings
            auger.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
            auger.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
            delay(AUGER_COIL_DISABLE_DELAY_MS);
            auger.disableOutputs();

            Serial.println(F("[AUGER] Done."));
            dispenseState = DispenseState::PUSH_COMPLETE;
        }
        break;

    case DispenseState::PUSH_COMPLETE:
        pushSpiceComplete();
        if (active.slotIdx + 1 >= active.total)
        {
            Serial.println(F("[CMD] All spices done."));
            pushSessionComplete();
            // Home back to slot 1
            Serial.println(F("[CAROUSEL] Returning to slot 1..."));
            doCarouselMove(1);
        }
        dispenseState = DispenseState::IDLE;
        break;

    case DispenseState::DONE:
        dispenseState = DispenseState::IDLE;
        break;
    }
}

// -------------------------------------------------------
//  HTTP server
// -------------------------------------------------------
WiFiServer server(HTTP_PORT);

void handleIncomingRequest(WiFiClient &client)
{
    String req = "";
    uint32_t t = millis();
    while (client.connected() && millis() - t < 2000)
    {
        if (client.available())
        {
            char c = client.read();
            req += c;
            if (req.endsWith("\r\n\r\n"))
                break;
        }
    }

    // Health check
    if (req.startsWith("GET /health"))
    {
        client.println(F("HTTP/1.1 200 OK"));
        client.println(F("Content-Type: application/json"));
        client.println(F("Connection: close\r\n"));
        client.print(F("{\"status\":\"ok\",\"slot\":"));
        client.print(currentSlot);
        client.print(F(",\"busy\":"));
        client.print(dispenseState != DispenseState::IDLE ? "true" : "false");
        client.println(F(",\"homed\":true}"));
        client.stop();
        Serial.println(F("[HTTP] Health check OK"));
        return;
    }

    if (!req.startsWith("POST /"))
    {
        client.println(F("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
        client.stop();
        return;
    }

    // Read body
    String body = "";
    uint32_t bt = millis();
    while (client.connected() && millis() - bt < 500)
    {
        while (client.available())
            body += (char)client.read();
        if (body.length() > 0)
            break;
        delay(5);
    }

    Serial.print(F("[HTTP] Body: "));
    Serial.println(body);

    // Reject if busy
    if (dispenseState != DispenseState::IDLE)
    {
        client.println(F("HTTP/1.1 409 Conflict\r\nConnection: close\r\n\r\n"));
        client.stop();
        return;
    }

    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok || !doc.containsKey("carousel") || !doc.containsKey("grams"))
    {
        Serial.println(F("[HTTP] Bad request"));
        client.println(F("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
        client.stop();
        return;
    }

    // ACK immediately
    client.println(F("HTTP/1.1 200 OK"));
    client.println(F("Content-Type: application/json"));
    client.println(F("Connection: close\r\n"));
    client.println(F("{\"status\":\"accepted\"}"));
    client.stop();

    // Load active dispense
    active.slot = doc["carousel"].as<uint8_t>();
    active.targetGrams = doc["grams"].as<float>();
    active.slotIdx = doc["slot_index"] | 0;
    active.total = doc["total_slots"] | 1;

    const char *rn = doc["recipe_name"] | "";
    const char *sn = doc["spice_name"] | "";
    strncpy(active.recipeName, rn, sizeof(active.recipeName) - 1);
    strncpy(active.spiceName, sn, sizeof(active.spiceName) - 1);

    Serial.print(F("[CMD] slot="));
    Serial.print(active.slot);
    Serial.print(F(" grams="));
    Serial.print(active.targetGrams);
    Serial.print(F(" spice="));
    Serial.print(active.spiceName);
    Serial.print(F(" ("));
    Serial.print(active.slotIdx + 1);
    Serial.print(F("/"));
    Serial.print(active.total);
    Serial.println(F(")"));

    dispenseState = DispenseState::INDEXING;
}

// -------------------------------------------------------
//  setup()
// -------------------------------------------------------
void setup()
{
    Serial.begin(9600);
    while (!Serial && millis() < 3000)
    {
    }

    Serial.println(F("============================================"));
    Serial.println(F("  Bland2Grand  —  No-Scale Mode"));
    Serial.println(F("============================================"));

    // Motors
    carousel.setMaxSpeed(INDEX_SPEED_STEPS_S);
    carousel.setAcceleration(INDEX_ACCEL_STEPS_S2);
    carousel.setCurrentPosition(0);

    auger.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
    auger.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
    auger.setCurrentPosition(0);
    auger.disableOutputs();

    // Static IP
    IPAddress local_IP(192, 168, 137, 50);
    IPAddress gateway(192, 168, 137, 1);
    IPAddress subnet(255, 255, 255, 0);
    WiFi.config(local_IP, gateway, subnet);

    Serial.print(F("[WiFi] Connecting to "));
    Serial.print(WIFI_SSID);
    Serial.print(F("..."));

    WiFi.disconnect();
    delay(1000);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    while (WiFi.status() != WL_CONNECTED)
    {
        delay(500);
        Serial.print('.');
    }

    Serial.println(F(" connected!"));
    Serial.print(F("[WiFi] Arduino IP: "));
    Serial.println(WiFi.localIP());

    server.begin();
    Serial.println(F("[HTTP] Server started on port 80. Ready."));
    Serial.println(F("============================================"));
}

// -------------------------------------------------------
//  loop()
// -------------------------------------------------------
void loop()
{
    // Always tick the dispense state machine first
    tickDispense();

    // Only check for new HTTP requests when idle
    // (don't interrupt an active dispense with a new command)
    if (dispenseState == DispenseState::IDLE)
    {
        WiFiClient client = server.available();
        if (client)
        {
            Serial.println(F("[HTTP] Incoming connection..."));
            handleIncomingRequest(client);
        }
    }
}