#pragma once

#include <Arduino.h>
#include <HX711.h>
#include "Constants.h"

class Scale
{
public:
    Scale() : _lastWeight(0.0f), _filteredWeight(0.0f), _ready(false) {}

    bool begin(uint32_t timeoutMs = 5000)
    {
        _hx711.begin(PIN_HX711_DOUT, PIN_HX711_SCK);
        _hx711.set_gain(128);

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

        // Always tare on boot — the scale must be empty at startup.
        // If a bowl is already on it, readings will be wrong until the
        // INDEXING tare runs. That's acceptable — bowl detection uses
        // MIN_BOWL_WEIGHT_G which is 20g, well above noise.
        _hx711.tare(SCALE_AVG_SAMPLES);
        _lastWeight = 0.0f;
        _filteredWeight = 0.0f;

        return true;
    }

    // Tare with settle wait + EMA flush.
    // Call this AFTER bowl is confirmed on scale.
    void tare()
    {
        // Wait for physical oscillation to die down
        delay(2000);

        // Take the zero reference
        _waitReady();
        _hx711.tare(SCALE_AVG_SAMPLES);

        // Hard-reset EMA so old weight doesn't bleed through
        _lastWeight = 0.0f;
        _filteredWeight = 0.0f;

        // Flush: read 5 real samples to confirm near-zero
        // (don't update EMA — just discard to let HX711 settle)
        for (uint8_t i = 0; i < 5; i++)
        {
            _waitReady();
            _hx711.get_units(1);
            delay(50);
        }

        // Final hard reset
        _lastWeight = 0.0f;
        _filteredWeight = 0.0f;

        Serial.print(F("[Scale] Post-tare check: "));
        Serial.print(_hx711.get_units(3), 3);
        Serial.println(F("g (raw, should be ~0)"));
    }

    // Non-blocking read with EMA filtering.
    // Returns last known value if HX711 not ready yet.
    float read()
    {
        if (!_hx711.is_ready())
            return _lastWeight;

        float raw = _hx711.get_units(1); // single fast read

        // EMA filter
        _filteredWeight += ALPHA * (raw - _filteredWeight);

        // Clamp negatives to 0
        float w = max(0.0f, _filteredWeight);

        _lastWeight = w;
        return w;
    }

    // Blocking stable read — waits for SETTLE_READS consecutive
    // readings within STABLE_BAND_G. Max wait 2s.
    float readStable()
    {
        float prev = read();
        uint8_t count = 1;
        uint32_t deadline = millis() + 2000;

        while (count < SETTLE_READS && millis() < deadline)
        {
            delay(SCALE_POLL_MS);
            float cur = read();
            if (fabsf(cur - prev) <= STABLE_BAND_G)
                count++;
            else
                count = 1;
            prev = cur;
        }
        return prev;
    }

    long rawRead()
    {
        _waitReady();
        return _hx711.read_average(SCALE_AVG_SAMPLES);
    }

    void setCalFactor(float factor)
    {
        if (factor != 0.0f)
            _hx711.set_scale(factor);
    }

    bool isReady()      { return _hx711.is_ready(); }
    bool isConnected()  const { return _ready; }
    bool isOverloaded() { return read() > SCALE_OVERLOAD_G; }
    float lastWeight()  const { return _lastWeight; }

private:
    HX711 _hx711;
    float _lastWeight;
    float _filteredWeight;
    bool  _ready;

    static constexpr float ALPHA = 0.6f; // balanced: fast response, not too noisy

    void _waitReady()
    {
        while (!_hx711.is_ready())
            delay(5);
    }
};