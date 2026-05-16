// ============================================================
//  slot_auger_test.cpp
//  Bland2Grand — Manual Slot + Auger Engagement Test
//
//  On power-up assumes the carousel is already on slot 1.
//  Type a slot number (1-8) in the serial monitor and press
//  Enter. The carousel indexes to that slot using the shortest
//  path, then the auger spins for one full revolution forward
//  and reverses back (back-purge), then stops and waits for
//  the next command.
//
//  No encoder, no scale, no WiFi required.
//
//  To flash:
//    Make sure platformio.ini has:
//      build_src_filter = +<main.cpp> -<tests/>
//    Drop this file in as src/main.cpp
//    pio run --target upload
//    pio device monitor --baud 115200
// ============================================================

#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"

// -------------------------------------------------------
// Motor instances
// -------------------------------------------------------
AccelStepper carousel(AccelStepper::DRIVER, PIN_CAROUSEL_STEP, PIN_CAROUSEL_DIR);
AccelStepper auger(AccelStepper::DRIVER,    PIN_AUGER_STEP,    PIN_AUGER_DIR);

// -------------------------------------------------------
// State
// -------------------------------------------------------
uint8_t currentSlot = 1;   // assume slot 1 on power-up

// -------------------------------------------------------
// Helper: move carousel to target slot (shortest path)
// -------------------------------------------------------
void goToSlot(uint8_t target)
{
    if (target < 1 || target > CAROUSEL_SLOT_COUNT)
    {
        Serial.println(F("[ERROR] Invalid slot number."));
        return;
    }

    if (target == currentSlot)
    {
        Serial.println(F("[INFO] Already at that slot - skipping carousel move."));
        return;
    }

    // Shortest-path delta
    int8_t fwd = (int8_t)target - (int8_t)currentSlot;
    if (fwd < 0) fwd += (int8_t)CAROUSEL_SLOT_COUNT;
    int8_t bwd = (int8_t)CAROUSEL_SLOT_COUNT - fwd;

    long stepsToMove;
    if (fwd <= bwd)
        stepsToMove =  (long)fwd * (long)STEPS_PER_SLOT;
    else
        stepsToMove = -(long)bwd * (long)STEPS_PER_SLOT;

    Serial.print(F("[CAROUSEL] Moving from slot "));
    Serial.print(currentSlot);
    Serial.print(F(" -> slot "));
    Serial.print(target);
    Serial.print(F("  ("));
    Serial.print(stepsToMove > 0 ? F("forward") : F("backward"));
    Serial.print(F(", "));
    Serial.print(abs(stepsToMove));
    Serial.println(F(" steps)"));

    carousel.move(stepsToMove);
    while (carousel.distanceToGo() != 0)
        carousel.run();

    currentSlot = target;
    delay(INDEX_SETTLE_MS);

    Serial.print(F("[CAROUSEL] Arrived at slot "));
    Serial.println(currentSlot);
}

// -------------------------------------------------------
// Helper: spin auger forward one revolution then reverse
// -------------------------------------------------------
void runAuger()
{
    Serial.println(F("[AUGER] Spinning forward 1 revolution..."));

    // Forward
    auger.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
    auger.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
    auger.move((long)STEPS_PER_AUGER_CYCLE);

    while (auger.distanceToGo() != 0)
        auger.run();

    delay(200);

    // Back-purge: reverse the same number of steps
    Serial.println(F("[AUGER] Back-purging (reverse 1 revolution)..."));
    auger.setMaxSpeed(BACK_PURGE_SPEED_STEPS_S);
    auger.setAcceleration(BACK_PURGE_SPEED_STEPS_S * 2.0f);
    auger.move(-(long)STEPS_PER_AUGER_CYCLE);

    while (auger.distanceToGo() != 0)
        auger.run();

    // Restore forward settings for next time
    auger.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
    auger.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);

    Serial.println(F("[AUGER] Done."));
}

// -------------------------------------------------------
// setup()
// -------------------------------------------------------
void setup()
{
    Serial.begin(9600);
    while (!Serial && millis() < 3000) {}

    Serial.println(F("============================================"));
    Serial.println(F("  Bland2Grand - Slot + Auger Engagement Test"));
    Serial.println(F("============================================"));
    Serial.println(F("  Assumed starting position: SLOT 1"));
    Serial.print  (F("  Carousel slots : ")); Serial.println(CAROUSEL_SLOT_COUNT);
    Serial.print  (F("  Steps/slot     : ")); Serial.println(STEPS_PER_SLOT);
    Serial.print  (F("  Steps/auger rev: ")); Serial.println(STEPS_PER_AUGER_CYCLE);
    Serial.println();

    // Carousel motor
    carousel.setMaxSpeed(INDEX_SPEED_STEPS_S);
    carousel.setAcceleration(INDEX_ACCEL_STEPS_S2);
    carousel.setCurrentPosition(0);

    // Auger motor
    auger.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
    auger.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
    auger.setCurrentPosition(0);

    Serial.println(F("Type a slot number (1-8) and press Enter:"));
}

// -------------------------------------------------------
// loop()
// -------------------------------------------------------
void loop()
{
    if (Serial.available() > 0)
    {
        int input = Serial.parseInt();

        // Flush remainder of line
        while (Serial.available())
            Serial.read();

        if (input < 1 || input > (int)CAROUSEL_SLOT_COUNT)
        {
            Serial.print(F("[ERROR] '"));
            Serial.print(input);
            Serial.print(F("' is not a valid slot. Enter 1-"));
            Serial.println(CAROUSEL_SLOT_COUNT);
        }
        else
        {
            Serial.println(F("--------------------------------------------"));
            goToSlot((uint8_t)input);
            runAuger();
            Serial.println(F("--------------------------------------------"));
            Serial.println(F("Type next slot number (1-8):"));
        }
    }
}