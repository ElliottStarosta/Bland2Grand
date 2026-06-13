// USE_LOAD_CELL=1 uses the HX711 scale; 0 estimates weight from motor cycles.
#define USE_LOAD_CELL 1

#include <Arduino.h>
#include <WiFiS3.h>
#include <ArduinoJson.h>
#include <Arduino_LED_Matrix.h>
#include "Constants.h"
#include "WiFiComms.h"
#include "CarouselDriver.h"
#include "AugerDriver.h"

#if USE_LOAD_CELL
#include "Scale.h"
#endif

// WiFi credentials
static const char *WIFI_SSID = "bland2grand";
static const char *WIFI_PASSWORD = "password";

// LED Matrix frames
ArduinoLEDMatrix matrix;

static uint8_t FRAME_CHECK[8][12] = {
    {0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0},
    {0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0},
    {0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0},
    {0, 1, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0},
    {0, 1, 1, 0, 0, 0, 1, 1, 0, 0, 0, 0},
    {0, 0, 1, 1, 0, 1, 1, 0, 0, 0, 0, 0},
    {0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0},
    {0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0},
};

static uint8_t FRAME_X[8][12] = {
    {1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1},
    {0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0},
    {0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0},
    {0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0},
    {0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0},
    {0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0},
    {0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0},
    {1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1},
};

// Subsystem instances
WiFiComms wifi(WIFI_SSID, WIFI_PASSWORD);
CarouselDriver carousel(wifi);

#if USE_LOAD_CELL
Scale scale;
AugerDriver auger(wifi, scale);
#else
AugerDriver auger(wifi);
#endif

// Dispense state machine
enum class DispenseState
{
    IDLE,
    WAITING_FOR_BOWL,
    INDEXING,
    DISPENSING,
    PARKING,
    PUSH_COMPLETE,
    DONE
};

DispenseState dispenseState = DispenseState::IDLE;

// Holds the spice Flask asked for on the last accepted POST / request.
struct ActiveDispense
{
    uint8_t slot = 0;
    char spiceName[24] = {};
    char recipeName[48] = {};
    float targetGrams = 0.0f;
    uint8_t slotIdx = 0;
    uint8_t total = 1;
};

ActiveDispense active;
bool _bowlTared = false;

// State machine tick — called every loop()
void tickDispense()
{
    switch (dispenseState)
    {
    case DispenseState::IDLE:
        break;

    case DispenseState::INDEXING:
    {
#if USE_LOAD_CELL
        if (active.slotIdx == 0 && !_bowlTared)
        {
            float bowlWeight = scale.readStable();

            Serial.print(F("[Bowl] Scale reads: "));
            Serial.print(bowlWeight, 2);
            Serial.println(F("g"));

            if (bowlWeight < MIN_BOWL_WEIGHT_G)
            {
                Serial.println(F("[Bowl] No bowl detected — waiting..."));
                wifi.pushNoBowl();
                dispenseState = DispenseState::WAITING_FOR_BOWL;
                return;
            }

            Serial.println(F("[Bowl] Bowl confirmed — taring..."));
            scale.tare();
            _bowlTared = true;
            Serial.println(F("[Bowl] Tare complete."));
        }
        else if (active.slotIdx > 0)
        {
            Serial.println(F("[Bowl] Retaring for next slot..."));
            scale.tare();
            Serial.println(F("[Bowl] Retare complete."));
        }
#endif

        wifi.pushIndexing(active.slot, active.spiceName,
                          active.slotIdx, active.total);
        auger.enableCoils();
        carousel.goToSlot(active.slot, active.spiceName);
        auger.startDispense(active.slot, active.spiceName,
                            active.targetGrams,
                            active.slotIdx, active.total);
        dispenseState = DispenseState::DISPENSING;
        break;
    }

    case DispenseState::WAITING_FOR_BOWL:
    {
#if USE_LOAD_CELL
        float w = scale.read();

        Serial.print(F("[Bowl] Waiting... scale="));
        Serial.print(w, 2);
        Serial.println(F("g"));

        if (w >= MIN_BOWL_WEIGHT_G)
        {
            Serial.println(F("[Bowl] Bowl detected! Proceeding..."));
            wifi.pushBowlDetected();
            delay(200);
            dispenseState = DispenseState::INDEXING;
        }
#else
        dispenseState = DispenseState::INDEXING;
#endif
        break;
    }

    case DispenseState::DISPENSING:
    {
        static uint32_t lastStopCheck = 0;
        uint32_t now = millis();
        if (now - lastStopCheck >= 200)
        {
            lastStopCheck = now;
            if (wifi.checkStopUDP())
            {
                Serial.println(F("[CMD] STOP via UDP"));
                active.slotIdx = active.total - 1;
                dispenseState = DispenseState::PUSH_COMPLETE;
                break;
            }
        }
        if (auger.tickDispense())
        {
            auger.startPark();
            dispenseState = DispenseState::PARKING;
        }
        break;
    }

    case DispenseState::PARKING:
        if (auger.tickPark())
        {
            auger.finishPark();
            dispenseState = DispenseState::PUSH_COMPLETE;
        }
        break;

    case DispenseState::PUSH_COMPLETE:
        wifi.pushSpiceComplete(active.slot, active.spiceName,
                               active.targetGrams, active.targetGrams,
                               active.slotIdx);

        if (active.slotIdx + 1 >= active.total)
        {
            Serial.println(F("[CMD] All spices done."));
            wifi.pushSessionComplete(active.recipeName);
            Serial.println(F("[Carousel] Returning to slot 1..."));
            carousel.goToSlot(1);
            _bowlTared = false;

#if USE_LOAD_CELL
        // After session, tare with bowl+spice still on scale
        delay(500);
        scale.tare();
        Serial.println(F("[Bowl] Post-session tare. Waiting for bowl removal (watch for negative dip)..."));

        // Now poll — when bowl is removed, scale goes significantly negative
        // (bowl was tared out, so removing it = -173g raw, clamped but detectable via raw read)
        bool bowlRemoved = false;
        while (!bowlRemoved)
        {
            long raw = scale.rawRead(); // raw ADC, uncalibrated
            float w = scale.read();
            Serial.print(F("[Bowl] raw="));
            Serial.print(raw);
            Serial.print(F("  filtered="));
            Serial.println(w, 3);
            
            // When bowl is removed, the raw reading drops far below zero
            // rawRead() returns ADC counts; a 173g bowl at gain 128 is a large negative swing
            // Threshold: if filtered goes below -5g equivalent, bowl is gone
            // We can't use filtered (clamped to 0), so check raw directly
            // Raw counts: negative means below tare reference = bowl removed
            if (raw < 500000L) // large negative ADC count = bowl removed
            {
                bowlRemoved = true;
            }
            delay(200);
        }

        Serial.println(F("[Bowl] Bowl removed! Settling then retaring..."));
        delay(1000);
        scale.tare();
        Serial.println(F("[Bowl] Retared to empty scale. Ready for next session."));
#endif
        }
        dispenseState = DispenseState::IDLE;
        break;
    case DispenseState::DONE:
        dispenseState = DispenseState::IDLE;
        break;
    }
}

