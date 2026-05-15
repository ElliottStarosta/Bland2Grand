#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"

AccelStepper stepper(AccelStepper::DRIVER, PIN_CAROUSEL_STEP, PIN_CAROUSEL_DIR);

void setup() {
    Serial.begin(9600);

    stepper.setMaxSpeed(8500);
    stepper.setAcceleration(2500);
    stepper.setMinPulseWidth(20);

    unsigned long t0;

    // --- Forward with acceleration ramp ---
    stepper.move(99999999);   // give it a huge forward distance
    t0 = millis();
    while (millis() - t0 < 5000) {
        stepper.run();
    }
    
    // --- Stop fully ---
    stepper.stop();
    while (stepper.isRunning()) {
        stepper.run();
    }

    delay(300);

    // --- Backward with acceleration ramp ---
    stepper.move(-99999999);  // huge backward distance
    t0 = millis();
    while (millis() - t0 < 5000) {
        stepper.run();
    }

    // --- Final stop ---
    stepper.stop();
    while (stepper.isRunning()) {
        stepper.run();
    }
}

void loop() {}
