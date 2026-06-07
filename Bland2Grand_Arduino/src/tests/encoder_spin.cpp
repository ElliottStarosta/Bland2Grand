// encoder_spin.cpp - bench test: spin the carousel and watch AS5600 counts.
// Point platformio.ini at this file instead of main.cpp, then flash.
#include <Arduino.h>
#include <Wire.h>
#include <AccelStepper.h>
#include "Constants.h"

// AS5600 direct register reads (no library needed)
#define AS5600_ADDR   0x36
#define REG_STATUS    0x0B
#define REG_RAW_HI    0x0C
#define REG_RAW_LO    0x0D
#define REG_AGC       0x1A

// Motor config
// Slow speed: 200 microsteps/s (~11 rpm at 1/8 step) – easy to watch encoder
static constexpr float TEST_SPEED        = 200.0f;  // microsteps / s
static constexpr float TEST_ACCEL        = 400.0f;  // microsteps / s²

// How many steps per print interval
static constexpr uint32_t PRINT_EVERY_MS = 200;     // print every 200 ms

// How many full carousel slots to travel before reversing
// (1 slot = STEPS_PER_SLOT steps = 400 microsteps by default)
static constexpr uint8_t  SLOTS_TO_TRAVEL = 4;

// Globals
AccelStepper motor(AccelStepper::DRIVER, PIN_CAROUSEL_STEP, PIN_CAROUSEL_DIR);

long   targetSteps    = 0;
bool   movingForward  = true;
long   totalStepsMoved = 0;

// AS5600 helpers
uint8_t readReg(uint8_t reg)
{
    Wire.beginTransmission(AS5600_ADDR);
    Wire.write(reg);
    Wire.endTransmission(false);
    Wire.requestFrom(AS5600_ADDR, (uint8_t)1);
    uint32_t t = millis();
    while (!Wire.available() && millis() - t < 10);
    return Wire.available() ? Wire.read() : 0xFF;
}

uint16_t readRawAngle()
{
    uint16_t hi = readReg(REG_RAW_HI) & 0x0F;
    uint8_t  lo = readReg(REG_RAW_LO);
    return (hi << 8) | lo;
}

// Returns human-readable magnet status string
const char* magnetStatus(uint8_t status)
{
    if (!(status & 0x20)) return "NO MAGNET  <-- check gap/wiring";
    if (status  & 0x08)   return "TOO STRONG <-- move magnet away";
    if (status  & 0x10)   return "TOO WEAK   <-- move magnet closer";
    return "OK";
}

// Setup
void setup()
{
    Serial.begin(115200);
    while (!Serial && millis() < 3000) {}

    Serial.println(F("============================================"));
    Serial.println(F("  Bland2Grand: Encoder + Motor Tracking Test"));
    Serial.println(F("============================================"));
    Serial.println(F("  Motor: NEMA 23 via TB6600 (M1/Carousel)"));
    Serial.println(F("  Encoder: AS5600 on I2C (A4=SDA, A5=SCL)"));
    Serial.println();

    // I2C
    Wire.begin();
    Wire.setClock(400000);

    // Check AS5600 is on the bus
    Wire.beginTransmission(AS5600_ADDR);
    bool encoderFound = (Wire.endTransmission() == 0);

    if (!encoderFound)
    {
        Serial.println(F("[ERROR] AS5600 not found at 0x36!"));
        Serial.println(F("  Check: SDA->A4, SCL->A5, 3.3V, GND, magnet gap ~1-2mm"));
        Serial.println(F("  Halting."));
        while (true) { delay(1000); }
    }
    Serial.println(F("[OK]  AS5600 found at 0x36."));

    // Wait for magnet detection
    Serial.println(F("  Waiting for magnet..."));
    uint32_t t = millis();
    uint8_t status = 0;
    while (!(status & 0x20))
    {
        status = readReg(REG_STATUS);
        if (millis() - t > 5000)
        {
            Serial.println(F("[WARN] Magnet not detected after 5s — continuing anyway."));
            break;
        }
        delay(200);
    }
    if (status & 0x20)
        Serial.println(F("[OK]  Magnet detected."));

    // Motor init
    motor.setMaxSpeed(TEST_SPEED);
    motor.setAcceleration(TEST_ACCEL);
    motor.setCurrentPosition(0);

    // Queue the first move: SLOTS_TO_TRAVEL slots forward
    targetSteps = static_cast<long>(SLOTS_TO_TRAVEL) * STEPS_PER_SLOT;
    motor.moveTo(targetSteps);
    movingForward = true;

    // Header row
    Serial.println();
    Serial.println(F("  Steps  | StepPos | RawAngle | Degrees  | AGC | Magnet"));
    Serial.println(F("  -------|---------|----------|----------|-----|-------"));
}

// Loop
void loop()
{
    static uint32_t lastPrint = 0;

    // Keep motor running (non-blocking)
    motor.run();

    // Reverse direction when target reached
    if (motor.distanceToGo() == 0)
    {
        delay(300); // brief pause at end of travel

        movingForward = !movingForward;
        if (movingForward)
            targetSteps += static_cast<long>(SLOTS_TO_TRAVEL) * STEPS_PER_SLOT;
        else
            targetSteps -= static_cast<long>(SLOTS_TO_TRAVEL) * STEPS_PER_SLOT;

        motor.moveTo(targetSteps);

        Serial.println();
        Serial.print(F("  >>> Reversing direction: "));
        Serial.println(movingForward ? F("FORWARD") : F("BACKWARD"));
        Serial.println();
    }

    // Print encoder + step data at fixed interval
    uint32_t now = millis();
    if (now - lastPrint >= PRINT_EVERY_MS)
    {
        lastPrint = now;

        uint8_t  status = readReg(REG_STATUS);
        uint8_t  agc    = readReg(REG_AGC);
        uint16_t raw    = readRawAngle();
        float    deg    = raw * (360.0f / 4096.0f);
        long     pos    = motor.currentPosition();

        // Track total steps moved (absolute)
        static long lastPos = 0;
        totalStepsMoved += abs(pos - lastPos);
        lastPos = pos;

        char buf[80];
        snprintf(buf, sizeof(buf),
                 "  %6ld | %7ld | %8u | %7.2f  | %3u | %s",
                 totalStepsMoved, pos, raw, deg, agc, magnetStatus(status));
        Serial.println(buf);
    }
}