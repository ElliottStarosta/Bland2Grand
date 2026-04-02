// auger.ino
// Controls the NEMA 17 auger motor (via TB6600 driver #2).
// Handles speed control and the full dispense sequence with
// dynamic inflight mass compensation from scale.ino.
//
// DISPENSE ALGORITHM:
//   The auger runs at three speeds based on how close to target:
//     FAST    — from 0% up to the dynamic stop point minus 0.5g
//     SLOW    — within 0.5g of dynamic stop point
//     TRICKLE — within 0.15g of dynamic stop point
//
//   Dynamic stop point recalculates every 100ms using:
//     stop_at = target - (flow_rate_now × freefall_time)
//
//   This means the stop point adjusts in real time as the auger
//   slows down, accounting for changing inflight mass automatically.
//
//   After motor stop, the code waits for scale to settle, then
//   runs up to 3 correction pulses if still short of target.
//
// AUGER DIRECTION:
//   AUGER_DIR_PIN HIGH = dispense direction (spice out)
//   Change this if your auger threads in the opposite direction.

#include "config.h"

//----------------------------------------------------------------
// MODULE STATE
//----------------------------------------------------------------
static bool s_augerRunning = false;
static int s_augerSpeed = 0; // current step delay in us

// MOTOR PRIMITIVES

void augerEnable() { digitalWrite(AUGER_EN_PIN, LOW); }
void augerDisable() { digitalWrite(AUGER_EN_PIN, HIGH); }

/**
 * Set auger direction for dispensing.
 * Always dispenses in the same direction — no reversing needed.
 */
void augerSetDispenseDirection()
{
    digitalWrite(AUGER_DIR_PIN, HIGH);
}

/**
 * Fire one auger step at the given delay.
 * Lower delayUs = faster rotation.
 */
void augerStep(unsigned int delayUs)
{
    digitalWrite(AUGER_STEP_PIN, HIGH);
    delayMicroseconds(delayUs);
    digitalWrite(AUGER_STEP_PIN, LOW);
    delayMicroseconds(delayUs);
}

/**
 * Start the auger at the given step delay.
 * Call this to change speed mid-dispense too.
 */
void augerSetSpeed(int delayUs)
{
    s_augerSpeed = delayUs;
    s_augerRunning = true;
    augerEnable();
    augerSetDispenseDirection();
}

/**
 * Stop the auger immediately and disable motor.
 * Disabling removes hold current — auger cannot back-drive
 * under gravity so this is fine.
 */
void augerStop()
{
    s_augerRunning = false;
    augerDisable();
}

/**
 * Run the auger for a fixed duration at trickle speed.
 * Used for correction pulses.
 */
void augerPulse(unsigned long durationMs)
{
    augerSetSpeed(AUGER_SPEED_TRICKLE);
    unsigned long start = millis();
    while (millis() - start < durationMs)
    {
        augerStep(AUGER_SPEED_TRICKLE);
    }
    augerStop();
}

// INITIALISATION

void augerInit()
{
    pinMode(AUGER_STEP_PIN, OUTPUT);
    pinMode(AUGER_DIR_PIN, OUTPUT);
    pinMode(AUGER_EN_PIN, OUTPUT);
    augerStop();
    augerSetDispenseDirection();
    Serial.println("[AUGER] Ready");
}

// FULL DISPENSE SEQUENCE

/**
 * Dispense exactly targetGrams of spice from the current slot.
 * Carousel must already be positioned before calling this.
 *
 * Returns the actual settled weight dispensed in grams.
 *
 * Flow:
 *   1. Tare scale
 *   2. Run auger, reading scale every 100ms
 *   3. Each cycle: measure flow rate, compute inflight mass,
 *      recalculate dynamic stop point
 *   4. Adjust speed based on remaining distance to stop point
 *   5. Stop when scale >= dynamic stop point
 *   6. Wait for settle
 *   7. Correction pulses if short
 *   8. Report result
 */
