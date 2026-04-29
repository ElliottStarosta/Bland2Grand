#pragma once
#include <Arduino.h>
#include "Constants.h"
#include "Carousel.h"
#include "Auger.h"
#include "Scale.h"
#include "FlowModel.h"
#include "WiFiComm.h"

enum class State
{
    HOMING,
    IDLE,
    INDEXING,
    DISPENSING,
    DONE,
    FAULT
};

// Recipe slot -- holds everything needed for one spice dispense
struct RecipeSlot
{
    uint8_t slot1Based;         // 1-based carousel slot
    char name[24];              // spice name (matches Flask SPICE_SLOTS)
    float grams;                // target grams
    uint8_t indexInRecipe;      // 0-based position in this recipe
    uint8_t totalSlotsInRecipe; // total spices in this recipe
};

class StateMachine
{
public:
    StateMachine(Carousel &carousel, Auger &auger,
                 Scale &scale, FlowModel &model, WiFiComm &wifi)
        : _carousel(carousel), _auger(auger),
          _scale(scale), _model(model), _wifi(wifi),
          _state(State::HOMING),
          _pendingSlot(0), _pendingGrams(0.0f),
          _dispenseResult(DispenseResult::OK), _actualGrams(0.0f),
          _slotIndex(0), _totalSlots(0)
    {
        _recipeName[0] = '\0';
        _spiceName[0] = '\0';
    }

    void update()
    {
        switch (_state)
        {
        case State::HOMING:
            _handleHoming();
            break;
        case State::IDLE:
            _handleIdle();
            break;
        case State::INDEXING:
            _handleIndexing();
            break;
        case State::DISPENSING:
            _handleDispensing();
            break;
        case State::DONE:
            _handleDone();
            break;
        case State::FAULT:
            _handleFault();
            break;
        }
    }

    State currentState() const { return _state; }

private:
    Carousel &_carousel;
    Auger &_auger;
    Scale &_scale;
    FlowModel &_model;
    WiFiComm &_wifi;

    State _state;
    uint8_t _pendingSlot; // 1-based
    float _pendingGrams;
    char _recipeName[48];
    char _spiceName[24];
    uint8_t _slotIndex;  // 0-based index into recipe
    uint8_t _totalSlots; // total spices this recipe

    DispenseResult _dispenseResult;
    float _actualGrams;

    // HOMING
    void _handleHoming()
    {
        Serial.println(F("[SM] Homing carousel..."));
        bool ok = _carousel.home();
        if (ok)
        {
            Serial.println(F("[SM] Homing complete -> IDLE"));
            _transitionTo(State::IDLE);
        }
        else
        {
            Serial.println(F("[SM] FAULT: homing failed"));
            _wifi.pushFault("Carousel homing failed");
            _transitionTo(State::FAULT);
        }
    }

    // IDLE
    // Flask now sends a richer command:
    // POST / body: {
    // "carousel": N,
    // "grams": X.X,
    // "recipe_name": "Tacos al Pastor",
    // "spice_name": "Cumin",
    // "slot_index": 0,
    // "total_slots": 5
    // }
    void _handleIdle()
    {
        // We accept commands on a minimal HTTP server just for the dispense trigger.  All status goes back via push. Keep a tiny server for receiving the START command.
        WiFiServer &srv = _getServer();
        WiFiClient client = srv.available();
        if (!client)
            return;

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

        if (req.startsWith("GET /health"))
        {
            client.println(F("HTTP/1.1 200 OK"));
            client.println(F("Content-Type: application/json"));
            client.println(F("Connection: close\r\n"));
            client.print(F("{\"status\":\"ok\",\"slot\":"));
            client.print(_carousel.currentSlot());
            client.print(F(",\"homed\":"));
            client.print(_carousel.isHomed() ? "true" : "false");
            client.println(F("}"));
            client.stop();
            return;
        }

        if (req.startsWith("POST /"))
        {
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

            StaticJsonDocument<256> doc;
            if (deserializeJson(doc, body) == DeserializationError::Ok &&
                doc.containsKey("carousel") && doc.containsKey("grams"))
            {
                _pendingSlot = doc["carousel"].as<uint8_t>();
                _pendingGrams = doc["grams"].as<float>();
                _slotIndex = doc["slot_index"] | 0;
                _totalSlots = doc["total_slots"] | 1;

                const char *rn = doc["recipe_name"] | "";
                const char *sn = doc["spice_name"] | "";
                strncpy(_recipeName, rn, sizeof(_recipeName) - 1);
                strncpy(_spiceName, sn, sizeof(_spiceName) - 1);

                client.println(F("HTTP/1.1 200 OK"));
                client.println(F("Content-Type: application/json"));
                client.println(F("Connection: close\r\n"));
                client.println(F("{\"status\":\"accepted\"}"));
                client.stop();

                _transitionTo(State::INDEXING);
                return;
            }
        }

        client.println(F("HTTP/1.1 400 Bad Request"));
        client.println(F("Connection: close\r\n"));
        client.println(F("{\"error\":\"bad request\"}"));
        client.stop();
    }

