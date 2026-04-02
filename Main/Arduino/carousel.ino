//carousel.ino
//Controls the carousel rotation motor (NEMA 23 via TB6600).
//
//MECHANICAL SETUP:
//  Motor pinion gear:    48 teeth  (on NEMA 23 shaft)
//  Carousel ring gear:  128 teeth  (internal ring on carousel base)
//  Gear ratio:          128/48 = 2.6667 : 1
//  Steps per slot move: ~1066 motor steps at 1/16 microstepping
//
//The motor is mounted on the SIDE of the carousel, not the center.
//The pinion meshes with the internal ring gear to drive rotation.
//
//POSITION FEEDBACK:
//  AS5600 12-bit magnetic encoder reads a magnet on the carousel
//  CENTER SHAFT. This gives true absolute carousel position
//  completely independent of where the motor is mounted.
//  No homing required after initial one-time CALIBRATE command.
//
//HOME OFFSET:
//  Stored in EEPROM so it survives power cycles.
//  Run CALIBRATE once with Cumin aligned under the auger.

#include "config.h"

//----------------------------------------------------------------
//MODULE STATE
//----------------------------------------------------------------
static int  s_homeOffset    = 0;
static bool s_carouselReady = false;


//ENCODER

/**
 * Read raw 12-bit angle from AS5600. Returns 0-4095 or -1 on error.
 */
int readEncoder() {
    Wire.beginTransmission(AS5600_I2C_ADDR);
    Wire.write(AS5600_RAW_REG);
    int err = Wire.endTransmission(false);
    if (err != 0) {
        Serial.print("[ENCODER] I2C error code: ");
        Serial.println(err);
        return -1;
    }
    Wire.requestFrom(AS5600_I2C_ADDR, 2);
    if (Wire.available() < 2) return -1;
    int high = Wire.read();
    int low  = Wire.read();
    return ((high & 0x0F) << 8) | low;
}

/**
 * Return encoder count normalised so that slot 0 = count 0.
 * Applies home offset. Returns -1 on encoder error.
 */
int normalisedCount() {
    int raw = readEncoder();
    if (raw < 0) return -1;
    return (raw - s_homeOffset + ENCODER_COUNTS) % ENCODER_COUNTS;
}

/**
 * Convert a normalised count to the nearest slot index (0-7).
 * Uses rounding so the center of each slot maps correctly.
 */
int countToSlot(int count) {
    return ((count + COUNTS_PER_SLOT / 2) / COUNTS_PER_SLOT) % NUM_SLOTS;
}

/**
 * Return the target encoder count for the center of a given slot.
 */
int slotToCount(int slot) {
    return (slot * COUNTS_PER_SLOT) % ENCODER_COUNTS;
}

/**
 * Shortest signed angular distance from current to target.
 * Positive = clockwise, negative = counter-clockwise.
 * Handles 0/4095 wraparound correctly.
 */
int shortestDistance(int current, int target) {
    int diff = (target - current + ENCODER_COUNTS) % ENCODER_COUNTS;
    if (diff > ENCODER_COUNTS / 2) diff -= ENCODER_COUNTS;
    return diff;
}


//MOTOR CONTROL

void carouselEnable()  { digitalWrite(CAROUSEL_EN_PIN, LOW);  }
void carouselDisable() { digitalWrite(CAROUSEL_EN_PIN, HIGH); }

/**
 * Fire one step pulse.
 * direction:  1 = clockwise, -1 = counter-clockwise
 * delayUs:    half-period of step pulse in microseconds
 */
void carouselStep(int direction, unsigned int delayUs) {
    digitalWrite(CAROUSEL_DIR_PIN, direction > 0 ? HIGH : LOW);
    digitalWrite(CAROUSEL_STEP_PIN, HIGH);
    delayMicroseconds(delayUs);
    digitalWrite(CAROUSEL_STEP_PIN, LOW);
    delayMicroseconds(delayUs);
}


//INITIALISATION

