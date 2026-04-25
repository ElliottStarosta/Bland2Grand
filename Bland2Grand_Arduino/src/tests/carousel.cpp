#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"

AccelStepper stepper(AccelStepper::DRIVER, PIN_CAROUSEL_STEP, PIN_CAROUSEL_DIR);

const uint8_t NUM_SLOTS = 8;
uint8_t currentSlot = 1; // assume starting at slot 1

void setup()
{
    Serial.begin(9600);
    while (!Serial && millis() < 3000) {}

    stepper.setMaxSpeed(INDEX_SPEED_STEPS_S);
    stepper.setAcceleration(INDEX_SPEED_STEPS_S * 2.0f);
    stepper.setMinPulseWidth(10);
    stepper.setCurrentPosition(0);

    Serial.println("=== Carousel Debug Test ===");
    Serial.print("Starting at slot: ");
    Serial.println(currentSlot);
    Serial.println("Enter slot number (1–8):");
}

void loop()
{
    if (Serial.available() > 0)
    {
        uint8_t targetSlot = Serial.parseInt();

        while (Serial.available()) Serial.read(); // clear buffer

        if (targetSlot < 1 || targetSlot > NUM_SLOTS)
        {
            Serial.println("❌ Invalid slot. Enter 1–8.");
            return;
        }

        Serial.println("\n--- MOVE REQUEST ---");
        Serial.print("Current slot: ");
        Serial.println(currentSlot);

        Serial.print("Target slot: ");
        Serial.println(targetSlot);

        if (targetSlot == currentSlot)
        {
            Serial.println("⚠️ Already at that slot.");
            return;
        }

        // Shortest path logic
        int8_t diff = (int8_t)targetSlot - (int8_t)currentSlot;

        if (diff > NUM_SLOTS / 2)
            diff -= NUM_SLOTS;
        else if (diff < -NUM_SLOTS / 2)
            diff += NUM_SLOTS;

        long stepsToMove = (long)diff * (long)STEPS_PER_SLOT;

        Serial.print("Slot difference (shortest path): ");
        Serial.println(diff);

        Serial.print("Steps to move: ");
        Serial.println(stepsToMove);

        Serial.print("Direction: ");
        if (diff > 0)
            Serial.println("FORWARD");
        else
            Serial.println("BACKWARD");

        // Execute move
        stepper.move(stepsToMove);

        while (stepper.distanceToGo() != 0)
        {
            stepper.run();
        }

        currentSlot = targetSlot;

        delay(INDEX_SETTLE_MS);

        Serial.println("--- MOVE COMPLETE ---");
        Serial.print("Now at slot: ");
        Serial.println(currentSlot);
        Serial.println("----------------------\n");
        Serial.println("Enter next slot (1–8):");
    }
}