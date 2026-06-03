#pragma once
// ============================================================
//  AugerDriver.h  —  Bland2Grand
//
//  Auger dispense with two modes toggled at compile time:
//
//    #define USE_LOAD_CELL 1   — closed-loop (HX711 feedback)
//    #define USE_LOAD_CELL 0   — dead-reckoning (cycle count only)
//
//  Dead-reckoning mode:
//    Uses GRAMS_PER_REV[slot] from Constants.h to estimate cycles.
//    Sends fake UDP progress so the app bar animates.
//    Advances a half-rev forward after dispensing to park the toothless arc.
//
//  Load-cell mode (3 phases):
//    Phase 1 — BULK:  Run at full speed until ~COAST_UNDERSHOOT_RATIO
//                     of target (default 85%). Coarse delivery.
//    Phase 2 — SETTLE: Stop completely, wait SETTLE_READS scale reads
//                      for in-flight spice to land. Measure actual weight.
//    Phase 3 — NUDGE:  Dispense one TAP_CYCLES auger cycles at a time,
//                      settle after each, until target is hit.
//                      Each per-slot coast EMA shrinks tap size over time.
//
//  Clump handling:
//    Because spice can bridge and then release a bolus, we never try to
//    arrive at target in one shot. Instead we always stop short (Phase 1),
//    let in-flight material land (Phase 2), then top up in controlled
//    micro-taps (Phase 3). Even a large clump release during Phase 3 only
//    adds at most TAP_CYCLES worth of grams per tap, so overshoot is bounded.
//
//  Depends on: WiFiComms, Constants
//  Load-cell mode also depends on: Scale (Scale.h)
// ============================================================

#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"
#include "WiFiComms.h"

// -------------------------------------------------------
//  Toggle here — or #define before #include in main.cpp
// -------------------------------------------------------
#ifndef USE_LOAD_CELL
#define USE_LOAD_CELL 0
#endif

#if USE_LOAD_CELL
#include "Scale.h"
#endif

// -------------------------------------------------------
//  Clump / overshoot tuning constants
// -------------------------------------------------------

// Phase 1 stops at this fraction of target weight.
// In-flight + clump release must not exceed the remainder.
// 0.85 = stop when we've dispensed 85% by cycle count; top-up handles the rest.
static constexpr float COAST_UNDERSHOOT_RATIO = 0.85f;

// Phase 3: how many auger cycles per nudge tap.
// Smaller = finer control but more settle delays.
// 1 cycle ≈ GRAMS_PER_REV[slot] grams per tap.
static constexpr uint8_t TAP_CYCLES = 1;

// Phase 2/3: how many consecutive stable scale reads before we trust the weight.
// Stability = successive readings within STABLE_BAND_G of each other.
static constexpr uint8_t SETTLE_READS = 4;
static constexpr float STABLE_BAND_G = 0.15f;

// Maximum nudge taps before giving up (prevents infinite loop on stuck auger).
static constexpr uint8_t MAX_TAPS = 30;

// Per-slot coast EMA: how fast the coast estimate adapts (0=never, 1=instant).
static constexpr float COAST_ALPHA = 0.30f;

// Safety: if a single tap delivers more than this many grams, flag it as a clump.
// Useful for Serial diagnostics; does not abort the dispense.
static constexpr float CLUMP_WARN_G = 0.5f;

class AugerDriver
{
public:
#if USE_LOAD_CELL
    AugerDriver(WiFiComms &wifi, Scale &scale)
        : _stepper(AccelStepper::DRIVER, PIN_AUGER_STEP, PIN_AUGER_DIR),
          _wifi(wifi), _scale(scale)
    {
        // Initialise per-slot coast estimates from GRAMS_PER_REV defaults
        for (uint8_t s = 1; s <= CAROUSEL_SLOT_COUNT; s++)
            _coastEma[s] = GRAMS_PER_REV[s] * 0.20f; // 20% of a rev as initial coast guess
    }
#else
    explicit AugerDriver(WiFiComms &wifi)
        : _stepper(AccelStepper::DRIVER, PIN_AUGER_STEP, PIN_AUGER_DIR),
          _wifi(wifi) {}
#endif