// Minimal HTTP server: GET /health, POST /stop, POST / (dispense command from Flask).
void handleIncomingRequest(WiFiClient &client)
{
    // Read headers
    String req;
    uint32_t t = millis();
    while (client.connected() && millis() - t < 2000)
    {
        if (client.available())
        {
            req += static_cast<char>(client.read());
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
        client.print(carousel.currentSlot());
        client.print(F(",\"busy\":"));
        client.print(dispenseState != DispenseState::IDLE ? "true" : "false");
        client.print(F(",\"load_cell\":"));
        client.print(USE_LOAD_CELL ? "true" : "false");
        client.println(F(",\"homed\":true}"));
        client.stop();
        Serial.println(F("[HTTP] Health check OK"));
        return;
    }

    if (req.startsWith("POST /stop"))
    {
        client.println(F("HTTP/1.1 200 OK"));
        client.println(F("Content-Type: application/json"));
        client.println(F("Connection: close\r\n"));
        client.println(F("{\"status\":\"stopped\"}"));
        client.stop();
        Serial.println(F("[CMD] STOP received — aborting dispense."));
        dispenseState = DispenseState::PUSH_COMPLETE;
        return;
    }

    if (!req.startsWith("POST /"))
    {
        client.println(F("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
        client.stop();
        return;
    }

    // Read body
    String body;
    uint32_t bt = millis();
    while (client.connected() && millis() - bt < 500)
    {
        while (client.available())
            body += static_cast<char>(client.read());
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
        Serial.println(F("[HTTP] Bad request — missing carousel or grams"));
        client.println(F("HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n"));
        client.stop();
        return;
    }

    // ACK immediately so Flask doesn't time out
    client.println(F("HTTP/1.1 200 OK"));
    client.println(F("Content-Type: application/json"));
    client.println(F("Connection: close\r\n"));
    client.println(F("{\"status\":\"accepted\"}"));
    client.stop();

    // Populate active dispense
    active.slot = doc["carousel"].as<uint8_t>();
    active.targetGrams = doc["grams"].as<float>();
    active.slotIdx = doc["slot_index"] | 0;
    active.total = doc["total_slots"] | 1;

    strncpy(active.recipeName, doc["recipe_name"] | "", sizeof(active.recipeName) - 1);
    strncpy(active.spiceName, doc["spice_name"] | "", sizeof(active.spiceName) - 1);
    active.recipeName[sizeof(active.recipeName) - 1] = '\0';
    active.spiceName[sizeof(active.spiceName) - 1] = '\0';

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
    // wifi.pushNoBowl(); // tell frontend to start on the waiting screen
}

// setup()
void setup()
{
    Serial.begin(9600);
    while (!Serial && millis() < 3000)
    {
    }

    matrix.begin();
    matrix.renderBitmap(FRAME_X, 8, 12); // show X until WiFi connects

#if USE_LOAD_CELL
    Serial.println(F("[boot] Bland2Grand - closed-loop (load cell)"));
#else
    Serial.println(F("[boot] Bland2Grand - dead-reckoning mode"));
#endif

    // Subsystems
    carousel.begin();
    auger.begin();

#if USE_LOAD_CELL
    if (!scale.begin())
        Serial.println(F("[WARN] HX711 not responding — check wiring."));
    else
        Serial.println(F("[OK] HX711 scale ready."));
#endif

    // WiFi
    wifi.connect();
    matrix.renderBitmap(FRAME_CHECK, 8, 12); // show checkmark on connect
    wifi.startServer();

    Serial.println(F("[boot] ready"));
}

void loop()
{
    // Always tick the state machine first (keeps motors smooth)
    tickDispense();

    // Only accept new commands when idle
    if (dispenseState == DispenseState::IDLE)
    {
        WiFiClient client = wifi.available();
        if (client)
        {
            Serial.println(F("[HTTP] Incoming connection..."));
            handleIncomingRequest(client);
        }
    }
}
