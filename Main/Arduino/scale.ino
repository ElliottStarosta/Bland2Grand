//scale.ino
//Manages the HX711 24-bit ADC and 1kg load cell.
//
//Responsibilities:
//  - Read raw HX711 counts and convert to grams
//  - Tare (zero) the scale before each dispense
//  - Average multiple readings to reduce noise
//  - Maintain a rolling buffer of timestamped readings
//    for real-time flow rate calculation (g/s)
//  - Calculate dynamic inflight mass using freefall physics
//
//CALIBRATION:
//  Send SCALECAL:<known_grams> with a weight on the scale.
//  The calibration factor is saved to EEPROM.
//  Factory default is SCALE_CALIBRATION_FACTOR from config.h.
//
//HX711 WIRING:
//  VCC → Arduino 5V
//  GND → Arduino GND
//  DT  → Arduino D8
//  SCK → Arduino D9

#include "config.h"
#include <math.h>

//----------------------------------------------------------------
//HX711 STATE
//----------------------------------------------------------------
static long s_tareOffset = 0;
static float s_calibrationFactor = SCALE_CALIBRATION_FACTOR;
static bool s_scaleReady = false;

//----------------------------------------------------------------
//FLOW RATE RING BUFFER
//Stores the last FLOW_BUFFER_SIZE (weight, timestamp) pairs.
//Used for linear regression to calculate g/s flow rate.
//----------------------------------------------------------------
static float s_flowWeights[FLOW_BUFFER_SIZE];
static unsigned long s_flowTimes[FLOW_BUFFER_SIZE];
static int s_flowIndex = 0;
static int s_flowFilled = 0; //how many slots have data

//Precomputed freefall time from DROP_HEIGHT_M
static float s_timeInAir = 0.0f;

//HX711 LOW-LEVEL READ

/**
 * Bit-bang read one 24-bit raw count from HX711.
 * Channel A, gain 128 (default).
 * Blocks until HX711 is ready (DOUT goes LOW).
 * Times out after SCALE_READ_TIMEOUT_MS and returns 0.
 */
long hx711ReadRaw()
{
    unsigned long start = millis();

    //Wait for HX711 to signal data ready (DOUT = LOW)
    while (digitalRead(HX711_DT_PIN) == HIGH)
    {
        if (millis() - start > SCALE_READ_TIMEOUT_MS)
        {
            Serial.println("[SCALE] WARNING: HX711 read timeout");
            return 0L;
        }
    }

    long count = 0;

    //Clock in 24 data bits
    for (int i = 0; i < 24; i++)
    {
        digitalWrite(HX711_SCK_PIN, HIGH);
        delayMicroseconds(1);
        count = (count << 1) | digitalRead(HX711_DT_PIN);
        digitalWrite(HX711_SCK_PIN, LOW);
        delayMicroseconds(1);
    }

    //25th pulse — sets gain 128 for next read
    digitalWrite(HX711_SCK_PIN, HIGH);
    delayMicroseconds(1);
    digitalWrite(HX711_SCK_PIN, LOW);
    delayMicroseconds(1);

    //Convert 24-bit two's complement to signed long
    if (count & 0x800000)
        count |= 0xFF000000;

    return count;
}

/**
 * Read one raw value, apply tare offset, return net counts.
 */
long hx711ReadNet()
{
    return hx711ReadRaw() - s_tareOffset;
}

/**
 * Convert net counts to grams using calibration factor.
 */
float countsToGrams(long counts)
{
    return (float)counts / s_calibrationFactor;
}

//PUBLIC SCALE API

/**
 * Initialise HX711 pins and load calibration from EEPROM.
 */
void scaleInit()
{
    pinMode(HX711_DT_PIN, INPUT);
    pinMode(HX711_SCK_PIN, OUTPUT);
    digitalWrite(HX711_SCK_PIN, LOW);

    s_calibrationFactor = eepromLoadScaleCal();
    s_timeInAir = sqrt(2.0f * DROP_HEIGHT_M / 9.81f);
    s_scaleReady = true;

    Serial.println("[SCALE] Ready");
    Serial.print("[SCALE] Calibration factor: ");
    Serial.println(s_calibrationFactor, 2);
    Serial.print("[SCALE] Drop height: ");
    Serial.print(DROP_HEIGHT_M * 100, 1);
    Serial.print(" cm  Freefall time: ");
    Serial.print(s_timeInAir * 1000, 1);
    Serial.println(" ms");
}

/**
 * Tare the scale. Averages SCALE_AVERAGE_SAMPLES readings and
 * stores as the zero point. Call before every dispense.
 */
void scaleTare()
{
    Serial.print("[SCALE] Taring...");
    long sum = 0;
    for (int i = 0; i < SCALE_AVERAGE_SAMPLES; i++)
    {
        sum += hx711ReadRaw();
    }
    s_tareOffset = sum / SCALE_AVERAGE_SAMPLES;

    //Reset flow buffer
    s_flowIndex = 0;
    s_flowFilled = 0;

    Serial.print(" done. Tare offset: ");
    Serial.println(s_tareOffset);
}

/**
 * Read the current weight in grams (after tare).
 * Returns a single reading — noisy but fast.
 * Use scaleAverage() for settled weight.
 */
float scaleRead()
{
    if (!s_scaleReady)
        return 0.0f;
    return countsToGrams(hx711ReadNet());
}

