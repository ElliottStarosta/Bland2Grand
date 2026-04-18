#pragma once
#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"
#include "Encoder.h"

class Carousel {
public:
    // Construction 
    explicit Carousel(Encoder& encoder)
        : _stepper(AccelStepper::DRIVER, PIN_CAROUSEL_STEP, PIN_CAROUSEL_DIR)
        , _encoder(encoder)
        , _currentSlot(1)
        , _homed(false)
    {}

    // begin() — call once in setup() 
    void begin() {
        _stepper.setMaxSpeed(INDEX_SPEED_STEPS_S);
        _stepper.setAcceleration(INDEX_SPEED_STEPS_S * 2.0f); // ramp-up/down in 0.5 index
        _stepper.setCurrentPosition(0);
    }

    // home() — blocking; runs until encoder reads MODULE_1_ANGLE 
    // MODULE_1_ANGLE must be measured empirically and stored as a constant.
    // The homing direction is clockwise (positive step direction).
    // Returns true on success.
    bool home() {
        _stepper.setMaxSpeed(HOMING_SPEED_STEPS_S);
        _stepper.setAcceleration(HOMING_SPEED_STEPS_S);

        // Rotate slowly until encoder reports the reference angle for slot 1.
        // Timeout after 2 full carousel revolutions' worth of motor steps.
        const long timeout_steps = static_cast<long>(STEPS_PER_REV * CAROUSEL_GEAR_RATIO * 2);
        long steps_taken = 0;

        while (steps_taken < timeout_steps) {
            if (_encoder.isAtTarget(MODULE_1_SHAFT_COUNTS)) {
                _stepper.setCurrentPosition(0);
                _currentSlot = 1;
                _homed       = true;
                // Restore normal speed
                _stepper.setMaxSpeed(INDEX_SPEED_STEPS_S);
                _stepper.setAcceleration(INDEX_SPEED_STEPS_S * 2.0f);
                delay(INDEX_SETTLE_MS);
                return true;
            }
            _stepper.runSpeed();
            _stepper.setSpeed(HOMING_SPEED_STEPS_S);  // keep speed set
            steps_taken++;
        }

        // Homing failed (magnet not detected or encoder disconnected)
        _stepper.setMaxSpeed(INDEX_SPEED_STEPS_S);
        _stepper.setAcceleration(INDEX_SPEED_STEPS_S * 2.0f);
        return false;
    }

    // indexTo(targetSlot) — blocking; returns true on success 
    // targetSlot is 1-based (1..8).
    // The carousel always rotates in the shorter direction (shortest arc).
    bool indexTo(uint8_t targetSlot) {
        if (targetSlot < 1 || targetSlot > CAROUSEL_SLOT_COUNT) return false;
        if (targetSlot == _currentSlot) {
            delay(INDEX_SETTLE_MS);
            return true;
        }

        // Compute the number of slot steps in the forward (positive) direction
        int8_t fwd = static_cast<int8_t>(targetSlot) - static_cast<int8_t>(_currentSlot);
        if (fwd < 0) fwd += static_cast<int8_t>(CAROUSEL_SLOT_COUNT);

        int8_t bwd = static_cast<int8_t>(CAROUSEL_SLOT_COUNT) - fwd;

        long stepsToMove;
        if (fwd <= bwd) {
            // Move forward (positive direction)
            stepsToMove = static_cast<long>(fwd) * static_cast<long>(STEPS_PER_SLOT);
        } else {
            // Move backward (negative direction) — shorter arc
            stepsToMove = -static_cast<long>(bwd) * static_cast<long>(STEPS_PER_SLOT);
        }

        // Command the move
        _stepper.setMaxSpeed(INDEX_SPEED_STEPS_S);
        _stepper.move(stepsToMove);

        // Run until move completes (blocking)
        while (_stepper.distanceToGo() != 0) {
            _stepper.run();
        }

        // Closed-loop correction 
        uint16_t targetShaftCounts = _slotToShaftCounts(targetSlot);
        for (uint8_t attempt = 0; attempt < 10; attempt++) {
            int16_t err = _encoder.signedError(targetShaftCounts);
            if (abs(err) <= static_cast<int16_t>(ENCODER_TOLERANCE_COUNTS)) break;
            // Issue single-microstep corrections
            _stepper.move(err > 0 ? 1 : -1);
            while (_stepper.distanceToGo() != 0) _stepper.run();
        }

        _currentSlot = targetSlot;
        delay(INDEX_SETTLE_MS);
        return _encoder.isAtTarget(targetShaftCounts);
    }

    // runService() — call from loop() for non-blocking operation 
    // (Currently all public methods are blocking, but kept for future async use)
    void runService() {
        _stepper.run();
    }

    // Accessors 
    uint8_t currentSlot() const { return _currentSlot; }
    bool    isHomed()     const { return _homed; }

    // The shaft encoder count corresponding to slot 1 (Module 1 reference)
    // IMPORTANT: This value must be measured by running the homing calibration
    //           utility sketch and replacing this constant with the observed value.
    static constexpr uint16_t MODULE_1_SHAFT_COUNTS = 512;  // ← CALIBRATE THIS VALUE

private:
    AccelStepper _stepper;
    Encoder&     _encoder;
    uint8_t      _currentSlot;
    bool         _homed;

    // Convert 1-based slot number to expected AS5600 encoder count on M1's shaft.
    // Slot 1 is the reference (MODULE_1_SHAFT_COUNTS).
    // Each subsequent slot adds ENCODER_COUNTS_PER_SLOT (= 1024) counts modulo 4096.
    uint16_t _slotToShaftCounts(uint8_t slot) const {
        uint32_t counts = MODULE_1_SHAFT_COUNTS
                        + static_cast<uint32_t>(slot - 1) * ENCODER_COUNTS_PER_SLOT;
        return static_cast<uint16_t>(counts % ENCODER_COUNTS_PER_REV);
    }
};