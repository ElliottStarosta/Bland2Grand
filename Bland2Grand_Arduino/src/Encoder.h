#pragma once
#include <Arduino.h>
#include <AS5600.h> // RobTillaart/AS5600
#include "Constants.h"

class Encoder
{
public:
    Encoder() : _connected(false) {}

    //begin() -- call from setup()
    bool begin()
    {
        _enc.begin();
        //Verify connection: AS5600 should return a non-zero status
        //(status bit 0x20 = magnet detected)
        delay(50); //allow chip to settle
        _connected = (_enc.getAddress() != 0) || (_enc.isConnected());
        if (!_connected)
        {
            //Try once more after a short wait
            delay(200);
            _connected = _enc.isConnected();
        }
        return _connected;
    }

    bool isConnected() const { return _connected; }

    //rawAngle() -- 0..4095 counts (full 360° of shaft)
    uint16_t rawAngle()
    {
        return static_cast<uint16_t>(_enc.rawAngle() & 0x0FFF);
    }

    // isAtTarget() -- returns true if |measured - target| ≤ tolerance
    // Handles the 0/4095 wraparound.
    bool isAtTarget(uint16_t targetCounts)
    {
        uint16_t current = rawAngle();
        int16_t diff = static_cast<int16_t>(current) - static_cast<int16_t>(targetCounts);
        // Adjust for wraparound
        if (diff > static_cast<int16_t>(ENCODER_COUNTS_PER_REV / 2))
            diff -= static_cast<int16_t>(ENCODER_COUNTS_PER_REV);
        if (diff < -static_cast<int16_t>(ENCODER_COUNTS_PER_REV / 2))
            diff += static_cast<int16_t>(ENCODER_COUNTS_PER_REV);
        return abs(diff) <= static_cast<int16_t>(ENCODER_TOLERANCE_COUNTS);
    }

    // signedError() -- current − target, range −2047..2047
    int16_t signedError(uint16_t targetCounts)
    {
        uint16_t current = rawAngle();
        int16_t diff = static_cast<int16_t>(current) - static_cast<int16_t>(targetCounts);
        if (diff > static_cast<int16_t>(ENCODER_COUNTS_PER_REV / 2))
            diff -= static_cast<int16_t>(ENCODER_COUNTS_PER_REV);
        if (diff < -static_cast<int16_t>(ENCODER_COUNTS_PER_REV / 2))
            diff += static_cast<int16_t>(ENCODER_COUNTS_PER_REV);
        return diff;
    }

    // Unit converters
    static uint16_t degreesToCounts(float degrees)
    {
        return static_cast<uint16_t>(degrees / 360.0f * ENCODER_COUNTS_PER_REV + 0.5f);
    }

    static float countsToDegrees(uint16_t counts)
    {
        return static_cast<float>(counts) / ENCODER_COUNTS_PER_REV * 360.0f;
    }

private:
    AS5600 _enc;
    bool _connected;
};