void carouselInit() {
    pinMode(CAROUSEL_STEP_PIN, OUTPUT);
    pinMode(CAROUSEL_DIR_PIN,  OUTPUT);
    pinMode(CAROUSEL_EN_PIN,   OUTPUT);
    carouselDisable();

    Wire.begin();
    delay(200);

    int startCount = readEncoder();
    if (startCount < 0) {
        Serial.println("[CAROUSEL] ERROR: AS5600 not detected on I2C bus.");
        Serial.println("[CAROUSEL] Check wiring: SDA=A4, SCL=A5, VCC=3.3V");
        Serial.println("[CAROUSEL] Verify magnet is 1-2mm from sensor face");
        s_carouselReady = false;
        return;
    }

    s_homeOffset    = eepromLoadHomeOffset();
    s_carouselReady = true;

    int norm = normalisedCount();
    int slot = countToSlot(norm);

    Serial.println("[CAROUSEL] Ready");
    Serial.print("[CAROUSEL] Gear ratio: ");
    Serial.print(CAROUSEL_GEAR_RATIO, 4);
    Serial.println(":1  (128 ring / 48 pinion)");
    Serial.print("[CAROUSEL] Est. steps per slot: ");
    Serial.println((int)((1.0f / NUM_SLOTS) * CAROUSEL_GEAR_RATIO * MOTOR_STEPS_PER_REV));
    Serial.print("[CAROUSEL] Boot encoder: ");
    Serial.print(startCount);
    Serial.print("  Home offset: ");
    Serial.print(s_homeOffset);
    Serial.print("  Current slot: ");
    Serial.print(slot);
    Serial.print(" (");
    Serial.print(SPICE_NAMES[slot]);
    Serial.println(")");
}


//MOVE TO SLOT — closed-loop with AS5600 feedback

/**
 * Spin the carousel to the target spice slot.
 *
 * Algorithm:
 *   1. Calculate shortest path CW or CCW using modular arithmetic.
 *   2. Step motor, reading encoder every step.
 *   3. Slow down when within SLOW_ZONE_COUNTS of target.
 *   4. Stop when within POSITION_TOLERANCE for 3 consecutive reads.
 *   5. Motor stays energised to hold position against carousel weight.
 *
 * Returns true on success, false on encoder error or jam detection.
 */
bool moveToSlot(int targetSlot) {
    if (!s_carouselReady) {
        Serial.println("[CAROUSEL] ERROR: Not initialised");
        return false;
    }
    if (targetSlot < 0 || targetSlot >= NUM_SLOTS) {
        Serial.print("[CAROUSEL] ERROR: Invalid slot ");
        Serial.print(targetSlot);
        Serial.println(" (must be 0-7)");
        return false;q
    }

    int targetCount  = slotToCount(targetSlot);
    int currentCount = normalisedCount();

    if (currentCount < 0) {
        Serial.println("[CAROUSEL] ERROR: Cannot read encoder");
        return false;
    }

    int distance = shortestDistance(currentCount, targetCount);

    //Already there
    if (abs(distance) <= POSITION_TOLERANCE) {
        Serial.print("[CAROUSEL] Already at slot ");
        Serial.print(targetSlot);
        Serial.print(" (");
        Serial.print(SPICE_NAMES[targetSlot]);
        Serial.println(")");
        return true;
    }

    //Record total distance at start for normalisation
    int totalDistance = abs(distance);
    int direction     = (distance > 0) ? 1 : -1;

    Serial.print("[CAROUSEL] Moving to slot ");
    Serial.print(targetSlot);
    Serial.print(" (");
    Serial.print(SPICE_NAMES[targetSlot]);
    Serial.print(")  distance=");
    Serial.print(totalDistance);
    Serial.print(" counts  dir=");
    Serial.println(direction > 0 ? "CW" : "CCW");

    carouselEnable();

    long stepCount           = 0;
    int  consecutiveOnTarget = 0;

    while (true) {

        // Read encoder 
        currentCount = normalisedCount();
        if (currentCount < 0) {
            Serial.println("[CAROUSEL] ERROR: Encoder lost during move");
            carouselDisable();
            return false;
        }

        distance = shortestDistance(currentCount, targetCount);

        // Check arrival 
        if (abs(distance) <= POSITION_TOLERANCE) {
            if (++consecutiveOnTarget >= 3) break;
        } else {
            consecutiveOnTarget = 0;
        }

        // Jam detection 
        if (stepCount >= CAROUSEL_STEP_LIMIT) {
            Serial.print("[CAROUSEL] ERROR: Step limit hit — jam?");
            carouselDisable();
            return false;
        }

        // Recalculate direction every 100 steps 
        if (stepCount % 100 == 0 && stepCount > 0) {
            direction = (shortestDistance(currentCount, targetCount) > 0)
                        ? 1 : -1;
        }

        // Calculate exponential step delay 
        //
        //Two curves blend together:
        //
        //  1. ACCELERATION curve — based on steps taken so far.
        //     Ramps UP from MAX_DELAY to MIN_DELAY over the first
        //     CAROUSEL_ACCEL_STEPS steps. Handles standing start.
        //
        //  2. DECELERATION curve — based on distance remaining.
        //     Ramps DOWN from MIN_DELAY to MAX_DELAY as the carousel
        //     approaches the target. Smooth exponential brake.
        //
        //  Final delay = whichever is LARGER (slower) at any point.
        //  This means the deceleration curve dominates near the target
        //  even if the acceleration ramp says go fast.

        //Acceleration: how far through the ramp are we?
        float accelProgress = (float)stepCount / (float)CAROUSEL_ACCEL_STEPS;
        if (accelProgress > 1.0f) accelProgress = 1.0f;

        //accelProgress goes 0→1, so delay goes MAX→MIN
        unsigned int accelDelay = (unsigned int)(
            CAROUSEL_DELAY_MAX -
            (CAROUSEL_DELAY_MAX - CAROUSEL_DELAY_MIN)
            * pow(accelProgress, CAROUSEL_CURVE)
        );

        //Deceleration: how close are we to the target?
        //distanceFraction goes 1→0 as we approach
        float distanceFraction = (float)abs(distance) / (float)totalDistance;
        if (distanceFraction > 1.0f) distanceFraction = 1.0f;

        //As distanceFraction shrinks, delay grows toward MAX_DELAY
        unsigned int decelDelay = (unsigned int)(
            CAROUSEL_DELAY_MIN +
            (CAROUSEL_DELAY_MAX - CAROUSEL_DELAY_MIN)
            * pow(1.0f - distanceFraction, CAROUSEL_CURVE)
        );

        //Take the slower of the two — most conservative at all times
        unsigned int stepDelay = (accelDelay > decelDelay)
                                  ? accelDelay
                                  : decelDelay;

        //Clamp to valid range
        if (stepDelay < CAROUSEL_DELAY_MIN) stepDelay = CAROUSEL_DELAY_MIN;
        if (stepDelay > CAROUSEL_DELAY_MAX) stepDelay = CAROUSEL_DELAY_MAX;

        carouselStep(direction, stepDelay);
        stepCount++;
    }

    Serial.print("[CAROUSEL] Arrived at slot ");
    Serial.print(targetSlot);
    Serial.print(" (");
    Serial.print(SPICE_NAMES[targetSlot]);
    Serial.print(")  final count: ");
    Serial.print(normalisedCount());
    Serial.print("  steps: ");
    Serial.println(stepCount);

    return true;
}


