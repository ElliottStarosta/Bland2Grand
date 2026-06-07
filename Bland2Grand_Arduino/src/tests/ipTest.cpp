// ipTest.cpp - full WiFi/HTTP stack without a scale (dead-reckoning only).
// Good for checking Flask integration when you don't have the HX711 wired up.
#include <Arduino.h>
#include <AccelStepper.h>
#include <WiFiS3.h>
#include <ArduinoJson.h>
#include "Constants.h"

// WiFi credentials — edit these
const char* WIFI_SSID     = "bland2grand";
const char* WIFI_PASSWORD = "password";  // change after resetting router

// Tuning — adjust until dispensed amounts look right

// How many grams one full auger cycle (1 motor revolution)
// delivers for a typical spice. Tune this by running 10 cycles
// and weighing the result, then divide by 10.
static constexpr float GRAMS_PER_CYCLE = 0.8f;

// After dispensing, wait this long before reporting done (ms).
static constexpr uint32_t SETTLE_MS = 400;

// Motors
AccelStepper carousel(AccelStepper::DRIVER, PIN_CAROUSEL_STEP, PIN_CAROUSEL_DIR);
AccelStepper auger   (AccelStepper::DRIVER, PIN_AUGER_STEP,    PIN_AUGER_DIR);

uint8_t currentSlot = 1;

// HTTP helpers
bool httpPost(const char* path, const String& body) {
    WiFiClient client;
    client.setTimeout(2000);
    if (!client.connect(FLASK_SERVER_HOST, FLASK_SERVER_PORT)) {
        Serial.print(F("[WiFi] POST failed: ")); Serial.println(path);
        return false;
    }
    client.print(F("POST ")); client.print(path); client.println(F(" HTTP/1.1"));
    client.print(F("Host: ")); client.println(FLASK_SERVER_HOST);
    client.println(F("Content-Type: application/json"));
    client.print(F("Content-Length: ")); client.println(body.length());
    client.println(F("Connection: close"));
    client.println();
    client.print(body);
    uint32_t t = millis();
    while (!client.available() && millis() - t < 2000) delay(1);
    bool ok = false;
    if (client.available()) {
        String status = client.readStringUntil('\n');
        ok = status.indexOf("200") >= 0;
    }
    client.stop();
    return ok;
}

// Push helpers  (mirrors WiFiComm.h)
void pushIndexing(uint8_t slot, const char* spiceName,
                  uint8_t slotIdx, uint8_t total) {
    StaticJsonDocument<128> doc;
    doc["slot"]        = slot;
    doc["spice_name"]  = spiceName;
    doc["slot_index"]  = slotIdx;
    doc["total_slots"] = total;
    String b; serializeJson(doc, b);
    httpPost("/api/arduino/indexing", b);
}

void pushDispenseStart(uint8_t slot, const char* spiceName,
                       float target, uint8_t slotIdx, uint8_t total) {
    StaticJsonDocument<192> doc;
    doc["slot"]          = slot;
    doc["spice_name"]    = spiceName;
    doc["target_weight"] = serialized(String(target, 2));
    doc["slot_index"]    = slotIdx;
    doc["total_slots"]   = total;
    String b; serializeJson(doc, b);
    httpPost("/api/arduino/dispense-start", b);
}

void pushWeightUpdate(uint8_t slot, float current, float target) {
    StaticJsonDocument<96> doc;
    doc["slot"]           = slot;
    doc["current_weight"] = serialized(String(current, 2));
    doc["target_weight"]  = serialized(String(target, 2));
    String b; serializeJson(doc, b);
    httpPost("/api/arduino/weight-push", b);
}

void pushSpiceComplete(uint8_t slot, const char* spiceName,
                       float actual, float target,
                       uint8_t slotIdx) {
    StaticJsonDocument<192> doc;
    doc["slot"]       = slot;
    doc["spice_name"] = spiceName;
    doc["actual"]     = serialized(String(actual, 2));
    doc["target"]     = serialized(String(target, 2));
    doc["status"]     = "done";
    doc["slot_index"] = slotIdx;
    String b; serializeJson(doc, b);
    httpPost("/api/arduino/spice-complete", b);
}

