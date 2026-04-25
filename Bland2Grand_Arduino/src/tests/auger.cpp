#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"

AccelStepper auger(AccelStepper::DRIVER, PIN_AUGER_STEP, PIN_AUGER_DIR);

enum State {
    FORWARD,
    BACKWARD
};

State state = FORWARD;

void setup() {
    Serial.begin(9600);
    while (!Serial && millis() < 3000) {}

    // Same config as Auger::begin()
    auger.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
    auger.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
    auger.setCurrentPosition(0);

    // Start with 1 forward revolution
    auger.move(STEPS_PER_AUGER_CYCLE);

    Serial.println("1 rev forward / 1 rev backward test");
}

void loop() {
    auger.run();

    // When movement finishes, switch direction
    if (auger.distanceToGo() == 0) {
        delay(100); // small settle delay (like real system behavior)

        if (state == FORWARD) {
            state = BACKWARD;

            auger.setMaxSpeed(BACK_PURGE_SPEED_STEPS_S);
            auger.setAcceleration(BACK_PURGE_SPEED_STEPS_S * 2.0f);
            auger.move(-STEPS_PER_AUGER_CYCLE);

            Serial.println("Backward 1 rev");
        } else {
            state = FORWARD;

            auger.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S);
            auger.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
            auger.move(STEPS_PER_AUGER_CYCLE);

            Serial.println("Forward 1 rev");
        }
    }
}