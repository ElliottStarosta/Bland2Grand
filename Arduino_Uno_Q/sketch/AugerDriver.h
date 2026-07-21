#pragma once
#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"
#include "BridgeComms.h"
#include "SlotConfig.h"

// Default to dead-reckoning mode unless USE_LOAD_CELL is defined elsewhere (e.g. build flags)
#ifndef USE_LOAD_CELL
#define USE_LOAD_CELL 0
#endif

// Only pull in the Scale (load cell) driver when adaptive closed-loop mode is enabled
#if USE_LOAD_CELL
#include "Scale.h"
#endif

// Drives the auger stepper motor to dispense spice, either by dead-reckoning (fixed steps per gram) or by adaptive closed-loop control using a load cell.
class AugerDriver
{
public:
#if USE_LOAD_CELL
    // Closed-loop constructor: needs both WiFi (for status pushes) and the Scale
    AugerDriver(BridgeComms &wifi, Scale &scale)
        : _stepper(AccelStepper::DRIVER, PIN_AUGER_STEP, PIN_AUGER_DIR),
          _wifi(wifi), _scale(scale)
    {
        // Seed the per-slot learned grams/rev table from the static config defaults
        for (uint8_t s = 1; s <= CAROUSEL_SLOT_COUNT; s++)
            _gramsPerRev[s] = GRAMS_PER_REV[s];
    }
#else
    // Dead-reckoning constructor: only needs WiFi for status pushes
    explicit AugerDriver(BridgeComms &wifi)
        : _stepper(AccelStepper::DRIVER, PIN_AUGER_STEP, PIN_AUGER_DIR),
          _wifi(wifi) {}
#endif

    // One-time setup: configure motion limits and disable the driver coils until needed
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

    // Energize / de-energize the stepper driver coils
    void enableCoils() { _stepper.enableOutputs(); }
    void disableCoils() { _stepper.disableOutputs(); }

    // Begin dispensing targetGrams of spice from the given slot.
    // slotIdx/total are just used for progress reporting over WiFi.
    void startDispense(uint8_t slot, const char *spiceName,
                       float targetGrams, uint8_t slotIdx, uint8_t total)
    {
        _slot = slot;
        _targetGrams = targetGrams;
        _lastPushMs = millis();

        // Tell the app/dashboard that a dispense has started
        _wifi.pushDispenseStart(slot, spiceName, targetGrams, slotIdx, total);
        _stepper.enableOutputs();

#if USE_LOAD_CELL
        // Adaptive mode: start in BULK phase and reset all tracking state
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
        // Dead-reckoning mode: compute how many auger cycles are needed based on the fixed grams-per-revolution calibration for this slot
        float gramsPerCycle = GRAMS_PER_REV[slot];
        long cycles = max(1L, static_cast<long>(roundf(targetGrams / gramsPerCycle)));
        _totalSteps = cycles * static_cast<long>(STEPS_PER_AUGER_CYCLE);
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 4.0f);
        // Move the full computed distance in one go (negative = dispense direction)
        _stepper.move(-_totalSteps);
        Serial.print(F("[Auger] Dead-reckoning: "));
        Serial.print(cycles);
        Serial.print(F(" cycles ("));
        Serial.print(gramsPerCycle, 3);
        Serial.println(F(" g/rev)"));
#endif
    }

    // Call repeatedly from the main loop while dispensing.
    // Returns true once the dispense is complete.
    bool tickDispense()
    {
#if USE_LOAD_CELL
        return _tickLoadCell();
#else
        return _tickDeadReckoning();
#endif
    }

    // Begin moving the auger back to the nearest "parked" position
    // (an exact multiple of one full revolution) so it's aligned for next time
    void startPark()
    {
        long current = _stepper.currentPosition();
        long remainder = current % STEPS_PER_REV;
        if (remainder < 0)
            remainder += STEPS_PER_REV; // normalize negative modulo result
        _parkTarget = (remainder == 0) ? current : current + (STEPS_PER_REV - remainder);

        // Park slowly to avoid overshoot/backlash issues
        _stepper.setMaxSpeed(BACK_PURGE_SPEED_STEPS_S);
        _stepper.setAcceleration(BACK_PURGE_SPEED_STEPS_S * 2.0f);
        _stepper.moveTo(_parkTarget);

        Serial.print(F("[Auger] Parking to "));
        Serial.println(_parkTarget);
    }

    // Call repeatedly while parking. Returns true once the target position is reached.
    bool tickPark()
    {
        _stepper.run();
        return _stepper.distanceToGo() == 0;
    }

    // Called once parking is complete: let the motor settle, then cut power to the coils
    void finishPark()
    {
        delay(AUGER_COIL_DISABLE_DELAY_MS);
        disableCoils();
        _stepper.setCurrentPosition(0);
        Serial.println(F("[Auger] Parked."));
    }

