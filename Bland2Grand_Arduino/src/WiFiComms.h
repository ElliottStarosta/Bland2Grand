#pragma once
// WiFiComms - WiFi setup, HTTP server on :80, and outbound pushes to Flask.
// Weight updates go over UDP so we don't block the auger step loop.

#include <Arduino.h>
#include <WiFiS3.h>
#include <WiFiUdp.h>
#include <ArduinoJson.h>
#include "Constants.h"

class WiFiComms
{
public:
    WiFiComms(const char *ssid, const char *password)
        : _ssid(ssid), _password(password), _server(HTTP_PORT), _serverStarted(false) {}

    bool connect()
    {
        // Static IP on the bland2grand hotspot so Flask can reach us at a fixed address.
        IPAddress local_IP(192, 168, 137, 50);
        IPAddress gateway(192, 168, 137, 1);
        IPAddress subnet(255, 255, 255, 0);
        WiFi.config(local_IP, gateway, subnet);

        Serial.print(F("[WiFi] Connecting to "));
        Serial.print(_ssid);
        Serial.print(F("..."));

        WiFi.disconnect();
        delay(1000);
        WiFi.begin(_ssid, _password);

        while (WiFi.status() != WL_CONNECTED)
        {
            delay(500);
            Serial.print('.');
        }

        Serial.println(F(" connected!"));
        Serial.print(F("[WiFi] Arduino IP: "));
        Serial.println(WiFi.localIP());

        if (_stopUdp.begin(8889))
            Serial.println(F("[UDP] stop socket ready on 8889"));

        // Outbound weight packets to Flask UDP listener (port 5001 on the PC).
        if (_udp.begin(8888))
        {
            Serial.println(F("[UDP] socket ready"));
        }
        else
        {
            Serial.println(F("[UDP] socket FAILED"));
        }

        return true;
    }

    // Start HTTP server, call after connect()
    void startServer()
    {
        _server.begin();
        _serverStarted = true;
        Serial.println(F("[HTTP] Server started on port 80. Ready."));
    }

    // Returns a connected client if one exists. Only call when you're ready to handle a request.
    WiFiClient available()
    {
        return _serverStarted ? _server.available() : WiFiClient();
    }

    bool isConnected() const
    {
        return WiFi.status() == WL_CONNECTED;
    }

    // Outbound event pushes to Flask (blocking HTTP — call only when motors are idle).

    // Carousel has started moving to the requested slot.
    bool pushIndexing(uint8_t slot, const char *spiceName,
                      uint8_t slotIdx, uint8_t total)
    {
        StaticJsonDocument<128> doc;
        doc["slot"] = slot;
        doc["spice_name"] = spiceName;
        doc["slot_index"] = slotIdx;
        doc["total_slots"] = total;
        String b;
        serializeJson(doc, b);
        return _post("/api/arduino/indexing", b);
    }

    // Carousel is one slot away; UI can prep the next animation beat.
    bool pushNearlyThere(uint8_t slot, const char *spiceName)
    {
        StaticJsonDocument<128> doc;
        doc["slot"] = slot;
        doc["spice_name"] = spiceName;
        String b;
        serializeJson(doc, b);
        return _post("/api/arduino/nearly-there", b);
    }

    // Auger has started; includes target weight for the progress bar.
    bool pushDispenseStart(uint8_t slot, const char *spiceName,
                           float targetGrams, uint8_t slotIdx, uint8_t total)
    {
        StaticJsonDocument<192> doc;
        doc["slot"] = slot;
        doc["spice_name"] = spiceName;
        doc["target_weight"] = serialized(String(targetGrams, 2));
        doc["slot_index"] = slotIdx;
        doc["total_slots"] = total;
        String b;
        serializeJson(doc, b);
        return _post("/api/arduino/dispense-start", b);
    }

