#pragma once
#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"
#include "WiFiComms.h"
#include "SlotConfig.h"

#ifndef USE_LOAD_CELL
#define USE_LOAD_CELL 0
#endif

#if USE_LOAD_CELL
#include "Scale.h"
#endif

class AugerDriver
{
public:
#if USE_LOAD_CELL
    AugerDriver(WiFiComms &wifi, Scale &scale)
        : _stepper(AccelStepper::DRIVER, PIN_AUGER_STEP, PIN_AUGER_DIR),
          _wifi(wifi), _scale(scale)
    {
        for (uint8_t s = 1; s <= CAROUSEL_SLOT_COUNT; s++)
            _gramsPerRev[s] = GRAMS_PER_REV[s];
    }
#else
    explicit AugerDriver(WiFiComms &wifi)
        : _stepper(AccelStepper::DRIVER, PIN_AUGER_STEP, PIN_AUGER_DIR),
          _wifi(wifi) {}
#endif

    void begin()
    {
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 4.0f);
        _stepper.setCurrentPosition(0);
        _stepper.disableOutputs();
        Serial.println(F("[Auger] Initialised."));
#if USE_LOAD_CELL
        Serial.println(F("[Auger] Mode: ADAPTIVE CLOSED-LOOP"));
#else
        Serial.println(F("[Auger] Mode: DEAD-RECKONING"));
#endif
    }

    void enableCoils() { _stepper.enableOutputs(); }
    void disableCoils() { _stepper.disableOutputs(); }

    void startDispense(uint8_t slot, const char *spiceName,
                       float targetGrams, uint8_t slotIdx, uint8_t total)
    {
        _slot = slot;
        _targetGrams = targetGrams;
        _lastPushMs = millis();

        _wifi.pushDispenseStart(slot, spiceName, targetGrams, slotIdx, total);
        _stepper.enableOutputs();

#if USE_LOAD_CELL
        _dispensePhase = Phase::BULK;
        _tapCount = 0;
        _lastRevPushed = 0;
        _lastRevWeight = 0.0f;
        _totalSteps = 0;

        // Queue first bulk rev
        _queueBulkRev();

        Serial.print(F("[Auger] Adaptive dispense start, target="));
        Serial.print(targetGrams, 2);
        Serial.println(F("g"));
#else
        float gramsPerCycle = GRAMS_PER_REV[slot];
        long cycles = max(1L, static_cast<long>(roundf(targetGrams / gramsPerCycle)));
        _totalSteps = cycles * static_cast<long>(STEPS_PER_AUGER_CYCLE);
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 4.0f);
        _stepper.move(-_totalSteps);
        Serial.print(F("[Auger] Dead-reckoning: "));
        Serial.print(cycles);
        Serial.print(F(" cycles ("));
        Serial.print(gramsPerCycle, 3);
        Serial.println(F(" g/rev)"));
#endif
    }

    bool tickDispense()
    {
#if USE_LOAD_CELL
        return _tickLoadCell();
#else
        return _tickDeadReckoning();
#endif
    }

    void startPark()
    {
        long current = _stepper.currentPosition();
        long remainder = current % STEPS_PER_REV;
        if (remainder < 0)
            remainder += STEPS_PER_REV;
        _parkTarget = (remainder == 0) ? current : current + (STEPS_PER_REV - remainder);

        _stepper.setMaxSpeed(BACK_PURGE_SPEED_STEPS_S);
        _stepper.setAcceleration(BACK_PURGE_SPEED_STEPS_S * 2.0f);
        _stepper.moveTo(_parkTarget);

        Serial.print(F("[Auger] Parking to "));
        Serial.println(_parkTarget);
    }

    bool tickPark()
    {
        _stepper.run();
        return _stepper.distanceToGo() == 0;
    }

    void finishPark()
    {
        delay(AUGER_COIL_DISABLE_DELAY_MS);
        disableCoils();
        _stepper.setCurrentPosition(0);
        Serial.println(F("[Auger] Parked."));
    }

private:
    AccelStepper _stepper;
    WiFiComms &_wifi;
    long _totalSteps = 0;
    long _parkTarget = 0;
    long _lastRevPushed = 0;
    uint8_t _slot = 1;
    float _targetGrams = 0.0f;
    uint32_t _lastPushMs = 0;

    enum class TapPhase
    {
        PRE,
        CONTACT,
        POST,
        DONE
    };
    TapPhase _tapPhase = TapPhase::DONE;
    long _tapRevsRemaining = 0;
    float _tapContactSpeed = 0.0f;

