#pragma once
#include <Arduino.h>
#include "Constants.h"

//Forward-declare the HX711 driver (bogde/HX711)
#include <HX711.h>

class Scale
{
public:
    //Construction
    Scale() : _calFactor(1.0f), _lastWeight(0.0f) {}

    //begin() — call once in setup()
    void begin()
    {
        _hx711.begin(PIN_HX711_DOUT, PIN_HX711_SCK);
        //Select 10 SPS mode: RATE pin tied to GND externally; SKC pulse count selects channel A gain 128
        _hx711.set_gain(128);
        //Wait for first conversion
        while (!_hx711.is_ready())
        {
            delay(10);
        }
        //Perform an initial tare
        tare();
    }

    //setCalFactor() — units: raw ADC counts per gram
    void setCalFactor(float factor)
    {
        if (factor > 0.0f)
        {
            _calFactor = factor;
            _hx711.set_scale(_calFactor);
        }
    }

    float getCalFactor() const { return _calFactor; }

    //tare() — wait for sensor to settle, then zero
    void tare()
    {
        delay(TARE_SETTLE_MS);
        while (!_hx711.is_ready())
        {
            delay(10);
        }
        _hx711.tare(SCALE_AVG_SAMPLES);
        _lastWeight = 0.0f;
    }

    //read() — return gram-accurate averaged reading
    //Returns 0.0 if the sensor is not ready (non-blocking guard).
    float read()
    {
        if (!_hx711.is_ready())
        {
            return _lastWeight; //return stale value rather than blocking
        }
        float w = _hx711.get_units(SCALE_AVG_SAMPLES);
        //Clamp negatives from noise to zero
        if (w < 0.0f)
            w = 0.0f;
        _lastWeight = w;
        return w;
    }

    //rawRead() — single-sample read for calibration routines
    long rawRead()
    {
        while (!_hx711.is_ready())
            delay(5);
        return _hx711.read_average(SCALE_AVG_SAMPLES);
    }

    //isReady()
    bool isReady()
    {
        return _hx711.is_ready();
    }

    //isOverloaded()
    bool isOverloaded()
    {
        return read() > SCALE_OVERLOAD_G;
    }

private:
    HX711 _hx711;
    float _calFactor;
    float _lastWeight;
};