void pushSessionComplete(const char* recipeName) {
    StaticJsonDocument<96> doc;
    doc["recipe_name"] = recipeName;
    String b; serializeJson(doc, b);
    httpPost("/api/arduino/session-complete", b);
}

// Carousel  (open-loop, shortest path)
void goToSlot(uint8_t target) {
    if (target < 1 || target > CAROUSEL_SLOT_COUNT) return;
    if (target == currentSlot) {
        Serial.println(F("[CAROUSEL] Already at target slot."));
        delay(INDEX_SETTLE_MS);
        return;
    }

    int8_t fwd = (int8_t)target - (int8_t)currentSlot;
    if (fwd < 0) fwd += (int8_t)CAROUSEL_SLOT_COUNT;
    int8_t bwd = (int8_t)CAROUSEL_SLOT_COUNT - fwd;
    long steps = (fwd <= bwd)
        ?  (long)fwd * (long)STEPS_PER_SLOT
        : -(long)bwd * (long)STEPS_PER_SLOT;

    Serial.print(F("[CAROUSEL] Moving to slot ")); Serial.print(target);
    Serial.print(F("  (")); Serial.print(steps); Serial.println(F(" steps)"));

    carousel.move(steps);
    while (carousel.distanceToGo() != 0) carousel.run();
    currentSlot = target;
    delay(INDEX_SETTLE_MS);

    Serial.print(F("[CAROUSEL] Arrived at slot ")); Serial.println(currentSlot);
}

// Auger  (dead-reckoning: run N cycles for target grams)
void runAuger(uint8_t slot, const char* spiceName,
              float targetGrams, uint8_t slotIdx, uint8_t total) {

    pushDispenseStart(slot, spiceName, targetGrams, slotIdx, total);

    long cyclesNeeded = max(1L, (long)roundf(targetGrams / GRAMS_PER_CYCLE));
    long totalSteps   = cyclesNeeded * (long)STEPS_PER_AUGER_CYCLE;

    Serial.print(F("[AUGER] Dispensing ")); Serial.print(targetGrams);
    Serial.print(F("g -> ")); Serial.print(cyclesNeeded);
    Serial.println(F(" cycles"));

    // Forward dispense
    auger.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
    auger.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
    auger.move(totalSteps);

    uint32_t lastPush = millis();

    while (auger.distanceToGo() != 0) {
        auger.run();

        // Push a fake live weight update every ~150ms so the
        // app progress bar animates smoothly
        if (millis() - lastPush >= WIFI_PUSH_INTERVAL_MS) {
            lastPush = millis();
            float progress = targetGrams
                * ((float)(totalSteps - auger.distanceToGo()) / (float)totalSteps);
            pushWeightUpdate(slot, progress, targetGrams);
        }
    }

    delay(SETTLE_MS);

    // Back-purge: reverse all steps taken
    Serial.println(F("[AUGER] Back-purging..."));
    auger.setMaxSpeed(BACK_PURGE_SPEED_STEPS_S);
    auger.setAcceleration(BACK_PURGE_SPEED_STEPS_S * 2.0f);
    auger.move(-totalSteps);
    while (auger.distanceToGo() != 0) auger.run();

    // Restore forward settings
    auger.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
    auger.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
    delay(AUGER_COIL_DISABLE_DELAY_MS);
    auger.disableOutputs();

    // Report estimated weight as target (no scale)
    pushSpiceComplete(slot, spiceName, targetGrams, targetGrams, slotIdx);
    Serial.println(F("[AUGER] Done."));
}

// HTTP server  (listens for POST / from Flask)
WiFiServer server(HTTP_PORT);

