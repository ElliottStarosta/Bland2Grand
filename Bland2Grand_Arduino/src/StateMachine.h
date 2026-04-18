#pragma once
#include <Arduino.h>
#include "Constants.h"
#include "Carousel.h"
#include "Auger.h"
#include "Scale.h"
#include "Encoder.h"
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

class StateMachine
{
public:
    StateMachine(Carousel &carousel, Auger &auger, Scale &scale, FlowModel &model, WiFiComm &wifi)
        : _carousel(carousel), _auger(auger), _scale(scale), _model(model), _wifi(wifi), _state(State::HOMING), _pendingSlot(0), _pendingGrams(0.0f), _lastCommandTime(0), _dispenseResult(DispenseResult::OK), _actualGrams(0.0f)
    {
    }

    // update() — call every loop() iteration
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
    uint32_t _lastCommandTime;
    DispenseResult _dispenseResult;
    float _actualGrams;
    Command _pendingCmd;

    // HOMING
    void _handleHoming()
    {
        Serial.println(F("[SM] Homing carousel..."));
        bool ok = _carousel.home();
        if (ok)
        {
            Serial.println(F("[SM] Homing complete → IDLE"));
            _transitionTo(State::IDLE);
        }
        else
        {
            Serial.println(F("[SM] FAULT: homing failed"));
            _transitionTo(State::FAULT);
        }
    }

    // IDLE
    void _handleIdle()
    {
        // Watchdog: if last command was long ago and we somehow got stuck, re-home
        //(Only applies if we've seen at least one command)
        //(Handled conservatively — don't re-home on first boot)

        Command cmd;
        if (!_wifi.poll(cmd))
            return;

        _lastCommandTime = millis();

        // Health check
        if (cmd.isHealth)
        {
            _wifi.sendHealthResponse(_carousel.currentSlot(), _carousel.isHomed());
            return;
        }

        // Model info
        if (cmd.isModelInfo)
        {
            uint8_t s = cmd.diagSlot - 1; // to 0-based
            _wifi.sendModelInfoResponse(
                cmd.diagSlot,
                _model.getSlope(s),
                _model.getCoast(s),
                _model.getSamples(s));
            return;
        }

        // Reset model
        if (cmd.isResetModel)
        {
            uint8_t s = cmd.diagSlot - 1;
            _model.resetSlot(s);
            Serial.print(F("[SM] Reset model for slot "));
            Serial.println(cmd.diagSlot);
            _wifi.sendOkResponse();
            return;
        }

        // Dispense command
        if (cmd.valid)
        {
            _pendingSlot = cmd.carousel;
            _pendingGrams = cmd.grams;
            _pendingCmd = cmd;
            Serial.print(F("[SM] Dispense → slot "));
            Serial.print(_pendingSlot);
            Serial.print(F("  grams "));
            Serial.println(_pendingGrams);
            _transitionTo(State::INDEXING);
        }
    }

    // INDEXING
    void _handleIndexing()
    {
        Serial.print(F("[SM] Indexing to slot "));
        Serial.println(_pendingSlot);

        bool ok = _carousel.indexTo(_pendingSlot);
        if (!ok)
        {
            Serial.println(F("[SM] FAULT: index failed"));
            _transitionTo(State::FAULT);
            return;
        }

        Serial.println(F("[SM] Index OK → DISPENSING"));
        _auger.enableCoils();
        _transitionTo(State::DISPENSING);
    }

    // DISPENSING
    void _handleDispensing()
    {
        uint8_t slot0 = _pendingSlot - 1; // 0-based for FlowModel

        Serial.print(F("[SM] Dispensing "));
        Serial.print(_pendingGrams);
        Serial.println(F(" g..."));

        _dispenseResult = _auger.dispense(slot0, _pendingGrams, _actualGrams);

        // Save updated regression model to EEPROM
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

        _wifi.sendDispenseResponse(statusStr, _actualGrams);

        Serial.print(F("[SM] Response sent: "));
        Serial.println(statusStr);

        _transitionTo(State::IDLE);
    }

    // FAULT
    void _handleFault()
    {
        // Attempt to send fault to Flask, then wait for manual reset (power cycle)
        static bool faultSent = false;
        if (!faultSent)
        {
            _wifi.sendDispenseResponse("fault", 0.0f);
            faultSent = true;
            Serial.println(F("[SM] FAULT state — power cycle required."));
        }
        delay(5000); // Prevent busy-loop; fault stays here until power cycle
    }

    // _transitionTo()
    void _transitionTo(State next)
    {
        _state = next;
    }
};