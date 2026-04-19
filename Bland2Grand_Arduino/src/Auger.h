#pragma once
#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"
#include "Scale.h"
#include "FlowModel.h"

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
    //Construction
    Auger(Scale &scale, FlowModel &model)
        : _stepper(AccelStepper::DRIVER, PIN_AUGER_STEP, PIN_AUGER_DIR), _scale(scale), _model(model)
    {
    }

    //begin() — call once in setup()
    void begin()
    {
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
        _stepper.setCurrentPosition(0);
        //Keep motor energised at all times (ENA− tied to GND externally)
    }

    //dispense() — blocking; returns DispenseResult
    //slot (0-based): used to look up the FlowModel.
    //targetGrams: mass to dispense into the bowl.
    //On exit, actual_g is set to the final scale reading.
    DispenseResult dispense(uint8_t slot, float targetGrams, float& actual_g) {
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

        _setAugerSpeed(0.0f, targetGrams);
        _stepper.setSpeed(AUGER_FULL_SPEED_STEPS_S);

        while (true) {
            _stepper.runSpeed();
            stepsInCycle++;
            totalStepsDispensed++;

            if (stepsInCycle >= static_cast<long>(STEPS_PER_AUGER_CYCLE)) {
                stepsInCycle = 0;
                cyclesCompleted++;
            }

            uint32_t now = millis();
            if (now - lastScalePoll >= SCALE_POLL_MS) {
                if (!_scale.isReady()) {
                    lastScalePoll = now;
                    continue;
                }

                lastScalePoll = now;
                currentWeight = _scale.read();

                if (firstRead) {
                    weightAtStart = currentWeight;
                    firstRead = false;
                }

                if (cyclesCompleted > 0 && currentWeight > 0.0f) {
                    _model.addObservation(slot,
                                        static_cast<float>(cyclesCompleted),
                                        currentWeight - weightAtStart);
                }

                if (_scale.isOverloaded()) {
                    _stopAndPurge(totalStepsDispensed);
                    actual_g = _scale.read();
                    return DispenseResult::OVERLOAD;
                }

                _setAugerSpeed(currentWeight, targetGrams);

                if (currentWeight >= stopWeight) {
                    _stopAndPurge(totalStepsDispensed);

                    delay(300);
                    actual_g = _scale.read();
                    float coast = actual_g - currentWeight;
                    if (coast > 0.0f) {
                        _model.recordCoast(slot, coast);
                        _model.saveToEEPROM(slot);
                    }
                    return DispenseResult::OK;
                }
            }

            if (millis() - startTime > DISPENSE_TIMEOUT_MS) {
                _stopAndPurge(totalStepsDispensed);
                actual_g = _scale.read();
                return DispenseResult::TIMEOUT;
            }
        }
    }

    void _stopAndPurge(long stepsToReverse) {
    // Hard stop
    _stepper.stop();
    while (_stepper.distanceToGo() != 0)
        _stepper.run();

    // Reverse exactly as many steps as were used during the dispense.
    // Because the half-spur gear teeth cover exactly 180° (= 1 auger cycle =
    // STEPS_PER_AUGER_CYCLE steps), reversing the exact step count sweeps the
    // same powder back up the helix and re-parks the toothless arc in the same
    // angular position it started from — restoring the mechanical cutoff.
    if (stepsToReverse > 0) {
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
    //runService() — call from loop() for non-blocking background stepping
    void runService()
    {
        _stepper.run();
    }

    //disableCoils() — cut coil current during idle periods
    void disableCoils()
    {
        _stepper.disableOutputs();
    }

    //enableCoils() — re-energise before next dispense
    void enableCoils()
    {
        _stepper.enableOutputs();
    }

private:
    AccelStepper _stepper;
    Scale &_scale;
    FlowModel &_model;

    //_setAugerSpeed() — apply three-stage ramp-down
    void _setAugerSpeed(float current, float target)
    {
        float ratio = (target > 0.0f) ? (current / target) : 0.0f;
        float speedFraction;

        if (ratio < RAMP_STAGE2_THRESHOLD)
        {
            speedFraction = RAMP_SPEED_STAGE1; //100%
        }
        else if (ratio < RAMP_STAGE3_THRESHOLD)
        {
            speedFraction = RAMP_SPEED_STAGE2; //50%
        }
        else
        {
            speedFraction = RAMP_SPEED_STAGE3; //15%
        }

        float speed = AUGER_FULL_SPEED_STEPS_S * speedFraction;
        _stepper.setMaxSpeed(speed);
        _stepper.setSpeed(speed);
    }

    //_stopAndPurge() — stop motor, run back-purge, disable coils
    void _stopAndPurge(uint8_t slot, long cyclesCompleted)
    {
        //Immediate stop
        _stepper.stop();
        while (_stepper.distanceToGo() != 0)
            _stepper.run();

        //Back-purge: reverse BACK_PURGE_STEPS at moderate speed
        //The half-gear engagement means reverse motion will pull the auger
        //helix backwards, sweeping residual powder back up into the container.
        //We reverse exactly 1 full revolution so the toothless arc re-parks
        //facing the container gear (providing positive mechanical cutoff).
        _stepper.setMaxSpeed(BACK_PURGE_SPEED_STEPS_S);
        _stepper.setAcceleration(BACK_PURGE_SPEED_STEPS_S * 2.0f);
        _stepper.move(-static_cast<long>(BACK_PURGE_STEPS));
        while (_stepper.distanceToGo() != 0)
            _stepper.run();

        //Restore forward acceleration setting for next dispense
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);

        //Disable coils after settle delay to reduce heat
        delay(AUGER_COIL_DISABLE_DELAY_MS);
        disableCoils();
    }
};