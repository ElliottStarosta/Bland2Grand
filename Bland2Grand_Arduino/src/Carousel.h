#pragma once
#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"
#include "Encoder.h"
#include "CarouselPosition.h"

class Carousel
{
public:
    explicit Carousel(Encoder &encoder)
        : _stepper(AccelStepper::DRIVER, PIN_CAROUSEL_STEP, PIN_CAROUSEL_DIR), _encoder(encoder), _currentSlot(1), _homed(false), _encoderFault(false)
    {
    }

    void begin()
    {
        _stepper.setMaxSpeed(INDEX_SPEED_STEPS_S);
        _stepper.setAcceleration(INDEX_SPEED_STEPS_S * 2.0f);
        _stepper.setCurrentPosition(0);

        // Attempt to restore last known position from EEPROM.
        // If valid, the machine can show its last slot even before homing.
        if (_pos.loadFromEEPROM())
        {
            _currentSlot = _pos.slot();
            // Restore AccelStepper's idea of where it is so step-based math
            // stays coherent even if we skip a full home cycle.
            _stepper.setCurrentPosition(_pos.stepPosition());
        }
    }
    bool home()
    {
        _stepper.setMaxSpeed(HOMING_SPEED_STEPS_S);
        _stepper.setAcceleration(HOMING_SPEED_STEPS_S);

        const long timeout_steps =
            static_cast<long>(STEPS_PER_REV * CAROUSEL_GEAR_RATIO * 2);
        long steps_taken = 0;

        while (steps_taken < timeout_steps)
        {
            if (_encoder.isAtTarget(MODULE_1_SHAFT_COUNTS))
            {
                _stepper.setCurrentPosition(0);
                _currentSlot = 1;
                _homed = true;
                _encoderFault = false;

                // Persist the freshly-homed reference
                _pos.saveToEEPROM(1,
                                  _encoder.rawAngle(),
                                  _stepper.currentPosition());

                _stepper.setMaxSpeed(INDEX_SPEED_STEPS_S);
                _stepper.setAcceleration(INDEX_SPEED_STEPS_S * 2.0f);
                delay(INDEX_SETTLE_MS);
                return true;
            }
            _stepper.runSpeed();
            _stepper.setSpeed(HOMING_SPEED_STEPS_S);
            steps_taken++;
        }

        _stepper.setMaxSpeed(INDEX_SPEED_STEPS_S);
        _stepper.setAcceleration(INDEX_SPEED_STEPS_S * 2.0f);
        return false;
    }

    // indexTo(targetSlot) -- blocking; returns true on success
    bool indexTo(uint8_t targetSlot)
    {
        if (targetSlot < 1 || targetSlot > CAROUSEL_SLOT_COUNT)
            return false;
        if (targetSlot == _currentSlot)
        {
            delay(INDEX_SETTLE_MS);
            return true;
        }

        int8_t fwd = static_cast<int8_t>(targetSlot) - static_cast<int8_t>(_currentSlot);
        if (fwd < 0)
            fwd += static_cast<int8_t>(CAROUSEL_SLOT_COUNT);
        int8_t bwd = static_cast<int8_t>(CAROUSEL_SLOT_COUNT) - fwd;

        long stepsToMove;
        if (fwd <= bwd)
        {
            stepsToMove = static_cast<long>(fwd) * static_cast<long>(STEPS_PER_SLOT);
        }
        else
        {
            stepsToMove = -static_cast<long>(bwd) * static_cast<long>(STEPS_PER_SLOT);
        }

        _stepper.setMaxSpeed(INDEX_SPEED_STEPS_S);
        _stepper.move(stepsToMove);
        while (_stepper.distanceToGo() != 0)
            _stepper.run();

        // Closed-loop correction
        uint16_t targetShaftCounts = _slotToShaftCounts(targetSlot);
        for (uint8_t attempt = 0; attempt < 10; attempt++)
        {
            int16_t err = _encoder.signedError(targetShaftCounts);
            if (abs(err) <= static_cast<int16_t>(ENCODER_TOLERANCE_COUNTS))
                break;
            _stepper.move(err > 0 ? 1 : -1);
            while (_stepper.distanceToGo() != 0)
                _stepper.run();
        }

        _currentSlot = targetSlot;
        delay(INDEX_SETTLE_MS);

        // Fuse encoder + steps to verify position, then persist
        bool fault = false;
        _pos.fusePosition(_encoder.rawAngle(),
                          _stepper.currentPosition(),
                          _encoder.isConnected(),
                          fault);
        _encoderFault = fault;

        // Always save: even if there's a fault we save the step-based position
        // so power-cycle recovery still has a reference point.
        _pos.saveToEEPROM(_currentSlot,
                          _encoder.rawAngle(),
                          _stepper.currentPosition());

        return _encoder.isAtTarget(targetShaftCounts) || !_encoderFault;
    }

    void runService() { _stepper.run(); }

    uint8_t currentSlot() const { return _currentSlot; }
    bool isHomed() const { return _homed; }
    bool hasEncoderFault() const { return _encoderFault; }


private:
    AccelStepper _stepper;
    Encoder &_encoder;
    CarouselPosition _pos;
    uint8_t _currentSlot;
    bool _homed;
    bool _encoderFault;

    uint16_t _slotToShaftCounts(uint8_t slot) const
    {
        uint32_t counts = MODULE_1_SHAFT_COUNTS + static_cast<uint32_t>(slot - 1) * ENCODER_COUNTS_PER_SLOT;
        return static_cast<uint16_t>(counts % ENCODER_COUNTS_PER_REV);
    }
};