    // -------------------------------------------------------
    //  begin() — call once in setup()
    // -------------------------------------------------------
    void begin()
    {
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
        _stepper.setCurrentPosition(0);
        _stepper.disableOutputs();
        Serial.println(F("[Auger] Initialised."));
#if USE_LOAD_CELL
        Serial.println(F("[Auger] Mode: CLOSED-LOOP  (bulk -> settle -> nudge)"));
#else
        Serial.println(F("[Auger] Mode: DEAD-RECKONING  (GRAMS_PER_REV per slot)"));
#endif
    }

    void enableCoils() { _stepper.enableOutputs(); }
    void disableCoils() { _stepper.disableOutputs(); }

    // -------------------------------------------------------
    //  Non-blocking interface (use from a state machine):
    //
    //    startDispense()
    //    loop: tickDispense()  — returns true when fwd done
    //    startPurge()
    //    loop: tickPark()      — returns true when park done
    //    finishPurge()
    // -------------------------------------------------------
    void startDispense(uint8_t slot, const char *spiceName,
                       float targetGrams, uint8_t slotIdx, uint8_t total)
    {
        _slot = slot;
        _targetGrams = targetGrams;
        _lastPushMs = millis();

        _wifi.pushDispenseStart(slot, spiceName, targetGrams, slotIdx, total);

#if USE_LOAD_CELL
        _scale.tare();
        _dispensePhase = Phase::BULK;
        _tapCount = 0;

        // Phase 1 bulk: run until COAST_UNDERSHOOT_RATIO of target BY CYCLE COUNT
        // (not by weight — scale isn't reliable mid-rotation due to vibration)
        float gramsPerCycle = GRAMS_PER_REV[slot];
        float bulkGrams = targetGrams * COAST_UNDERSHOOT_RATIO;
        long bulkCycles = max(1L, static_cast<long>(roundf(bulkGrams / gramsPerCycle)));
        _totalSteps = bulkCycles * static_cast<long>(STEPS_PER_AUGER_CYCLE);

        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
        _stepper.move(_totalSteps);

        Serial.print(F("[Auger] Bulk phase: "));
        Serial.print(bulkCycles);
        Serial.print(F(" cycles to ~"));
        Serial.print(bulkGrams, 2);
        Serial.println(F("g"));
#else
        // Dead-reckoning: use per-slot grams/rev from Constants.h
        float gramsPerCycle = GRAMS_PER_REV[slot];
        long cycles = max(1L, static_cast<long>(roundf(targetGrams / gramsPerCycle)));
        _totalSteps = cycles * static_cast<long>(STEPS_PER_AUGER_CYCLE);

        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
        _stepper.move(_totalSteps);

        Serial.print(F("[Auger] Dead-reckoning: "));
        Serial.print(cycles);

        Serial.print(F(" cycles ("));
        Serial.print(gramsPerCycle, 3);
        Serial.println(F(" g/rev for this slot)"));
#endif
    }

    // Returns true when the forward dispense phase is complete
    bool tickDispense()
    {
#if USE_LOAD_CELL
        return _tickLoadCell();
#else
        return _tickDeadReckoning();
#endif
    }

