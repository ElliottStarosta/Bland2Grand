#pragma once

#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"
#include "WiFiComms.h"

class CarouselDriver
{
public:
    explicit CarouselDriver(WiFiComms &wifi)
        : _stepper(AccelStepper::DRIVER, PIN_CAROUSEL_STEP, PIN_CAROUSEL_DIR),
          _wifi(wifi),
          _currentSlot(1) {}

    void begin()
    {
        _stepper.setMaxSpeed(INDEX_SPEED_STEPS_S);
        _stepper.setAcceleration(INDEX_ACCEL_STEPS_S2);
        _stepper.setCurrentPosition(0);
        Serial.println(F("[Carousel] Initialised. Assumed slot 1."));
    }

    bool goToSlot(uint8_t target)
    {
        if (target < 1 || target > CAROUSEL_SLOT_COUNT)
        {
            Serial.print(F("[Carousel] ERROR: invalid slot "));
            Serial.println(target);
            return false;
        }

        if (target == _currentSlot)
        {
            Serial.println(F("[Carousel] Already at target slot."));
            _wifi.pushNearlyThere(_currentSlot, "");
            delay(INDEX_SETTLE_MS);
            return true;
        }

        // CCW ONLY (increasing slot numbers)
        int8_t fwd = target - _currentSlot;
        if (fwd < 0)
            fwd += CAROUSEL_SLOT_COUNT; // wrap around

        long steps = (long)fwd * (long)STEPS_PER_SLOT + STEPS_PER_SLOT_CORRECTION;

        Serial.print(F("[Carousel] Moving CCW to slot "));
        Serial.print(target);
        Serial.print(F(" ("));
        Serial.print(fwd);
        Serial.print(F(" slots, "));
        Serial.print(steps);
        Serial.println(F(" steps)"));

        _stepper.move(steps);
        while (_stepper.distanceToGo() != 0)
            _stepper.run();

        _currentSlot = target;

        _wifi.pushNearlyThere(_currentSlot, "");
        delay(INDEX_SETTLE_MS);

        Serial.print(F("[Carousel] Arrived at slot "));
        Serial.println(_currentSlot);
        return true;
    }

    bool goToSlot(uint8_t target, const char *spiceName)
    {
        if (target < 1 || target > CAROUSEL_SLOT_COUNT)
        {
            Serial.print(F("[Carousel] ERROR: invalid slot "));
            Serial.println(target);
            return false;
        }

        if (target == _currentSlot)
        {
            Serial.println(F("[Carousel] Already at target slot."));
            _wifi.pushNearlyThere(_currentSlot, spiceName);
            delay(INDEX_SETTLE_MS);
            return true;
        }

        // CCW ONLY
        int8_t fwd = target - _currentSlot;
        if (fwd < 0)
            fwd += CAROUSEL_SLOT_COUNT;

        long steps = (long)fwd * (long)STEPS_PER_SLOT + STEPS_PER_SLOT_CORRECTION;

        Serial.print(F("[Carousel] Moving CCW to slot "));
        Serial.print(target);
        Serial.print(F(" ("));
        Serial.print(fwd);
        Serial.print(F(" slots, "));
        Serial.print(steps);
        Serial.println(F(" steps)"));

        _stepper.move(steps);
        while (_stepper.distanceToGo() != 0)
            _stepper.run();

        _currentSlot = target;

        _wifi.pushNearlyThere(_currentSlot, spiceName);
        delay(INDEX_SETTLE_MS);

        Serial.print(F("[Carousel] Arrived at slot "));
        Serial.println(_currentSlot);
        return true;
    }

    uint8_t currentSlot() const { return _currentSlot; }

private:
    AccelStepper _stepper;
    WiFiComms &_wifi;
    uint8_t _currentSlot;
};