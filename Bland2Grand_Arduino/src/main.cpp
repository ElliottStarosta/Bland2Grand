#include <Arduino.h>
#include "Constants.h"

#define STEP_PIN  PIN_AUGER_STEP
#define DIR_PIN   PIN_AUGER_DIR

// Lower = faster. Minimum ~2 before it breaks
#define PULSE_DELAY_US  2

void doMove(long steps);
void doSpin(uint32_t duration_ms);

void setup()
{
    Serial.begin(9600);
    pinMode(STEP_PIN, OUTPUT);
    pinMode(DIR_PIN, OUTPUT);
    delay(1000);
    Serial.println("=== AUGER MOTOR TEST START ===");
}

void loop()
{
    Serial.println("\nForward (5 revs)...");
    digitalWrite(DIR_PIN, HIGH);
    doMove(1600 * 5);
    delay(2000);

    Serial.println("\nReverse (5 revs)...");
    digitalWrite(DIR_PIN, LOW);
    doMove(1600 * 5);
    delay(2000);

    Serial.println("\nContinuous spin (5 sec)...");
    digitalWrite(DIR_PIN, HIGH);
    doSpin(5000);
    delay(2000);
}

void doMove(long steps)
{
    for (long i = 0; i < steps; i++)
    {
        digitalWrite(STEP_PIN, HIGH);
        delayMicroseconds(PULSE_DELAY_US);
        digitalWrite(STEP_PIN, LOW);
        delayMicroseconds(PULSE_DELAY_US);
    }
    Serial.println("Done.");
}

void doSpin(uint32_t duration_ms)
{
    uint32_t start = millis();
    while (millis() - start < duration_ms)
    {
        digitalWrite(STEP_PIN, HIGH);
        delayMicroseconds(PULSE_DELAY_US);
        digitalWrite(STEP_PIN, LOW);
        delayMicroseconds(PULSE_DELAY_US);
    }
    Serial.println("Stopped.");
}