//CALIBRATION AND STATUS

/**
 * Set the current carousel position as slot 0 (Cumin).
 * Manually align the Cumin module under the auger first.
 * Saves to EEPROM — survives power cycles.
 */
void carouselCalibrate() {
    int raw = readEncoder();
    if (raw < 0) {
        Serial.println("[CAROUSEL] ERROR: Cannot read encoder for calibration");
        return;
    }
    s_homeOffset = raw;
    eepromSaveHomeOffset(s_homeOffset);
    Serial.print("[CAROUSEL] Calibrated. Slot 0 (Cumin) = encoder count ");
    Serial.println(s_homeOffset);
    Serial.println("[CAROUSEL] Saved to EEPROM");
}

void carouselPrintStatus() {
    int raw  = readEncoder();
    if (raw < 0) {
        Serial.println("[CAROUSEL] Encoder not readable");
        return;
    }
    int   norm = normalisedCount();
    float deg  = (norm / (float)ENCODER_COUNTS) * 360.0f;
    int   slot = countToSlot(norm);

    Serial.print("[CAROUSEL] Raw:");
    Serial.print(raw);
    Serial.print("  Norm:");
    Serial.print(norm);
    Serial.print("  Angle:");
    Serial.print(deg, 1);
    Serial.print(" deg  Slot:");
    Serial.print(slot);
    Serial.print(" (");
    Serial.print(SPICE_NAMES[slot]);
    Serial.println(")");
}

void carouselPrintSlotTable() {
    Serial.println("[CAROUSEL] Slot target counts:");
    for (int i = 0; i < NUM_SLOTS; i++) {
        int   count = slotToCount(i);
        float deg   = (count / (float)ENCODER_COUNTS) * 360.0f;
        Serial.print("  Slot ");
        Serial.print(i);
        Serial.print("  ");
        Serial.print(SPICE_NAMES[i]);
        Serial.print("  count=");
        Serial.print(count);
        Serial.print("  (");
        Serial.print(deg, 1);
        Serial.println(" deg)");
    }
}

bool carouselIsReady()    { return s_carouselReady; }
int  carouselCurrentSlot() {
    int n = normalisedCount();
    return (n < 0) ? -1 : countToSlot(n);
}