#if USE_LOAD_CELL
    Scale &_scale;

    // Per-slot learned grams/rev (updated live)
    float _gramsPerRev[CAROUSEL_SLOT_COUNT + 1];

    enum class Phase
    {
        BULK,
        NUDGE
    };
    Phase _dispensePhase = Phase::BULK;
    uint8_t _tapCount = 0;
    float _weightBeforeTap = 0.0f;
    float _lastRevWeight = 0.0f;

    // How close to target before we switch from bulk to nudge
    static constexpr float NUDGE_THRESHOLD_G = 0.30f;
    // Minimum tap fraction of remaining grams (prevents micro-taps)
    static constexpr float MIN_TAP_FRACTION = 0.3f;
    // Maximum tap fraction (prevents over-tapping)
    static constexpr float MAX_TAP_FRACTION = 0.8f;
#endif

    // ─── Dead-reckoning ───────────────────────────────────────────────────────
    bool _tickDeadReckoning()
    {
        _stepper.run();

        uint32_t now = millis();
        if (now - _lastPushMs >= WIFI_PUSH_INTERVAL_MS)
        {
            _lastPushMs = now;
            long remaining = _stepper.distanceToGo();
            float progress = (_totalSteps > 0)
                                 ? _targetGrams * (1.0f - (float)remaining / (float)_totalSteps)
                                 : _targetGrams;
            _wifi.pushWeightUDP(_slot, progress, _targetGrams);
        }

        if (_stepper.distanceToGo() == 0)
        {
            _wifi.pushWeightUDP(_slot, _targetGrams, _targetGrams);
            return true;
        }
        return false;
    }