/**
 * Average N consecutive HX711 readings and return grams.
 * More stable than scaleRead() but slower.
 */
float scaleAverage(int samples)
{
    if (!s_scaleReady)
        return 0.0f;
    long sum = 0;
    for (int i = 0; i < samples; i++)
    {
        sum += hx711ReadNet();
    }
    return countsToGrams(sum / samples);
}

/**
 * Block until the scale reading stabilises.
 * Stable = SETTLE_READINGS consecutive readings within SETTLE_TOLERANCE_G.
 * Returns the settled weight.
 * Times out after (SETTLE_READINGS * SETTLE_WAIT_MS * 10) ms.
 */
float scaleSettle()
{
    float last = scaleRead();
    int stable = 0;
    int attempts = 0;
    int maxTries = SETTLE_READINGS * 20;

    while (stable < SETTLE_READINGS && attempts < maxTries)
    {
        delay(SETTLE_WAIT_MS);
        float current = scaleRead();
        if (fabs(current - last) <= SETTLE_TOLERANCE_G)
        {
            stable++;
        }
        else
        {
            stable = 0;
        }
        last = current;
        attempts++;
    }

    return scaleAverage(SCALE_AVERAGE_SAMPLES);
}

//FLOW RATE AND INFLIGHT MASS

/**
 * Push a new (weight, timestamp) pair into the rolling buffer.
 * Call this every time you read the scale during a dispense.
 */
void scalePushReading(float grams)
{
    s_flowWeights[s_flowIndex] = grams;
    s_flowTimes[s_flowIndex] = micros();
    s_flowIndex = (s_flowIndex + 1) % FLOW_BUFFER_SIZE;
    if (s_flowFilled < FLOW_BUFFER_SIZE)
        s_flowFilled++;
}

/**
 * Calculate current flow rate in grams per second using
 * linear regression over the rolling buffer.
 *
 * Linear regression gives a much more noise-resistant slope
 * than a simple two-point difference.
 *
 * Returns 0 if fewer than 3 readings are available.
 */
float scaleFlowRate()
{
    if (s_flowFilled < 3)
        return 0.0f;

    int n = s_flowFilled;
    double sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;

    unsigned long now = micros();

    for (int i = 0; i < n; i++)
    {
        //Time in seconds relative to now (negative, going backward)
        double t = (double)((long)(s_flowTimes[i] - now)) / 1000000.0;
        double g = (double)s_flowWeights[i];
        sumX += t;
        sumY += g;
        sumXY += t * g;
        sumX2 += t * t;
    }

    double denom = (n * sumX2 - sumX * sumX);
    if (fabs(denom) < 1e-12)
        return 0.0f;

    //Slope = d(grams)/d(time) = flow rate in g/s
    //Slope is positive because weight increases over positive time
    double slope = (n * sumXY - sumX * sumY) / denom;

    //Clamp to physically plausible range (0 to 10 g/s)
    float rate = (float)fabs(slope);
    return (rate > 10.0f) ? 10.0f : rate;
}

/**
 * Calculate the mass of spice currently in the air.
 * inflight = flow_rate (g/s) × time_in_air (s)
 */
float scaleInflightMass()
{
    return scaleFlowRate() * s_timeInAir;
}

/**
 * Calculate the dynamic stop point for the motor.
 * Stop when scale reads: target - inflight_mass
 */
float scaleDynamicStopAt(float targetGrams)
{
    float inflight = scaleInflightMass();
    float stopAt = targetGrams - inflight;
    //Never stop more than 50% early — sanity clamp
    float minStop = targetGrams * 0.5f;
    return (stopAt < minStop) ? minStop : stopAt;
}

// CALIBRATION

/**
 * Calibrate the scale with a known weight on the bowl.
 * knownGrams: the actual weight of the object on the scale.
 * Saves the new calibration factor to EEPROM.
 */
void scaleCalibrateWithWeight(float knownGrams)
{
    if (knownGrams <= 0)
    {
        Serial.println("[SCALE] ERROR: Known weight must be > 0");
        return;
    }
    Serial.print("[SCALE] Calibrating with ");
    Serial.print(knownGrams, 2);
    Serial.println("g reference weight...");

    long net = 0;
    for (int i = 0; i < 16; i++)
    {
        net += hx711ReadNet();
    }
    net /= 16;

    if (net == 0)
    {
        Serial.println("[SCALE] ERROR: Zero net reading — is weight on scale?");
        return;
    }

    s_calibrationFactor = (float)net / knownGrams;
    eepromSaveScaleCal(s_calibrationFactor);

    Serial.print("[SCALE] New calibration factor: ");
    Serial.print(s_calibrationFactor, 2);
    Serial.println(" (saved to EEPROM)");
}

void scalePrintStatus()
{
    float w = scaleAverage(8);
    Serial.print("[SCALE] Current weight: ");
    Serial.print(w, 2);
    Serial.print("g  Cal factor: ");
    Serial.print(s_calibrationFactor, 2);
    Serial.print("  Drop height: ");
    Serial.print(DROP_HEIGHT_M * 100, 1);
    Serial.print("cm  Freefall: ");
    Serial.print(s_timeInAir * 1000, 1);
    Serial.println("ms");
}

bool scaleIsReady() { return s_scaleReady; }