private:
    AccelStepper _stepper;     // underlying stepper motor driver
    BridgeComms &_wifi;        // reference to WiFi comms for status/progress pushes
    long _totalSteps = 0;      // total steps queued/moved for the current dispense
    long _parkTarget = 0;      // absolute step position to park at
    long _lastRevPushed = 0;   // count of bulk revolutions reported so far
    uint8_t _slot = 1;         // slot currently being dispensed from
    float _targetGrams = 0.0f; // target weight for the current dispense
    uint32_t _lastPushMs = 0;  // timestamp of the last WiFi progress push (dead-reckoning)

    // State machine for a single "tap" (small nudge) revolution, broken into
    // sub-segments so speed can be varied within one revolution
    enum class TapPhase
    {
        PRE,     // first quarter rev, full speed
        CONTACT, // middle half rev, slow "contact" speed (where spice actually releases)
        POST,    // last quarter rev, full speed
        DONE
    };
    TapPhase _tapPhase = TapPhase::DONE;
    long _tapRevsRemaining = 0;    // how many more full revs remain in the current tap
    float _tapContactSpeed = 0.0f; // speed used during the CONTACT segment

#if USE_LOAD_CELL
    Scale &_scale; // reference to the load cell for closed-loop weight feedback

    // Per-slot learned grams/rev (updated live)
    float _gramsPerRev[CAROUSEL_SLOT_COUNT + 1];

    // High-level dispense phases: coarse bulk revolutions, then fine nudges near target
    enum class Phase
    {
        BULK,
        NUDGE
    };
    Phase _dispensePhase = Phase::BULK;
    uint8_t _tapCount = 0;         // number of nudge taps performed so far
    float _weightBeforeTap = 0.0f; // scale reading taken just before the current tap
    float _lastRevWeight = 0.0f;   // scale reading after the previous bulk revolution

    // How close to target before we switch from bulk to nudge
    static constexpr float NUDGE_THRESHOLD_G = 0.30f;
    // Minimum tap fraction of remaining grams (prevents micro-taps)
    static constexpr float MIN_TAP_FRACTION = 0.3f;
    // Maximum tap fraction (prevents over-tapping)
    static constexpr float MAX_TAP_FRACTION = 0.8f;
#endif

    // Dead-reckoning tick: just drive the stepper toward its precomputed target, and periodically reporting estimated progress based on step count (no scale feedback)
    bool _tickDeadReckoning()
    {
        _stepper.run();

        uint32_t now = millis();
        // Throttle WiFi progress updates to BRIDGE_PUSH_INTERVAL_MS
        if (now - _lastPushMs >= BRIDGE_PUSH_INTERVAL_MS)
        {
            _lastPushMs = now;
            long remaining = _stepper.distanceToGo();
            // Estimate grams delivered so far proportionally to steps completed
            float progress = (_totalSteps > 0)
                                 ? _targetGrams * (1.0f - (float)remaining / (float)_totalSteps)
                                 : _targetGrams;
            _wifi.pushWeightUDP(_slot, progress, _targetGrams);
        }

        // Movement finished -- report final target weight and signal completion
        if (_stepper.distanceToGo() == 0)
        {
            _wifi.pushWeightUDP(_slot, _targetGrams, _targetGrams);
            return true;
        }
        return false;
    }

