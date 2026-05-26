// ============================================================
//  scale_cal.cpp  —  Bland2Grand HX711 Load Cell Calibration
//
//  Uses Scale.h (the production wrapper) so behaviour here
//  exactly matches the real firmware.
//
//  TWO-PHASE process:
//    Phase 1 — Find calFactor (run once with a known weight)
//    Phase 2 — Verify live readings (run with SCALE_CAL_FACTOR
//              already set in Constants.h)
//
//  To flash:
//    Edit platformio.ini:
//      build_src_filter = +<tests/scale_cal.cpp> -<main.cpp>
//    pio run --target upload
//    pio device monitor --baud 9600
// ============================================================

#include <Arduino.h>
#include "Constants.h"
#include "Scale.h"

#define PHASE 2


static constexpr float KNOWN_WEIGHT_G = 50.0f;


static constexpr float REFERENCE_WEIGHT_G = 50.0f;

Scale scale;


void waitForEnter()
{
    while (Serial.available()) Serial.read();
    while (!Serial.available()) {}
    delay(50);
    while (Serial.available()) Serial.read();
}


#if PHASE == 1

void runPhase1()
{
    Serial.println(F("============================================"));
    Serial.println(F("  PHASE 1  --  Find calFactor"));
    Serial.println(F("============================================"));
    Serial.println();

    // Scale::begin() tares automatically, but we need the raw
    // zero reading before calibration is applied, so we talk
    // directly to the underlying HX711 via rawRead().
    Serial.println(F("Step 1: Remove ALL weight from the scale."));
    Serial.println(F("        Press Enter when ready to tare."));
    waitForEnter();

    // Tare through Scale so the zero offset is stored internally
    scale.tare();
    long zeroReading = scale.rawRead();

    Serial.print(F("[OK]  Tare complete. Zero raw reading: "));
    Serial.println(zeroReading);
    Serial.println();

    Serial.print(F("Step 2: Place your known weight ("));
    Serial.print(KNOWN_WEIGHT_G, 1);
    Serial.println(F(" g) on the scale."));
    Serial.println(F("        Press Enter when ready."));
    waitForEnter();

    long loadedReading = scale.rawRead();
    Serial.print(F("[OK]  Loaded raw reading: "));
    Serial.println(loadedReading);
    Serial.println();

    float calFactor = (float)(loadedReading - zeroReading) / KNOWN_WEIGHT_G;

    Serial.println(F("============================================"));
    Serial.print(F("  calFactor = "));
    Serial.println(calFactor, 4);
    Serial.println(F("============================================"));
    Serial.println();
    Serial.println(F("Next steps:"));
    Serial.println(F("  1. In Constants.h set:"));
    Serial.println(F("       static constexpr float SCALE_CAL_FACTOR = <value>;"));
    Serial.println(F("  2. Set #define PHASE 2 and reflash to verify."));
    Serial.println();
    Serial.println(F("Streaming live readings with this calFactor..."));

    // Apply the new factor and stream so you can sanity-check now
    scale.setCalFactor(calFactor);
    while (true)
    {
        Serial.print(F("  Live: "));
        Serial.print(scale.read(), 3);
        Serial.println(F(" g"));
        delay(500);
    }
}

#endif  // PHASE == 1


#if PHASE == 2

void printHeader()
{
    if (REFERENCE_WEIGHT_G > 0.0f)
    {
        Serial.println(F("  Weight (g)    raw           error vs ref    % error"));
        Serial.println(F("  ----------    -----------   --------------  --------"));
    }
    else
    {
        Serial.println(F("  Weight (g)    raw"));
        Serial.println(F("  ----------    -----------"));
    }
}