    // INDEXING
    void _handleIndexing()
    {
        Serial.print(F("[SM] Indexing to slot "));
        Serial.println(_pendingSlot);

        // Push "rotating" status before we block on the move
        _wifi.pushIndexing(_pendingSlot, _spiceName, _slotIndex, _totalSlots);

        bool ok = _carousel.indexTo(_pendingSlot);
        if (!ok)
        {
            _wifi.pushFault("Carousel index failed");
            _transitionTo(State::FAULT);
            return;
        }

        _auger.enableCoils();
        _transitionTo(State::DISPENSING);
    }

    // DISPENSING
    void _handleDispensing()
    {
        uint8_t slot0 = _pendingSlot - 1;

        Serial.print(F("[SM] Dispensing "));
        Serial.print(_pendingGrams);
        Serial.println(F(" g..."));

        // Tell Flask/frontend we're starting this spice
        _wifi.pushDispenseStart(
            _pendingSlot, _spiceName,
            _pendingGrams, _slotIndex, _totalSlots);

        _dispenseResult = _auger.dispense(
            slot0, _pendingSlot, _spiceName,
            _pendingGrams, _actualGrams);

        _model.saveToEEPROM(slot0);

        Serial.print(F("[SM] Dispense done. actual="));
        Serial.print(_actualGrams);
        Serial.println(F("g"));

        _transitionTo(State::DONE);
    }

    // DONE
    void _handleDone()
    {
        const char *statusStr;
        switch (_dispenseResult)
        {
        case DispenseResult::OK:
            statusStr = "done";
            break;
        case DispenseResult::TIMEOUT:
            statusStr = "timeout";
            break;
        case DispenseResult::OVERLOAD:
            statusStr = "overload";
            break;
        default:
            statusStr = "error";
            break;
        }

        // Push this spice's result
        _wifi.pushSpiceComplete(
            _pendingSlot, _spiceName,
            _actualGrams, _pendingGrams,
            statusStr, _slotIndex);

        // If this was the last spice, push session complete
        if (_slotIndex + 1 >= _totalSlots)
        {
            _wifi.pushSessionComplete(_recipeName);
        }

        Serial.print(F("[SM] Done: "));
        Serial.println(statusStr);

        _transitionTo(State::IDLE);
    }

    // FAULT
    void _handleFault()
    {
        static bool faultSent = false;
        if (!faultSent)
        {
            _wifi.pushFault("Machine fault -- power cycle required");
            faultSent = true;
            Serial.println(F("[SM] FAULT -- power cycle required."));
        }
        delay(5000);
    }

    void _transitionTo(State next) { _state = next; }

    // Lazy-initialised server for receiving dispense commands
    WiFiServer &_getServer()
    {
        static WiFiServer server(HTTP_PORT);
        static bool started = false;
        if (!started)
        {
            server.begin();
            started = true;
        }
        return server;
    }
};