    // Forward-park: advance exactly half a revolution so the toothless arc
    // of the half-spur gear sits under the auger tube, mechanically cutting
    // off flow. No backward motion — the auger stays oriented correctly
    // for the next dispense (which always starts on the toothed arc).
    void startPark()
    {
        long current = _stepper.currentPosition();
        long stepsPerRev = static_cast<long>(STEPS_PER_REV);

        // Round up to the next full revolution boundary.
        // If already at 0 (freshly reset), nextFullRev == 0 and moveTo(0)
        // is a no-op — correct, already parked.
        long nextFullRev = ((current + stepsPerRev - 1) / stepsPerRev) * stepsPerRev;

        _parkTarget = nextFullRev;

        _stepper.setMaxSpeed(BACK_PURGE_SPEED_STEPS_S);
        _stepper.setAcceleration(BACK_PURGE_SPEED_STEPS_S * 2.0f);
        _stepper.moveTo(_parkTarget);

        Serial.print(F("[Auger] Parking: current="));
        Serial.print(current);
        Serial.print(F(" -> target="));
        Serial.print(_parkTarget);
        Serial.print(F(" ("));
        Serial.print(_parkTarget - current);
        Serial.println(F(" steps fwd)"));
    }

    bool tickPark()
    {
        _stepper.run();
        return _stepper.distanceToGo() == 0;
    }

    void finishPark()
    {
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
        delay(AUGER_COIL_DISABLE_DELAY_MS);
        disableCoils();
        _stepper.setCurrentPosition(0);
        Serial.println(F("[Auger] Parked and disengaged."));
    }

private:
    AccelStepper _stepper;
    WiFiComms &_wifi;
    long _totalSteps = 0;
    long _parkTarget = 0;

#if USE_LOAD_CELL
    Scale &_scale;
    float _coastEma[CAROUSEL_SLOT_COUNT + 1]; // index 0 unused

    enum class Phase
    {
        BULK,
        SETTLE,
        NUDGE
    };
    Phase _dispensePhase = Phase::BULK;
    uint8_t _tapCount = 0;
    float _weightBeforeTap = 0.0f;
#endif

    uint8_t _slot = 1;
    float _targetGrams = 0.0f;
    // long _totalSteps = 0;
    uint32_t _lastPushMs = 0;

    // -------------------------------------------------------
    //  Dead-reckoning tick
    // -------------------------------------------------------
    bool _tickDeadReckoning()
    {
        _stepper.run();

        if (millis() - _lastPushMs >= WIFI_PUSH_INTERVAL_MS)
        {
            _lastPushMs = millis();
            long remaining = _stepper.distanceToGo();
            float progress = (_totalSteps > 0)
                                 ? _targetGrams * (1.0f - static_cast<float>(remaining) / static_cast<float>(_totalSteps))
                                 : _targetGrams;
            _wifi.pushWeightUDP(_slot, progress, _targetGrams);
        }

        if (_stepper.distanceToGo() == 0)
        {
            _wifi.pushWeightUDP(_slot, _targetGrams, _targetGrams);
            Serial.println(F("[Auger] Forward done. Sending progress burst..."));
            _wifi.pushProgressBurst(_slot, _targetGrams);
            return true;
        }
        return false;
    }

#if USE_LOAD_CELL
    // -------------------------------------------------------
    //  Load-cell tick — three-phase: BULK -> SETTLE -> NUDGE
    // -------------------------------------------------------
    bool _tickLoadCell()
    {
        switch (_dispensePhase)
        {
        case Phase::BULK:
            return _tickBulk();
        case Phase::SETTLE:
            return _tickSettle();
        case Phase::NUDGE:
            return _tickNudge();
        }
        return true;
    }

    // Phase 1: run stepper, push REAL scale weight via UDP, transition when bulk cycles done.
    // We read the scale on the push interval (between step pulses) — it's noisy mid-pulse
    // but accurate enough for live UI feedback. The settle phase does the precise read.
    bool _tickBulk()
    {
        _stepper.run();

        if (millis() - _lastPushMs >= WIFI_PUSH_INTERVAL_MS)
        {
            _lastPushMs = millis();
            if (_scale.isReady())
            {
                float liveWeight = _scale.read();
                _wifi.pushWeightUDP(_slot, liveWeight, _targetGrams);
            }
        }

        if (_stepper.distanceToGo() == 0)
        {
            Serial.println(F("[Auger] Bulk done -> settling..."));
            _dispensePhase = Phase::SETTLE;
        }
        return false;
    }