#if USE_LOAD_CELL
    // Adaptive closed-loop tick: dispatch to whichever phase we're currently in
    bool _tickLoadCell()
    {
        switch (_dispensePhase)
        {
        case Phase::BULK:
            return _tickBulk();
        case Phase::NUDGE:
            return _tickNudge();
        }
        return true; // should be unreachable, but fail safe by reporting done
    }

    // Queue exactly one auger revolution at full speed
    void _queueBulkRev()
    {
        long steps = static_cast<long>(STEPS_PER_AUGER_CYCLE);
        _totalSteps += steps;
        _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
        _stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 4.0f);
        _stepper.move(-steps); // negative = dispense direction
    }

    // Bulk: spin one rev at a time, read scale after each, bail to nudge when close
    bool _tickBulk()
    {
        _stepper.run();

        // Wait until the current rev finishes
        if (_stepper.distanceToGo() != 0)
            return false;

        // Rev just completed -- read scale (motor is stopped so reading is clean)
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

        // Skip the update after the very first rev, since _lastRevWeight starts at 0, and would otherwise skew the learned average
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

        // Within nudge threshold -- switch to nudge
        if (remaining <= NUDGE_THRESHOLD_G)
        {
            Serial.println(F("[Auger] Approaching target -- switching to nudge."));
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
            Serial.println(F("[Auger] Next rev would overshoot -- switching to nudge."));
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

    // Nudge: adaptive tap size based on remaining grams. Each "tap" is one revolution split into PRE/CONTACT/POST speed segments,possibly repeated for _tapRevsRemaining revolutions before the scale is read.
  
    bool _tickNudge()
    {
        _stepper.run();

        if (_stepper.distanceToGo() != 0)
            return false;

        switch (_tapPhase)
        {
        case TapPhase::PRE:
        {
            // PRE done -- queue CONTACT segment (1/4 to 3/4 rev) at slow speed
            _tapPhase = TapPhase::CONTACT;
            long contactSteps = STEPS_PER_AUGER_CYCLE / 2; // half rev = contact window
            _stepper.setMaxSpeed(_tapContactSpeed);
            _stepper.setAcceleration(_tapContactSpeed * 4.0f);
            _stepper.move(-contactSteps);
            return false;
        }

        case TapPhase::CONTACT:
        {
            // CONTACT done -- queue POST segment (3/4 to 1 rev) at full speed
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
                // More revs to do -- start next PRE segment
                _tapPhase = TapPhase::PRE;
                long preSteps = STEPS_PER_AUGER_CYCLE / 4;
                _stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
                _stepper.setAcceleration(AUGER_NUDGE_MAX_SPEED * 4.0f);
                _stepper.move(-preSteps);
                return false;
            }

            // All revs done -- fall through to read scale
            _tapPhase = TapPhase::DONE;
            break;
        }

        case TapPhase::DONE:
            break;
        }

        // All tap revs complete -- settle and read
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

        // Update the learned grams/rev estimate more conservatively than in bulk mode
        if (tapDelivered > 0.002f)
        {
            _gramsPerRev[_slot] = 0.2f * tapDelivered + 0.8f * _gramsPerRev[_slot];
            _gramsPerRev[_slot] = constrain(_gramsPerRev[_slot], 0.005f, 5.0f);
        }

        _wifi.pushWeightUDP(_slot, current, _targetGrams);

        // Target reached (or exceeded) -- dispense complete
        if (current >= _targetGrams)
        {
            Serial.println(F("[Auger] Target reached."));
            return true;
        }

        // Safety cutoff to avoid dispensing forever if something's wrong
        if (_tapCount >= MAX_TAPS)
        {
            Serial.println(F("[Auger] WARN: max taps reached."));
            return true;
        }

        // Not done yet -- queue another tap sized for the remaining amount
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
        // Ideal number of revs to deliver exactly the remaining amount
        float idealRevs = remaining / gramsPerRev;
        // Only commit to 60% of the ideal revs (to avoid overshoot), clamped between a small minimum and MAX_TAP_FRACTION of the remaining-grams equivalent
        float tapRevs = constrain(idealRevs * 0.6f, 0.1f,
                                  MAX_TAP_FRACTION * remaining / gramsPerRev);
        tapRevs = max(tapRevs, 0.1f);

        // Slower contact speed the closer we are to the target, to improve precision
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
    // Read stable weight -- blocks until SETTLE_READS consecutive readings within STABLE_BAND_G, max 1s
    float _readStableWeight()
    {
        float prev = _scale.read();
        uint8_t count = 1;
        uint32_t deadline = millis() + 1000;

        // Poll the scale until readings stabilize (stop changing by more than STABLE_BAND_G for SETTLE_READS consecutive samples) or we time out
        while (count < SETTLE_READS && millis() < deadline)
        {
            delay(SCALE_POLL_MS);
            float cur = _scale.read();
            if (fabsf(cur - prev) <= STABLE_BAND_G)
                count++;
            else
                count = 1; // reading jumped -- restart the stability count
            prev = cur;
        }

        // Report the latest reading over WiFi before returning it
        _wifi.pushWeightUDP(_slot, prev, _targetGrams);
        return prev;
    }
#endif
};