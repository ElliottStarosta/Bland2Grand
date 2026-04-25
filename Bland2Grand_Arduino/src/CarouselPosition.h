#pragma once
#include <Arduino.h>
#include <EEPROM.h>
#include "Constants.h"
#include "Encoder.h"

// EEPROM layout (lives just after FlowModel's 64 bytes)
// Addr 64..79 (16 bytes):
//   uint8_t  slot          (1-based, 1..8)         — byte 0
//   uint16_t encoderCounts (last known raw angle)   — bytes 1-2
//   int32_t  stepPosition  (AccelStepper position)  — bytes 3-6
//   uint8_t  magic         (0xA5 = valid record)    — byte 7
//   uint8_t  padding[8]                             — bytes 8-15
static constexpr uint16_t CAROUSEL_POS_EEPROM_ADDR = 64;
static constexpr uint8_t CAROUSEL_POS_MAGIC = 0xA5;

// How far encoder and step-derived positions may disagree before we trust
// only the encoder (in encoder counts, ~1 slot = 1024 counts).
// If the discrepancy is larger than this we assume the encoder has failed.
static constexpr uint16_t ENCODER_STEP_AGREE_COUNTS = 200; // ~18° at the shaft

struct SavedCarouselPos
{
    uint8_t slot;
    uint16_t encoderCounts;
    int32_t stepPosition;
    uint8_t magic;
};

class CarouselPosition
{
public:
    CarouselPosition() {}

    // Call once on boot, before homing, to load any saved state
    bool loadFromEEPROM()
    {
        SavedCarouselPos rec;
        EEPROM.get(CAROUSEL_POS_EEPROM_ADDR, rec);
        if (rec.magic != CAROUSEL_POS_MAGIC)
            return false;
        if (rec.slot < 1 || rec.slot > CAROUSEL_SLOT_COUNT)
            return false;
        _slot = rec.slot;
        _encoderCounts = rec.encoderCounts;
        _stepPosition = rec.stepPosition;
        _valid = true;
        return true;
    }

    void saveToEEPROM(uint8_t slot, uint16_t encoderCounts, int32_t stepPosition)
    {
        SavedCarouselPos rec;
        rec.slot = slot;
        rec.encoderCounts = encoderCounts;
        rec.stepPosition = stepPosition;
        rec.magic = CAROUSEL_POS_MAGIC;
        EEPROM.put(CAROUSEL_POS_EEPROM_ADDR, rec);
        _slot = slot;
        _encoderCounts = encoderCounts;
        _stepPosition = stepPosition;
        _valid = true;
    }

    void invalidate()
    {
        SavedCarouselPos rec{}; // zeroes magic
        EEPROM.put(CAROUSEL_POS_EEPROM_ADDR, rec);
        _valid = false;
    }

    bool isValid() const { return _valid; }
    uint8_t slot() const { return _slot; }
    uint16_t encoderCounts() const { return _encoderCounts; }
    int32_t stepPosition() const { return _stepPosition; }

    // Fuse encoder + step-derived position into a best-estimate slot.
    // encoderRaw   — current AS5600 rawAngle() reading (0..4095), or 0xFFFF if disconnected
    // currentSteps — AccelStepper::currentPosition() right now
    // encoderOk    — pass encoder.isConnected()
    // Returns the trusted slot (1-based), and sets encoderFault if disagreement is severe.
    uint8_t fusePosition(uint16_t encoderRaw,
                         int32_t currentSteps,
                         bool encoderOk,
                         bool &encoderFault)
    {
        encoderFault = false;
        if (!_valid)
            return 0; // no reference at all

        if (!encoderOk)
        {
            encoderFault = true;
            return _slotFromSteps(currentSteps);
        }

        // Derive slot from encoder reading
        uint8_t encoderSlot = _slotFromEncoderCounts(encoderRaw);
        // Derive slot from step position relative to last save
        uint8_t stepSlot = _slotFromSteps(currentSteps);

        if (encoderSlot == stepSlot)
        {
            return encoderSlot; // Both agree — all good
        }

        // Disagreement — check magnitude
        uint16_t delta = _encoderDiff(encoderRaw, _slotToShaftCounts(encoderSlot));
        if (delta > ENCODER_STEP_AGREE_COUNTS)
        {
            // Encoder value is far from ANY slot center — likely fault
            encoderFault = true;
            return stepSlot;
        }

        // Minor disagreement — trust encoder (it is more accurate)
        return encoderSlot;
    }

private:
    bool _valid = false;
    uint8_t _slot = 1;
    uint16_t _encoderCounts = 0;
    int32_t _stepPosition = 0;

    // Convert 1-based slot → expected shaft encoder counts
    static uint16_t _slotToShaftCounts(uint8_t slot)
    {
        uint32_t c = MODULE_1_SHAFT_COUNTS + static_cast<uint32_t>(slot - 1) * ENCODER_COUNTS_PER_SLOT;
        return static_cast<uint16_t>(c % ENCODER_COUNTS_PER_REV);
    }

    // Nearest slot from an encoder reading
    static uint8_t _slotFromEncoderCounts(uint16_t raw)
    {
        uint8_t best = 1;
        uint16_t bestErr = 0xFFFF;
        for (uint8_t s = 1; s <= CAROUSEL_SLOT_COUNT; s++)
        {
            uint16_t err = _encoderDiff(raw, _slotToShaftCounts(s));
            if (err < bestErr)
            {
                bestErr = err;
                best = s;
            }
        }
        return best;
    }

    // Nearest slot from an absolute step count relative to saved reference
    uint8_t _slotFromSteps(int32_t currentSteps) const
    {
        int32_t delta = currentSteps - _stepPosition;
        // Each slot = STEPS_PER_SLOT motor microsteps
        int32_t slotDelta = delta / static_cast<int32_t>(STEPS_PER_SLOT);
        int32_t raw = static_cast<int32_t>(_slot) + slotDelta;
        // Wrap into 1..CAROUSEL_SLOT_COUNT
        raw = ((raw - 1) % static_cast<int32_t>(CAROUSEL_SLOT_COUNT) + static_cast<int32_t>(CAROUSEL_SLOT_COUNT)) % static_cast<int32_t>(CAROUSEL_SLOT_COUNT) + 1;
        return static_cast<uint8_t>(raw);
    }

    // Signed-shortest-path difference between two encoder readings, unsigned magnitude
    static uint16_t _encoderDiff(uint16_t a, uint16_t b)
    {
        int16_t d = static_cast<int16_t>(a) - static_cast<int16_t>(b);
        if (d > static_cast<int16_t>(ENCODER_COUNTS_PER_REV / 2))
            d -= static_cast<int16_t>(ENCODER_COUNTS_PER_REV);
        if (d < -static_cast<int16_t>(ENCODER_COUNTS_PER_REV / 2))
            d += static_cast<int16_t>(ENCODER_COUNTS_PER_REV);
        return static_cast<uint16_t>(abs(d));
    }
};