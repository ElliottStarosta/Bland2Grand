// calibrate.ino — flash this to measure real grams/rev for each slot.
// Open Serial Monitor at 9600 baud and follow the prompts.

#include <Arduino.h>
#include <AccelStepper.h>
#include "Constants.h"
#include "Scale.h"

AccelStepper stepper(AccelStepper::DRIVER, PIN_AUGER_STEP, PIN_AUGER_DIR);
Scale scale;

static const int TEST_REVS = 5; // how many revs to spin per test
static const long TEST_STEPS = TEST_REVS * STEPS_PER_AUGER_CYCLE;

void waitForEnter() {
    Serial.println(F("  >> Press ENTER to continue..."));
    while (Serial.read() != '\n') delay(10);
}

void runRevs(int revs) {
    long steps = revs * STEPS_PER_AUGER_CYCLE;
    stepper.move(-steps);
    while (stepper.distanceToGo() != 0)
        stepper.run();
    delay(500);
}

void setup() {
    Serial.begin(9600);
    while (!Serial && millis() < 3000) {}

    stepper.setMaxSpeed(AUGER_FULL_SPEED_STEPS_S * 0.5f);
    stepper.setAcceleration(AUGER_FULL_SPEED_STEPS_S * 2.0f);
    stepper.enableOutputs();

    if (!scale.begin())
        Serial.println(F("[WARN] HX711 not responding!"));
    else
        Serial.println(F("[OK] Scale ready."));

    Serial.println(F("=== Auger Calibration ==="));
    Serial.println(F("For each slot:"));
    Serial.println(F("  1. Rotate carousel to that slot manually"));
    Serial.println(F("  2. Place empty bowl on scale"));
    Serial.println(F("  3. Follow prompts"));
    Serial.println();
}

void loop() {
    Serial.println(F("Enter slot number (1-8) or 0 to re-tare: "));
    while (!Serial.available()) delay(10);
    int slot = Serial.parseInt();
    Serial.read(); // consume newline

    if (slot == 0) {
        Serial.println(F("Taring..."));
        scale.tare();
        Serial.println(F("Tared."));
        return;
    }

    if (slot < 1 || slot > 8) {
        Serial.println(F("Invalid slot."));
        return;
    }

    Serial.print(F("Slot "));
    Serial.print(slot);
    Serial.println(F(" selected."));
    Serial.println(F("Place bowl on scale and press ENTER to tare."));
    waitForEnter();

    scale.tare();
    delay(500);
    Serial.println(F("Tared. Press ENTER to spin "));
    Serial.print(TEST_REVS);
    Serial.println(F(" revs..."));
    waitForEnter();

    runRevs(TEST_REVS);

    delay(1000); // let spice settle
    float weight = scale.readStable();

    Serial.print(F("Dispensed: "));
    Serial.print(weight, 3);
    Serial.print(F("g over "));
    Serial.print(TEST_REVS);
    Serial.print(F(" revs = "));
    Serial.print(weight / TEST_REVS, 4);
    Serial.println(F(" g/rev"));
    Serial.println(F("Update SlotConfig.h with this value."));
    Serial.println();
}