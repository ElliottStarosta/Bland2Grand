#pragma once
#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"
#include "Scale.h"
#include "FlowModel.h"
#include "WiFiComm.h"

enum class DispenseResult
{
    OK,
    TIMEOUT,
    OVERLOAD,
    SCALE_FAULT
};

class Auger
{
public:
    Auger(Scale &scale, FlowModel &model, WiFiComm &wifi)
        : _stepper(AccelStepper::DRIVER, PIN_AUGER_STEP, PIN_AUGER_DIR), _scale(scale), _model(model), _wifi(wifi)
    {
    }

    void begin()
    {
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
        _stepper.setCurrentPosition(0);
    }

    // slot:        0-based slot index (for FlowModel)
    // slot1Based:  1-based slot number (for WiFi push messages)
    // spiceName:   display name for status messages
    // targetGrams: mass to dispense
    // actual_g:    set on exit to final scale reading
    DispenseResult dispense(uint8_t slot, uint8_t slot1Based,
                            const char *spiceName,
                            float targetGrams, float &actual_g)
    {
        _scale.tare();
        float stopWeight = _model.predictStopWeight(slot, targetGrams);

        float currentWeight = 0.0f;
        float weightAtStart = 0.0f;
        bool firstRead = true;
        long cyclesCompleted = 0;
        long stepsInCycle = 0;
        long totalStepsDispensed = 0;

        uint32_t startTime = millis();
        uint32_t lastScalePoll = millis();
        uint32_t lastWifiPush = millis(); // non-static, resets each call

        _setAugerSpeed(0.0f, targetGrams);
        _stepper.setSpeed(AUGER_FULL_SPEED_STEPS_S);

        while (true)
        {
            _stepper.runSpeed();
            stepsInCycle++;
            totalStepsDispensed++;

            if (stepsInCycle >= static_cast<long>(STEPS_PER_AUGER_CYCLE))
            {
                stepsInCycle = 0;
                cyclesCompleted++;
            }

            uint32_t now = millis();

            // Push live weight to Flask every WIFI_PUSH_INTERVAL_MS
            if (now - lastWifiPush >= WIFI_PUSH_INTERVAL_MS)
            {
                lastWifiPush = now;
                _wifi.pushWeightUpdate(slot1Based, currentWeight, targetGrams);
            }

            // Poll scale every SCALE_POLL_MS
            if (now - lastScalePoll >= SCALE_POLL_MS)
            {
                if (!_scale.isReady())
                {
                    lastScalePoll = now;
                    continue;
                }

                lastScalePoll = now;
                currentWeight = _scale.read();

                if (firstRead)
                {
                    weightAtStart = currentWeight;
                    firstRead = false;
                }

                if (cyclesCompleted > 0 && currentWeight > 0.0f)
                {
                    _model.addObservation(slot,
                                          static_cast<float>(cyclesCompleted),
                                          currentWeight - weightAtStart);
                }

                if (_scale.isOverloaded())
                {
                    _stopAndPurge(totalStepsDispensed);
                    actual_g = _scale.read();
                    return DispenseResult::OVERLOAD;
                }

                _setAugerSpeed(currentWeight, targetGrams);

                if (currentWeight >= stopWeight)
                {
                    _stopAndPurge(totalStepsDispensed);
                    delay(300);
                    actual_g = _scale.read();
                    float coast = actual_g - currentWeight;
                    if (coast > 0.0f)
                    {
                        _model.recordCoast(slot, coast);
                        _model.saveToEEPROM(slot);
                    }
                    return DispenseResult::OK;
                }
            }

            if (millis() - startTime > DISPENSE_TIMEOUT_MS)
            {
                _stopAndPurge(totalStepsDispensed);
                actual_g = _scale.read();
                return DispenseResult::TIMEOUT;
            }
        }
    }

    void runService() { _stepper.run(); }
    void disableCoils() { _stepper.disableOutputs(); }
    void enableCoils() { _stepper.enableOutputs(); }

private:
    AccelStepper _stepper;
    Scale &_scale;
    FlowModel &_model;
    WiFiComm &_wifi;

    // Three-stage closed-loop speed ramp based on weight ratio
    void _setAugerSpeed(float current, float target)
    {
        float ratio = (target > 0.0f) ? (current / target) : 0.0f;
        float speedFraction;

        if (ratio < RAMP_STAGE2_THRESHOLD)
            speedFraction = RAMP_SPEED_STAGE1; // 100 %
        else if (ratio < RAMP_STAGE3_THRESHOLD)
            speedFraction = RAMP_SPEED_STAGE2; //  50 %
        else
            speedFraction = RAMP_SPEED_STAGE3; //  15 %

        float speed = AUGER_FULL_SPEED_STEPS_S * speedFraction;
        _stepper.setMaxSpeed(speed);
        _stepper.setSpeed(speed);
    }

    // Hard stop, reverse the exact number of steps taken, then disable coils.
    // Reversing the dispensed step count sweeps powder back up the helix and
    // re-parks the toothless arc of the half-spur gear (mechanical cutoff).
    void _stopAndPurge(long stepsToReverse)
    {
        _stepper.stop();
        while (_stepper.distanceToGo() != 0)
            _stepper.run();

        if (stepsToReverse > 0)
        {
            _stepper.setMaxSpeed(BACK_PURGE_SPEED_STEPS_S);
            _stepper.setAcceleration(BACK_PURGE_SPEED_STEPS_S * 2.0f);
            _stepper.move(-stepsToReverse);
            while (_stepper.distanceToGo() != 0)
                _stepper.run();
        }

        // Restore forward settings for next dispense
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);

        delay(AUGER_COIL_DISABLE_DELAY_MS);
        disableCoils();
    }
};