#pragma once
#include <Arduino.h>
#include <WiFiS3.h>
#include <ArduinoJson.h>
#include "Constants.h"

struct Command
{
    bool valid = false;
    uint8_t carousel = 0; // 1-based slot
    float grams = 0.0f;
    // Diagnostic commands
    bool isHealth = false;
    bool isResetModel = false;
    bool isModelInfo = false;
    uint8_t diagSlot = 0;
    bool isWeightQuery = false;
};

class WiFiComm
{
public:
    WiFiComm() : _server(HTTP_PORT), _connected(false), _client() {}

    // begin() — connect to WiFi and start server
    // ssid / password must be provided.  Returns true if connected.
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

        if (WiFi.status() != WL_CONNECTED)
        {
            return false;
        }

        _server.begin();
        _connected = true;
        return true;
    }

    bool isConnected() const { return _connected && WiFi.status() == WL_CONNECTED; }

    // Print IP to Serial for debugging
    void printIP() const
    {
        Serial.print(F("Arduino IP: "));
        Serial.println(WiFi.localIP());
    }

    void sendWeightResponse(float weight)
    {
        StaticJsonDocument<64> doc;
        doc["weight"] = serialized(String(weight, 2));
        String body;
        serializeJson(doc, body);
        _sendJSON(200, body);
    }

    // poll() — call every loop(); returns true when a command is ready
    // Fills cmd with the parsed request.
    bool poll(Command &cmd)
    {
        cmd = Command{};

        WiFiClient newClient = _server.available();
        if (!newClient)
            return false;

        _client = newClient;

        // Read the HTTP request line (timeout 2 s)
        String requestLine = "";
        uint32_t t = millis();
        while (_client.connected() && millis() - t < 2000)
        {
            if (_client.available())
            {
                char c = _client.read();
                requestLine += c;
                // We only need the first line and headers; stop at blank line before body
                if (requestLine.endsWith("\r\n\r\n"))
                    break;
            }
        }

        // Health check (GET /health)
        if (requestLine.startsWith("GET /health"))
        {
            cmd.valid = true;
            cmd.isHealth = true;
            return true;
        }

        // Model info (GET /model-info?slot=N)
        if (requestLine.startsWith("GET /model-info"))
        {
            int slotPos = requestLine.indexOf("slot=");
            if (slotPos >= 0)
            {
                cmd.diagSlot = requestLine.substring(slotPos + 5).toInt();
                cmd.isModelInfo = true;
                cmd.valid = true;
            }
            return cmd.valid;
        }

        // POST /reset-model  body: {"slot": N}
        if (requestLine.startsWith("POST /reset-model"))
        {
            String body = _readBody();
            StaticJsonDocument<64> doc;
            if (deserializeJson(doc, body) == DeserializationError::Ok)
            {
                cmd.diagSlot = doc["slot"].as<uint8_t>();
                cmd.isResetModel = true;
                cmd.valid = true;
            }
            return cmd.valid;
        }

        // POST /  body: {"carousel": N, "grams": X.X}
        if (requestLine.startsWith("POST /"))
        {
            String body = _readBody();
            StaticJsonDocument<128> doc;
            if (deserializeJson(doc, body) != DeserializationError::Ok)
                return false;
            if (!doc.containsKey("carousel") || !doc.containsKey("grams"))
                return false;

            cmd.carousel = doc["carousel"].as<uint8_t>();
            cmd.grams = doc["grams"].as<float>();

            if (cmd.carousel < 1 || cmd.carousel > CAROUSEL_SLOT_COUNT)
                return false;
            if (cmd.grams <= 0.0f || cmd.grams > SCALE_CAPACITY_G)
                return false;

            cmd.valid = true;
            return true;
        }

        // GET /weight — returns current scale reading (call anytime during dispense)
        if (requestLine.startsWith("GET /weight"))
        {
            cmd.valid = true;
            cmd.isWeightQuery = true;
            return true;
        }

        // Unknown or unsupported request — send 400
        _send400();
        return false;
    }

    // sendDispenseResponse() — send the dispense result JSON
    void sendDispenseResponse(const char *status, float actual)
    {
        StaticJsonDocument<128> doc;
        doc["status"] = status;
        doc["actual"] = serialized(String(actual, 2));

        String body;
        serializeJson(doc, body);
        _sendJSON(200, body);
    }

    // sendHealthResponse()
    void sendHealthResponse(uint8_t slot, bool homed)
    {
        StaticJsonDocument<128> doc;
        doc["status"] = "ok";
        doc["slot"] = slot;
        doc["homed"] = homed;
        String body;
        serializeJson(doc, body);
        _sendJSON(200, body);
    }

    // sendModelInfoResponse()
    void sendModelInfoResponse(uint8_t slot, float slope, float coast, uint32_t n)
    {
        StaticJsonDocument<128> doc;
        doc["slot"] = slot;
        doc["slope"] = serialized(String(slope, 4));
        doc["coast_g"] = serialized(String(coast, 3));
        doc["n_samples"] = n;
        String body;
        serializeJson(doc, body);
        _sendJSON(200, body);
    }

    // sendOkResponse()
    void sendOkResponse()
    {
        _sendJSON(200, "{\"status\":\"ok\"}");
    }

private:
    WiFiServer _server;
    bool _connected;
    WiFiClient _client;

    String _readBody()
    {
        String body = "";
        uint32_t t = millis();
        // Body follows after the headers (which we already read above in poll())
        // Read any remaining bytes within a 500 ms window
        while (_client.connected() && millis() - t < 500)
        {
            while (_client.available())
            {
                body += (char)_client.read();
            }
            if (body.length() > 0)
                break;
            delay(5);
        }
        return body;
    }

    void _sendJSON(int code, const String &body)
    {
        if (!_client)
            return;
        String status = (code == 200) ? "200 OK" : "400 Bad Request";
        _client.print(F("HTTP/1.1 "));
        _client.println(status);
        _client.println(F("Content-Type: application/json"));
        _client.print(F("Content-Length: "));
        _client.println(body.length());
        _client.println(F("Connection: close"));
        _client.println();
        _client.print(body);
        delay(10);
        _client.stop();
    }

    void _send400()
    {
        _sendJSON(400, "{\"error\":\"bad request\"}");
    }
};