void handleDispenseRequest(WiFiClient& client) {
    // Read headers
    String req = "";
    uint32_t t = millis();
    while (client.connected() && millis() - t < 2000) {
        if (client.available()) {
            char c = client.read();
            req += c;
            if (req.endsWith("\r\n\r\n")) break;
        }
    }

    // Health check
    if (req.startsWith("GET /health")) {
        client.println(F("HTTP/1.1 200 OK"));
        client.println(F("Content-Type: application/json"));
        client.println(F("Connection: close\r\n"));
        client.print(F("{\"status\":\"ok\",\"slot\":"));
        client.print(currentSlot);
        client.println(F(",\"homed\":true}"));
        client.stop();
        Serial.println(F("[HTTP] Health check OK"));
        return;
    }

    if (!req.startsWith("POST /")) {
        client.println(F("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
        client.stop();
        return;
    }

    // Read body
    String body = "";
    uint32_t bt = millis();
    while (client.connected() && millis() - bt < 500) {
        while (client.available()) body += (char)client.read();
        if (body.length() > 0) break;
        delay(5);
    }

    Serial.print(F("[HTTP] Body: ")); Serial.println(body);

    StaticJsonDocument<256> doc;
    if (deserializeJson(doc, body) != DeserializationError::Ok
        || !doc.containsKey("carousel") || !doc.containsKey("grams")) {
        Serial.println(F("[HTTP] Bad request — missing carousel or grams"));
        client.println(F("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
        client.stop();
        return;
    }

    // ACK immediately so Flask doesn't time out waiting
    client.println(F("HTTP/1.1 200 OK"));
    client.println(F("Content-Type: application/json"));
    client.println(F("Connection: close\r\n"));
    client.println(F("{\"status\":\"accepted\"}"));
    client.stop();

    // Parse command
    uint8_t     targetSlot = doc["carousel"].as<uint8_t>();
    float       grams      = doc["grams"].as<float>();
    uint8_t     slotIdx    = doc["slot_index"]  | 0;
    uint8_t     total      = doc["total_slots"] | 1;
    const char* recipeName = doc["recipe_name"] | "";
    const char* spiceName  = doc["spice_name"]  | "";

    Serial.print(F("[CMD] slot=")); Serial.print(targetSlot);
    Serial.print(F(" grams=")); Serial.print(grams);
    Serial.print(F(" spice=")); Serial.print(spiceName);
    Serial.print(F(" (")); Serial.print(slotIdx + 1);
    Serial.print(F("/")); Serial.print(total); Serial.println(F(")"));

    // Execute
    pushIndexing(targetSlot, spiceName, slotIdx, total);
    auger.enableOutputs();
    goToSlot(targetSlot);
    runAuger(targetSlot, spiceName, grams, slotIdx, total);

    // If this was the last spice, push session complete
    if (slotIdx + 1 >= total) {
        Serial.println(F("[CMD] All spices done — pushing session complete."));
        pushSessionComplete(recipeName);
    }
}

// setup()
void setup() {
    Serial.begin(9600);
    while (!Serial && millis() < 3000) {}

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
    auger.disableOutputs(); // don't hold coils until needed

    // WiFi
    Serial.print(F("[WiFi] Connecting to "));
    Serial.print(WIFI_SSID);
    Serial.print(F("..."));

    // Config IP
    IPAddress local_IP(192, 168, 137, 50);
    IPAddress gateway(192, 168, 137, 1);
    IPAddress subnet(255, 255, 255, 0);
    WiFi.config(local_IP, gateway, subnet);

    WiFi.disconnect();
    delay(1000);
    Serial.print("Firmware version: ");
    Serial.println(WiFi.firmwareVersion());

    int status = WiFi.status();
    Serial.print("Initial WiFi status: ");
    Serial.println(status);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

    while (WiFi.status() != WL_CONNECTED) {
        Serial.print("Status: ");
        Serial.println(WiFi.status());
        delay(1000);
    }

    if (WiFi.status() != WL_CONNECTED) {
        Serial.println(F("\n[WiFi] FAILED to connect."));
        Serial.println(F("       Check WIFI_SSID and WIFI_PASSWORD at the top of main.cpp"));
        Serial.println(F("       then reflash."));
        while (true) delay(5000);
    }

    Serial.println(F(" connected!"));
    Serial.print(F("[WiFi] Arduino IP: "));
    Serial.println(WiFi.localIP());
    Serial.println(F("[INFO] Copy that IP into bland2grand-backend/.env:"));
    Serial.println(F("         ARDUINO_URL=http://<IP above>"));
    Serial.println(F("         MOCK_ARDUINO=false"));

    server.begin();
    Serial.println(F("[HTTP] Server started on port 80."));
    Serial.println(F("[HTTP] Ready for dispense commands from Flask."));
    Serial.println(F("============================================"));
}

// loop()
void loop() {
    WiFiClient client = server.available();
    if (client) {
        Serial.println(F("[HTTP] Incoming connection..."));
        handleDispenseRequest(client);
    }
}