    // Blocking weight push — use pushWeightUDP() during motor moves instead
    bool pushWeightUpdate(uint8_t slot, float current, float target)
    {
        StaticJsonDocument<96> doc;
        doc["slot"] = slot;
        doc["current_weight"] = serialized(String(current, 2));
        doc["target_weight"] = serialized(String(target, 2));
        String b;
        serializeJson(doc, b);
        return _post("/api/arduino/weight-push", b);
    }

    // Unblocks Flask dispense loop — must fire once per accepted spice command.
    bool pushSpiceComplete(uint8_t slot, const char *spiceName,
                           float actual, float target, uint8_t slotIdx)
    {
        StaticJsonDocument<192> doc;
        doc["slot"] = slot;
        doc["spice_name"] = spiceName;
        doc["actual"] = serialized(String(actual, 2));
        doc["target"] = serialized(String(target, 2));
        doc["status"] = "done";
        doc["slot_index"] = slotIdx;
        String b;
        serializeJson(doc, b);
        return _post("/api/arduino/spice-complete", b);
    }

    // Listens for STOP from Flask/backend cancel (port 8889).
    bool checkStopUDP()
    {
        int size = _stopUdp.parsePacket();
        if (size > 0)
        {
            char buf[32];
            int n = _stopUdp.read(buf, sizeof(buf) - 1);
            buf[n] = '\0';
            Serial.print(F("[UDP] stop socket got: "));
            Serial.println(buf);
            if (strstr(buf, "STOP"))
                return true;
        }
        return false;
    }

    bool pushNoBowl()
    {
        StaticJsonDocument<64> doc;
        doc["status"] = "no_bowl";
        String b;
        serializeJson(doc, b);
        return _post("/api/arduino/no-bowl", b);
    }

    bool pushBowlDetected()
    {
        StaticJsonDocument<64> doc;
        doc["status"] = "bowl_detected";
        String b;
        serializeJson(doc, b);
        return _post("/api/arduino/bowl-detected", b);
    }

    bool pushSessionComplete(const char *recipeName)
    {
        StaticJsonDocument<96> doc;
        doc["recipe_name"] = recipeName;
        String b;
        serializeJson(doc, b);
        return _post("/api/arduino/session-complete", b);
    }

    bool pushFault(const char *message)
    {
        StaticJsonDocument<96> doc;
        doc["message"] = message;
        String b;
        serializeJson(doc, b);
        return _post("/api/arduino/fault", b);
    }

    // Sends a weight update via UDP so no TCP handshake stalls the stepper loop.
    void pushWeightUDP(uint8_t slot, float current, float target)
    {
        char buf[80];

        int n = snprintf(buf, sizeof(buf),
                         "{\"slot\":%d,\"current_weight\":%.2f,\"target_weight\":%.2f}",
                         slot, current, target);

        // Serial.print(F("[UDP] "));
        // Serial.println(buf);

        if (_udp.beginPacket(FLASK_SERVER_HOST, 5001))
        {
            _udp.write((uint8_t *)buf, n);

            int ok = _udp.endPacket();

            // Serial.print(F("[UDP] sent="));
            // Serial.println(ok);
        }
        else
        {
            Serial.println(F("[UDP] beginPacket failed"));
        }
    }
    // Burst of fake progress updates — blocking, called after motors stop to animate the app progress bar smoothly.
    void pushProgressBurst(uint8_t slot, float targetGrams, uint8_t steps = 8)
    {
        for (uint8_t i = 1; i <= steps; i++)
        {
            float progress = targetGrams * (static_cast<float>(i) / steps);
            pushWeightUpdate(slot, progress, targetGrams);
            delay(40);
        }
    }

private:
    const char *_ssid;
    const char *_password;
    WiFiServer _server;
    WiFiUDP _udp;
    WiFiUDP _stopUdp;
    bool _serverStarted;

    // Low-level POST to Flask; waits up to 2 s for a 200 response.
    bool _post(const char *path, const String &body)
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
};