#if USE_LOAD_CELL
    // ─── Adaptive closed-loop tick ────────────────────────────────────────────
    bool _tickLoadCell()
    {
        switch (_dispensePhase)
        {
        case Phase::BULK:
            return _tickBulk();
        case Phase::NUDGE:
            return _tickNudge();
        }
        return true;
    }

    // Queue exactly one auger revolution at full speed
    void _queueBulkRev()
    {
        long steps = static_cast<long>(STEPS_PER_AUGER_CYCLE);
        _totalSteps += steps;
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 4.0f);
        _stepper.move(-steps);
    }

    // Bulk: spin one rev at a time, read scale after each, bail to nudge when close
    bool _tickBulk()
    {
        _stepper.run();

        // Wait until the current rev finishes
        if (_stepper.distanceToGo() != 0)
            return false;

        // Rev just completed — read scale (motor is stopped so reading is clean)
        float current = _readStableWeight();
        float remaining = _targetGrams - current;

        Serial.print(F("[Bulk] Rev "));
        Serial.print(_lastRevPushed + 1);
        Serial.print(F("  scale="));
        Serial.print(current, 2);
        Serial.print(F("g  remaining="));
        Serial.print(remaining, 2);
        Serial.println(F("g"));

        // Update learned grams/rev from this revolution
        float delivered = current - _lastRevWeight;
        if (delivered > 0.005f && _lastRevPushed > 0)
        {
            // EMA update of grams/rev for this slot
            _gramsPerRev[_slot] = 0.3f * delivered + 0.7f * _gramsPerRev[_slot];
            _gramsPerRev[_slot] = constrain(_gramsPerRev[_slot], 0.005f, 5.0f);
            Serial.print(F("[Bulk] Learned g/rev="));
            Serial.println(_gramsPerRev[_slot], 4);
        }
        _lastRevWeight = current;
        _lastRevPushed++;

        // Already hit target (clump release)
        if (current >= _targetGrams)
        {
            Serial.println(F("[Auger] Target hit during bulk."));
            _wifi.pushWeightUDP(_slot, current, _targetGrams);
            return true;
        }

        // Within nudge threshold — switch to nudge
        if (remaining <= NUDGE_THRESHOLD_G)
        {
            Serial.println(F("[Auger] Approaching target — switching to nudge."));
            _dispensePhase = Phase::NUDGE;
            _tapCount = 0;
            _weightBeforeTap = current;
            _queueNudgeTap(remaining);
            return false;
        }

        // Predict if next full rev would overshoot
        float predicted = current + _gramsPerRev[_slot];
        if (predicted >= _targetGrams - NUDGE_THRESHOLD_G)
        {
            Serial.println(F("[Auger] Next rev would overshoot — switching to nudge."));
            _dispensePhase = Phase::NUDGE;
            _tapCount = 0;
            _weightBeforeTap = current;
            _queueNudgeTap(remaining);
            return false;
        }

        // Safe to do another full rev
        _queueBulkRev();
        return false;
    }

    // Nudge: adaptive tap size based on remaining grams
    bool _tickNudge()
    {
        _stepper.run();

        if (_stepper.distanceToGo() != 0)
            return false;

        switch (_tapPhase)
        {
        case TapPhase::PRE:
        {
            // PRE done — queue CONTACT segment (1/4 to 3/4 rev) at slow speed
            _tapPhase = TapPhase::CONTACT;
            long contactSteps = STEPS_PER_AUGER_CYCLE / 2; // half rev = contact window
            _stepper.setMaxSpeed(_tapContactSpeed);
            _stepper.setAcceleration(_tapContactSpeed * 4.0f);
            _stepper.move(-contactSteps);
            return false;
        }

        case TapPhase::CONTACT:
        {
            // CONTACT done — queue POST segment (3/4 to 1 rev) at full speed
            _tapPhase = TapPhase::POST;
            long postSteps = STEPS_PER_AUGER_CYCLE / 4; // last quarter
            _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
            _stepper.setAcceleration(AUGER_NUDGE_MAX_SPEED * 4.0f);
            _stepper.move(-postSteps);
            return false;
        }

        case TapPhase::POST:
        {
            // One full rev done
            _tapRevsRemaining--;

            if (_tapRevsRemaining > 0)
            {
                // More revs to do — start next PRE segment
                _tapPhase = TapPhase::PRE;
                long preSteps = STEPS_PER_AUGER_CYCLE / 4;
                _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
                _stepper.setAcceleration(AUGER_NUDGE_MAX_SPEED * 4.0f);
                _stepper.move(-preSteps);
                return false;
            }

            // All revs done — fall through to read scale
            _tapPhase = TapPhase::DONE;
            break;
        }

        case TapPhase::DONE:
            break;
        }

        // All tap revs complete — settle and read
        float current = _readStableWeight();
        float tapDelivered = current - _weightBeforeTap;
        _tapCount++;

        Serial.print(F("[Nudge] Tap "));
        Serial.print(_tapCount);
        Serial.print(F(": +"));
        Serial.print(tapDelivered, 3);
        Serial.print(F("g  total="));
        Serial.print(current, 3);
        Serial.print(F("g  target="));
        Serial.print(_targetGrams, 3);
        Serial.println(F("g"));

        if (tapDelivered > 0.002f)
        {
            _gramsPerRev[_slot] = 0.2f * tapDelivered + 0.8f * _gramsPerRev[_slot];
            _gramsPerRev[_slot] = constrain(_gramsPerRev[_slot], 0.005f, 5.0f);
        }

        _wifi.pushWeightUDP(_slot, current, _targetGrams);

        if (current >= _targetGrams)
        {
            Serial.println(F("[Auger] Target reached."));
            return true;
        }

        if (_tapCount >= MAX_TAPS)
        {
            Serial.println(F("[Auger] WARN: max taps reached."));
            return true;
        }

        float remaining = _targetGrams - current;
        _weightBeforeTap = current;
        _queueNudgeTap(remaining);
        return false;
    }
    // Queue a tap sized proportionally to remaining grams
    // More remaining = bigger tap, close to target = tiny tap
    void _queueNudgeTap(float remaining)
    {
        float gramsPerRev = _gramsPerRev[_slot];
        float idealRevs = remaining / gramsPerRev;
        float tapRevs = constrain(idealRevs * 0.6f, 0.1f,
                                  MAX_TAP_FRACTION * remaining / gramsPerRev);
        tapRevs = max(tapRevs, 0.1f);

        float speedFraction = constrain(remaining / _targetGrams, 0.15f, 0.75f);
        _tapContactSpeed = AUGER_NUDGE_MAX_SPEED * speedFraction;
        _tapRevsRemaining = max(1L, lroundf(tapRevs));
        _totalSteps += _tapRevsRemaining * STEPS_PER_AUGER_CYCLE;

        Serial.print(F("[Nudge] Queuing "));
        Serial.print(_tapRevsRemaining);
        Serial.print(F(" revs, contact speed="));
        Serial.print(speedFraction * 100.0f, 0);
        Serial.println(F("%"));

        // Start first rev: PRE segment (0 to 1/4 rev) at full speed
        _tapPhase = TapPhase::PRE;
        long preSteps = STEPS_PER_AUGER_CYCLE / 4;
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_NUDGE_MAX_SPEED * 4.0f);
        _stepper.move(-preSteps);
    }
    // Read stable weight — blocks until SETTLE_READS consecutive readings
    // within STABLE_BAND_G, max 1s
    float _readStableWeight()
    {
        float prev = _scale.read();
        uint8_t count = 1;
        uint32_t deadline = millis() + 1000;

        while (count < SETTLE_READS && millis() < deadline)
        {
            delay(SCALE_POLL_MS);
            float cur = _scale.read();
            if (fabsf(cur - prev) <= STABLE_BAND_G)
                count++;
            else
                count = 1;
            prev = cur;
        }

        _wifi.pushWeightUDP(_slot, prev, _targetGrams);
        return prev;
    }
#endif
};