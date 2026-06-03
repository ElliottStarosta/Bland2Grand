#pragma once
#include <Arduino.h>
#include <HX711.h>
#include "Constants.h"

class Scale
{
public:
    Scale() : _lastWeight(0.0f), _ready(false) {}

    // Call once in setup(). Blocks until HX711 is responding,
    bool begin(uint32_t timeoutMs = 5000)
    {
        _hx711.begin(PIN_HX711_DOUT, PIN_HX711_SCK);
        _hx711.set_gain(128); // channel A, gain 128

        uint32_t t = millis();
        while (!_hx711.is_ready())
        {
            if (millis() - t > timeoutMs)
            {
                _ready = false;
                return false;
            }
            delay(10);
        }

        _hx711.set_scale(SCALE_CAL_FACTOR);
        _ready = true;

        tare();
        return true;
    }

    // Zero the scale. Waits for settle then takes SCALE_AVG_SAMPLES readings.
    void tare()
    {
        delay(TARE_SETTLE_MS);
        _waitReady();
        _hx711.tare(SCALE_AVG_SAMPLES);
        _lastWeight = 0.0f;
    }

    // Calibrated gram reading, averaged over SCALE_AVG_SAMPLES.
    // Returns the last known value if HX711 is mid-conversion (non-blocking).
    float read()
    {
        if (!_hx711.is_ready())
            return _lastWeight;

        float w = _readMedian(SCALE_AVG_SAMPLES);
        if (w < 0.0f)
            w = 0.0f;
        _lastWeight = w;
        return w;
    }
    // Single raw ADC sample (no calibration, no averaging).
    // Used by the calibration sketch to find calFactor.
    long rawRead()
    {
        _waitReady();
        return _hx711.read_average(SCALE_AVG_SAMPLES);
    }

    // Override the calibration factor at runtime.
    // Normally not needed — SCALE_CAL_FACTOR in Constants.h is used.
    void setCalFactor(float factor)
    {
        if (factor != 0.0f)
            _hx711.set_scale(factor);
    }

    // True if HX711 is ready for a new conversion right now.
    bool isReady()
    {
        return _hx711.is_ready();
    }

    // True if begin() completed successfully.
    bool isConnected() const
    {
        return _ready;
    }

    // True if the last reading exceeded the safe overload threshold.
    bool isOverloaded()
    {
        return read() > SCALE_OVERLOAD_G;
    }

    // Last gram reading without triggering a new conversion.
    float lastWeight() const { return _lastWeight; }

private:
    HX711 _hx711;
    float _lastWeight;
    bool _ready;

    // Block until HX711 signals a conversion is ready.
    void _waitReady()
    {
        while (!_hx711.is_ready())
            delay(5);
    }

    float _readMedian(uint8_t n)
    {
        if (n % 2 == 0)
            n++;
        if (n > 15)
            n = 15;

        float samples[15];
        for (uint8_t i = 0; i < n; i++)
        {
            // Wait for a fresh conversion
            _waitReady();
            samples[i] = _hx711.get_units(1);

            // Let DOUT go HIGH (busy) before polling again.
            // Without this, is_ready() can fire on the same conversion twice.
            delay(1);
        }

        // insertion sort
        for (uint8_t i = 1; i < n; i++)
        {
            float key = samples[i];
            int8_t j = i - 1;
            while (j >= 0 && samples[j] > key)
            {
                samples[j + 1] = samples[j];
                j--;
            }
            samples[j + 1] = key;
        }

        return samples[n / 2];
    }
};