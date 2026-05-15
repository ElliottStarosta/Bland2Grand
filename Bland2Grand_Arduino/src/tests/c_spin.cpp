#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"

AccelStepper stepper(AccelStepper::DRIVER, PIN_CAROUSEL_STEP, PIN_CAROUSEL_DIR);

void setup() {
    Serial.begin(9600);

    stepper.setMaxSpeed(2500);
    stepper.setAcceleration(500);
    stepper.setMinPulseWidth(20);

    // Command a huge forward move so it never finishes
    stepper.moveTo(99999999);
}

void loop() {
    stepper.run();   // keeps accelerating and running forever
}