float dispenseGrams(int slot, float targetGrams)
{

    Serial.print("[AUGER] Dispensing ");
    Serial.print(targetGrams, 2);
    Serial.print("g of ");
    Serial.println(SPICE_NAMES[slot]);

    // 1. Prepare scale
    scaleTare();
    delay(300); // let scale settle after tare

    float currentWeight = 0;
    float flowRate = 0;
    float inflightMass = 0;
    float dynamicStopAt = targetGrams * 0.85f; // conservative first estimate
    int currentSpeed = AUGER_SPEED_FAST;

    unsigned long lastReadMs = 0;
    unsigned long dispenseStartMs = millis();

    // 2. Start auger at full speed
    augerSetSpeed(AUGER_SPEED_FAST);

    // 3. Main dispense loop
    while (true)
    {

        // Step motor every iteration (non-blocking speed control)
        if (s_augerRunning)
        {
            augerStep(s_augerSpeed);
        }

        // Read scale and update flow model every 100ms
        unsigned long now = millis();
        if (now - lastReadMs >= 100)
        {
            lastReadMs = now;
            currentWeight = scaleRead();

            // Push reading into flow buffer for regression
            scalePushReading(currentWeight);

            // Recalculate dynamic stop point
            dynamicStopAt = scaleDynamicStopAt(targetGrams);
            flowRate = scaleFlowRate();
            inflightMass = scaleInflightMass();

            float remaining = dynamicStopAt - currentWeight;

            // Speed staging
            if (remaining > 0.5f && currentSpeed != AUGER_SPEED_FAST)
            {
                augerSetSpeed(AUGER_SPEED_FAST);
                currentSpeed = AUGER_SPEED_FAST;
                Serial.println("[AUGER] Speed: FAST");
            }
            else if (remaining <= 0.5f && remaining > 0.15f && currentSpeed != AUGER_SPEED_SLOW)
            {
                augerSetSpeed(AUGER_SPEED_SLOW);
                currentSpeed = AUGER_SPEED_SLOW;
                Serial.println("[AUGER] Speed: SLOW");
            }
            else if (remaining <= 0.15f && currentSpeed != AUGER_SPEED_TRICKLE)
            {
                augerSetSpeed(AUGER_SPEED_TRICKLE);
                currentSpeed = AUGER_SPEED_TRICKLE;
                Serial.println("[AUGER] Speed: TRICKLE");
            }

            // Live debug output
            Serial.print("[AUGER] w=");
            Serial.print(currentWeight, 2);
            Serial.print("g  flow=");
            Serial.print(flowRate, 3);
            Serial.print("g/s  inflight=");
            Serial.print(inflightMass, 3);
            Serial.print("g  stopAt=");
            Serial.print(dynamicStopAt, 3);
            Serial.print("g  rem=");
            Serial.print(remaining, 3);
            Serial.println("g");

            // Stop condition
            if (currentWeight >= dynamicStopAt)
            {
                augerStop();
                break;
            }

            // Safety timeout: 60 seconds max
            if (now - dispenseStartMs > 60000UL)
            {
                Serial.println("[AUGER] ERROR: Dispense timeout (60s)");
                augerStop();
                break;
            }
        }
    }

    // 4. Wait for inflight spice to land
    // Wait freefall time + 300ms buffer for bounce/rolling
    unsigned long settleWait = (unsigned long)(sqrt(2.0f * DROP_HEIGHT_M / 9.81f) * 1000) + 300;
    Serial.print("[AUGER] Waiting ");
    Serial.print(settleWait);
    Serial.println("ms for spice to land...");
    delay(settleWait);

    // 5. Wait for scale to fully settle
    float settledWeight = scaleSettle();

    Serial.print("[AUGER] Settled weight: ");
    Serial.print(settledWeight, 2);
    Serial.println("g");

    // 6. Correction pulses if short
    int corrections = 0;
    while (settledWeight < targetGrams - CORRECTION_THRESHOLD_G && corrections < CORRECTION_MAX)
    {

        corrections++;
        Serial.print("[AUGER] Short by ");
        Serial.print(targetGrams - settledWeight, 2);
        Serial.print("g — correction pulse ");
        Serial.print(corrections);
        Serial.print("/");
        Serial.println(CORRECTION_MAX);

        // At this point flow rate is ~0 so inflight is negligible
        // Run a fixed short pulse then re-check
        augerPulse(CORRECTION_PULSE_MS);
        delay(settleWait);
        settledWeight = scaleSettle();

        Serial.print("[AUGER] After correction: ");
        Serial.print(settledWeight, 2);
        Serial.println("g");
    }

    // 7. Report result
    float error = settledWeight - targetGrams;
    Serial.print("[AUGER] COMPLETE — Target: ");
    Serial.print(targetGrams, 2);
    Serial.print("g  Actual: ");
    Serial.print(settledWeight, 2);
    Serial.print("g  Error: ");
    Serial.print(error, 2);
    Serial.print("g (");
    Serial.print((error / targetGrams) * 100.0f, 1);
    Serial.println("%)");

    return settledWeight;
}

bool augerIsRunning() { return s_augerRunning; }
