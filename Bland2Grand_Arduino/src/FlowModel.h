#pragma once
#include <Arduino.h>
#include <EEPROM.h>
#include "Constants.h"

static constexpr uint8_t EEPROM_SLOT_STRIDE = 16; //bytes per slot in EEPROM

struct SlotModel
{
    float slope = 1.0f; //g / auger cycle (default 1 g/cycle = conservative)
    float intercept = 0.0f; //g at cycle 0
    float coast_g = 0.3f; //estimated in-flight grams (default 0.3 g)
    uint32_t n_samples = 0; //total data points used for regression

    //Online least-squares accumulators (not persisted -- rebuilt on boot)
    double sum_x = 0.0;
    double sum_y = 0.0;
    double sum_xx = 0.0;
    double sum_xy = 0.0;
    uint32_t n_acc = 0;
};

class FlowModel
{
public:
    FlowModel() {}

    //begin() -- load models from EEPROM 
    void begin()
    {
        for (uint8_t slot = 0; slot < CAROUSEL_SLOT_COUNT; slot++)
        {
            _loadFromEEPROM(slot);
        }
    }

    //addObservation() -- call after each complete auger cycle 
    //slot:   0-based slot index
    //cycles: total auger cycles completed so far in this dispense
    //weight: weight currently in bowl (grams)
    void addObservation(uint8_t slot, float cycles, float weight)
    {
        if (slot >= CAROUSEL_SLOT_COUNT)
            return;
        SlotModel &m = _models[slot];

        double x = static_cast<double>(cycles);
        double y = static_cast<double>(weight);

        m.sum_x += x;
        m.sum_y += y;
        m.sum_xx += x * x;
        m.sum_xy += x * y;
        m.n_acc++;

        //Need at least 2 points for a meaningful line
        if (m.n_acc >= 2)
        {
            double denom = (double)m.n_acc * m.sum_xx - m.sum_x * m.sum_x;
            if (fabs(denom) > 1e-9)
            {
                m.slope = static_cast<float>(((double)m.n_acc * m.sum_xy - m.sum_x * m.sum_y) / denom);
                m.intercept = static_cast<float>((m.sum_y - m.slope * m.sum_x) / (double)m.n_acc);
            }
        }

        m.n_samples++;
    }

    //recordCoast() -- call after dispense stops, with the measured overshoot
    //coast_measured: (actual_weight - weight_at_stop_command), in grams.
    //Stored as exponential moving average (α = 0.3) for stability.
    void recordCoast(uint8_t slot, float coast_measured)
    {
        if (slot >= CAROUSEL_SLOT_COUNT)
            return;
        constexpr float ALPHA = 0.30f;
        SlotModel &m = _models[slot];
        m.coast_g = ALPHA * coast_measured + (1.0f - ALPHA) * m.coast_g;
        //Clamp to reasonable range
        m.coast_g = constrain(m.coast_g, 0.0f, MAX_COAST_GRAMS);
    }

    //predictStopWeight() -- effective target weight to send stop command
    //The motor is stopped when weight >= predictStopWeight(), so that in-flight
    //spice brings the final reading to exactly targetGrams.
    float predictStopWeight(uint8_t slot, float targetGrams) const
    {
        if (slot >= CAROUSEL_SLOT_COUNT)
            return targetGrams;
        float coast = _models[slot].coast_g;
        float stop = targetGrams - coast;
        //Never go below 80% of target (safety guard for bad coast estimates)
        return max(stop, targetGrams * 0.80f);
    }

    //cyclesNeeded() -- how many more auger cycles to reach remaining grams
    //Returns a large number if slope is invalid / not yet calibrated.
    float cyclesNeeded(uint8_t slot, float remainingGrams) const
    {
        if (slot >= CAROUSEL_SLOT_COUNT)
            return 9999.0f;
        float s = _models[slot].slope;
        if (s <= 0.001f)
            return 9999.0f;
        return remainingGrams / s;
    }

    //isCalibrated() -- true if the model has at least CALIB_POINTS_MIN data points
    bool isCalibrated(uint8_t slot) const
    {
        if (slot >= CAROUSEL_SLOT_COUNT)
            return false;
        return _models[slot].n_samples >= CALIB_POINTS_MIN;
    }

    //slope() / coast() -- accessors 
    float getSlope(uint8_t slot) const { return (slot < CAROUSEL_SLOT_COUNT) ? _models[slot].slope : 1.0f; }
    float getCoast(uint8_t slot) const { return (slot < CAROUSEL_SLOT_COUNT) ? _models[slot].coast_g : 0.3f; }
    uint32_t getSamples(uint8_t slot) const { return (slot < CAROUSEL_SLOT_COUNT) ? _models[slot].n_samples : 0; }

    //saveToEEPROM() -- persist a single slot's model 
    void saveToEEPROM(uint8_t slot)
    {
        if (slot >= CAROUSEL_SLOT_COUNT)
            return;
        uint16_t addr = EEPROM_BASE_ADDR + slot * EEPROM_SLOT_STRIDE;
        const SlotModel &m = _models[slot];
        EEPROM.put(addr, m.slope);
        EEPROM.put(addr + 4, m.intercept);
        EEPROM.put(addr + 8, m.coast_g);
        EEPROM.put(addr + 12, m.n_samples);
    }

    //resetSlot() -- clear all learning for one slot (after refill etc.) 
    void resetSlot(uint8_t slot)
    {
        if (slot >= CAROUSEL_SLOT_COUNT)
            return;
        _models[slot] = SlotModel{};
        saveToEEPROM(slot);
    }

private:
    SlotModel _models[CAROUSEL_SLOT_COUNT];

    void _loadFromEEPROM(uint8_t slot)
    {
        uint16_t addr = EEPROM_BASE_ADDR + slot * EEPROM_SLOT_STRIDE;
        SlotModel &m = _models[slot];

        float s, i, c;
        uint32_t n;
        EEPROM.get(addr, s);
        EEPROM.get(addr + 4, i);
        EEPROM.get(addr + 8, c);
        EEPROM.get(addr + 12, n);

        //Validate: NaN / Inf / obviously wrong values -> use defaults
        bool valid = !isnan(s) && !isinf(s) && s > 0.001f && s < 50.0f && !isnan(i) && !isinf(i) && !isnan(c) && !isinf(c) && c >= 0.0f && c <= MAX_COAST_GRAMS;

        if (valid)
        {
            m.slope = s;
            m.intercept = i;
            m.coast_g = c;
            m.n_samples = n;
        }
        else
        {
            m = SlotModel{}; //defaults
        }
    }
};