    // Phase 2: wait for scale to stabilise, then decide: done or nudge
    bool _tickSettle()
    {
        float settled = _readStableWeight();
        _wifi.pushWeightUDP(_slot, settled, _targetGrams);

        Serial.print(F("[Auger] Settled weight: "));
        Serial.print(settled, 2);
        Serial.print(F("g / "));
        Serial.print(_targetGrams, 2);
        Serial.println(F("g"));

        if (settled >= _targetGrams)
        {
            // Clump release during bulk already hit target — we're done
            Serial.println(F("[Auger] Target reached after settle (clump release)."));
            return true;
        }

        // Need more — go to nudge phase
        _tapCount = 0;
        _dispensePhase = Phase::NUDGE;
        _weightBeforeTap = settled;
        _queueTap();
        return false;
    }

    // Phase 3: one tap at a time, settle after each
    bool _tickNudge()
    {
        _stepper.run();

        if (_stepper.distanceToGo() != 0)
            return false; // tap still running

        // Tap finished — settle and read
        float settled = _readStableWeight();
        _wifi.pushWeightUDP(_slot, settled, _targetGrams);

        float tapDelivered = settled - _weightBeforeTap;
        _tapCount++;

        Serial.print(F("[Auger] Tap "));
        Serial.print(_tapCount);
        Serial.print(F(": +"));
        Serial.print(tapDelivered, 2);
        Serial.print(F("g  total="));
        Serial.print(settled, 2);
        Serial.println(F("g"));

        if (tapDelivered > CLUMP_WARN_G)
        {
            Serial.print(F("[Auger] CLUMP detected on tap ("));
            Serial.print(tapDelivered, 2);
            Serial.println(F("g in one tap)"));
        }

        // Update coast EMA with what this tap actually delivered
        // so future dispenses predict better
        if (tapDelivered > 0.0f)
        {
            _coastEma[_slot] = COAST_ALPHA * tapDelivered + (1.0f - COAST_ALPHA) * _coastEma[_slot];
            _coastEma[_slot] = constrain(_coastEma[_slot], 0.0f, MAX_COAST_GRAMS);
        }

        if (settled >= _targetGrams)
        {
            Serial.println(F("[Auger] Target reached."));
            return true;
        }

        if (_tapCount >= MAX_TAPS)
        {
            Serial.println(F("[Auger] WARN: max taps reached — stopping."));
            return true;
        }

        // Queue another tap
        _weightBeforeTap = settled;
        _queueTap();
        return false;
    }

    // Queue one micro-tap: TAP_CYCLES revolutions at slow speed
    void _queueTap()
    {
        long tapSteps = static_cast<long>(TAP_CYCLES) * static_cast<long>(STEPS_PER_AUGER_CYCLE);
        _totalSteps += tapSteps; // accumulate total dispensed steps

        // Slow speed for nudge taps — less momentum means less coast
        float tapSpeed = AUGER_FULL_SPEED_STEPS_S * RAMP_SPEED_STAGE3;
        _stepper.setMaxSpeed(tapSpeed);
        _stepper.setAcceleration(tapSpeed * 2.0f);
        _stepper.move(tapSteps);
    }

    // Block until scale gives SETTLE_READS consecutive readings
    // within STABLE_BAND_G of each other, then return that value.
    // Pushes real weight via UDP on every poll so the UI stays live.
    float _readStableWeight()
    {
        float prev = _scale.read();
        _wifi.pushWeightUDP(_slot, prev, _targetGrams);
        uint8_t count = 1;

        while (count < SETTLE_READS)
        {
            delay(SCALE_POLL_MS);
            float cur = _scale.read();
            _wifi.pushWeightUDP(_slot, cur, _targetGrams); // real reading every poll

            if (fabsf(cur - prev) <= STABLE_BAND_G)
                count++;
            else
                count = 1; // reset — still moving

            prev = cur;
        }
        return prev;
    }
#endif // USE_LOAD_CELL
};