#pragma once
#include <Arduino.h>
#include <WiFiS3.h>
#include <ArduinoJson.h>
#include "Constants.h"

struct Command
{
    bool valid = false;
    uint8_t carousel = 0;
    float grams = 0.0f;
    bool isHealth = false;
    bool isResetModel = false;
    bool isModelInfo = false;
    uint8_t diagSlot = 0;
};

class WiFiComm
{
public:
    WiFiComm() : _connected(false) {}

    // begin() -- connect to WiFi only. No server needed.
    bool begin(const char *ssid, const char *password)
    {
        if (WiFi.status() == WL_NO_MODULE)
            return false;

        uint32_t t = millis();
        while (WiFi.status() != WL_CONNECTED && millis() - t < WIFI_CONNECT_TIMEOUT_MS)
        {
            WiFi.begin(ssid, password);
            delay(1000);
        }

        _connected = (WiFi.status() == WL_CONNECTED);
        return _connected;
    }

    bool isConnected() const { return _connected && WiFi.status() == WL_CONNECTED; }

    void printIP() const
    {
        Serial.print(F("Arduino IP: "));
        Serial.println(WiFi.localIP());
    }

    // Called once when a spice dispense begins (after carousel indexes)
    bool pushDispenseStart(uint8_t slot, const char *spiceName,
                           float targetGrams, uint8_t slotIndex, uint8_t totalSlots)
    {
        StaticJsonDocument<192> doc;
        doc["slot"] = slot;
        doc["spice_name"] = spiceName;
        doc["target_weight"] = serialized(String(targetGrams, 2));
        doc["slot_index"] = slotIndex;
        doc["total_slots"] = totalSlots;
        String body;
        serializeJson(doc, body);
        return _post("/api/arduino/dispense-start", body);
    }

    // Called every ~150ms during dispense -- fire and forget
    bool pushWeightUpdate(uint8_t slot, float current, float target)
    {
        StaticJsonDocument<96> doc;
        doc["slot"] = slot;
        doc["current_weight"] = serialized(String(current, 2));
        doc["target_weight"] = serialized(String(target, 2));
        String body;
        serializeJson(doc, body);
        return _post("/api/arduino/weight-push", body);
    }

    // Called when a single spice finishes
    bool pushSpiceComplete(uint8_t slot, const char *spiceName,
                           float actual, float target,
                           const char *status, uint8_t slotIndex)
    {
        StaticJsonDocument<192> doc;
        doc["slot"] = slot;
        doc["spice_name"] = spiceName;
        doc["actual"] = serialized(String(actual, 2));
        doc["target"] = serialized(String(target, 2));
        doc["status"] = status; // "done" | "timeout" | "overload"
        doc["slot_index"] = slotIndex;
        String body;
        serializeJson(doc, body);
        return _post("/api/arduino/spice-complete", body);
    }

    // Called when all spices in the recipe are done
    bool pushSessionComplete(const char *recipeName)
    {
        StaticJsonDocument<96> doc;
        doc["recipe_name"] = recipeName;
        String body;
        serializeJson(doc, body);
        return _post("/api/arduino/session-complete", body);
    }

    // Called on fault
    bool pushFault(const char *message)
    {
        StaticJsonDocument<96> doc;
        doc["message"] = message;
        String body;
        serializeJson(doc, body);
        return _post("/api/arduino/fault", body);
    }

    // Called during carousel rotation
    bool pushIndexing(uint8_t slot, const char *spiceName,
                      uint8_t slotIndex, uint8_t totalSlots)
    {
        StaticJsonDocument<128> doc;
        doc["slot"] = slot;
        doc["spice_name"] = spiceName;
        doc["slot_index"] = slotIndex;
        doc["total_slots"] = totalSlots;
        String body;
        serializeJson(doc, body);
        return _post("/api/arduino/indexing", body);
    }

private:
    bool _connected;

    // _post() -- open a fresh TCP connection, send JSON, close immediately.
    // Returns true if the server replied 200.
    // Non-blocking on failure: 2s timeout, then gives up.
    bool _post(const char *path, const String &body)
    {
        if (!isConnected())
            return false;

        WiFiClient client;
        client.setTimeout(2000); // 2s connect + read timeout

        // FLASK_SERVER_HOST and FLASK_SERVER_PORT defined in Constants.h
        if (!client.connect(FLASK_SERVER_HOST, FLASK_SERVER_PORT))
        {
            Serial.print(F("[WiFi] Connect failed: "));
            Serial.println(path);
            return false;
        }

        // Send HTTP request
        client.print(F("POST "));
        client.print(path);
        client.println(F(" HTTP/1.1"));
        client.print(F("Host: "));
        client.println(FLASK_SERVER_HOST);
        client.println(F("Content-Type: application/json"));
        client.print(F("Content-Length: "));
        client.println(body.length());
        client.println(F("Connection: close"));
        client.println(); // blank line ends headers
        client.print(body);

        // Wait briefly for response (we just care about success/fail)
        uint32_t t = millis();
        while (!client.available() && millis() - t < 2000)
            delay(1);

        bool ok = false;
        if (client.available())
        {
            // Read just the status line: "HTTP/1.1 200 OK"
            String status = client.readStringUntil('\n');
            ok = status.indexOf("200") >= 0;
        }

        client.stop();
        return ok;
    }
};