void runPhase2()
{
    Serial.println(F("============================================"));
    Serial.println(F("  PHASE 2  --  Live Calibrated Readings"));
    Serial.println(F("============================================"));
    Serial.print(F("  SCALE_CAL_FACTOR : "));
    Serial.println(SCALE_CAL_FACTOR, 4);
    Serial.print(F("  Reference weight : "));
    Serial.print(REFERENCE_WEIGHT_G, 1);
    Serial.println(F(" g"));
    Serial.println();
    Serial.println(F("Commands (send over Serial + Enter):"));
    Serial.println(F("  t  -- re-tare"));
    Serial.println(F("  r  -- single reading"));
    Serial.println(F("  s  -- toggle stream on/off"));
    Serial.println(F("  h  -- reprint header"));
    Serial.println();

    // Scale::begin() already tared in setup() — confirm it
    Serial.println(F("[OK]  Auto-tared on boot (via Scale::begin)."));
    Serial.println(F("      Place weights and observe readings."));
    Serial.println();
    printHeader();

    bool streaming = true;
    uint32_t lastRead = 0;

    while (true)
    {
        // ---- serial commands ----
        if (Serial.available())
        {
            char cmd = (char)Serial.read();
            while (Serial.available()) Serial.read(); // flush rest of line

            if (cmd == 't' || cmd == 'T')
            {
                Serial.println(F("[TARE] Remove all weight, then press Enter..."));
                waitForEnter();
                scale.tare();
                Serial.println(F("[OK]  Re-tared."));
                printHeader();
            }
            else if (cmd == 'r' || cmd == 'R')
            {
                float w   = scale.read();
                long  raw = scale.rawRead();
                Serial.print(F("[READ] "));
                Serial.print(w, 4);
                Serial.print(F(" g   raw: "));
                Serial.print(raw);
                if (REFERENCE_WEIGHT_G > 0.0f)
                {
                    float err = w - REFERENCE_WEIGHT_G;
                    float pct = (err / REFERENCE_WEIGHT_G) * 100.0f;
                    Serial.print(F("   err: "));
                    if (err >= 0.0f) Serial.print('+');
                    Serial.print(err, 4);
                    Serial.print(F(" g  ("));
                    if (pct >= 0.0f) Serial.print('+');
                    Serial.print(pct, 3);
                    Serial.print(F("%)"));
                }
                Serial.println();
            }
            else if (cmd == 's' || cmd == 'S')
            {
                streaming = !streaming;
                Serial.print(F("[STREAM] "));
                Serial.println(streaming ? F("ON") : F("OFF"));
            }
            else if (cmd == 'h' || cmd == 'H')
            {
                printHeader();
            }
        }

        // ---- continuous stream ----
        if (streaming && millis() - lastRead >= SCALE_POLL_MS * 5)
        {
            lastRead = millis();

            if (!scale.isReady())
            {
                Serial.println(F("  [HX711 not ready]"));
                continue;
            }

            float w   = scale.read();
            long  raw = scale.rawRead();

            Serial.print(F("  "));
            Serial.print(w, 4);
            Serial.print(F(" g"));

            // pad weight column to 14 chars
            int wLen = String(w, 4).length() + 2;
            for (int i = wLen; i < 14; i++) Serial.print(' ');

            Serial.print(F("    "));
            Serial.print(raw);

            if (REFERENCE_WEIGHT_G > 0.0f)
            {
                float err = w - REFERENCE_WEIGHT_G;
                float pct = (err / REFERENCE_WEIGHT_G) * 100.0f;

                int rLen = String(raw).length();
                for (int i = rLen; i < 12; i++) Serial.print(' ');

                Serial.print(F("   "));
                if (err >= 0.0f) Serial.print('+');
                Serial.print(err, 4);
                Serial.print(F(" g"));

                int eLen = String(err, 4).length() + 3;
                for (int i = eLen; i < 16; i++) Serial.print(' ');

                if (pct >= 0.0f) Serial.print('+');
                Serial.print(pct, 3);
                Serial.print(F("%"));
            }

            Serial.println();
        }
    }
}

#endif  // PHASE == 2

// -------------------------------------------------------
//  setup / loop
// -------------------------------------------------------
void setup()
{
    Serial.begin(9600);
    while (!Serial && millis() < 3000) {}

    if (!scale.begin())
    {
        Serial.println(F("[ERROR] HX711 not responding!"));
        Serial.println(F("  Check: DOUT->D9, SCK->D10, 5V, GND."));
        while (true) {}
    }

    Serial.println(F("[OK]  HX711 ready."));

#if PHASE == 1
    runPhase1();
#elif PHASE == 2
    runPhase2();
#endif
}

void loop() {}
