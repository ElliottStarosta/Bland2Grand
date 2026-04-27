#include <Wire.h>
#include <EEPROM.h>
#include <WiFiS3.h>
#include <ArduinoJson.h>

#include "Constants.h"
#include "Scale.h"
#include "Encoder.h"
#include "FlowModel.h"
#include "Carousel.h"
#include "Auger.h"
#include "WiFiComm.h"
#include "StateMachine.h"
#include "WiFiManager.h"

// Subsystems
Scale scale;
Encoder encoder;
FlowModel model;
WiFiComm wifi;
WiFiManager wifiManager(wifi);
Carousel carousel(encoder);
Auger auger(scale, model, wifi);
StateMachine sm(carousel, auger, scale, model, wifi);

void setup()
{
    Serial.begin(115200);
    while (!Serial && millis() < 3000)
    {
    }

    // 1. I2C
    Wire.begin();
    Wire.setClock(400000);

    // 2. Encoder
    if (!encoder.begin())
    {
        Serial.println(F("[WARN] AS5600 not detected, carousel runs open-loop."));
    }
    else
    {
        Serial.println(F("[OK]   AS5600 encoder connected."));
    }

    // 3. Scale
    scale.begin();
    Serial.println(F("[OK]   HX711 scale initialised."));

    // 4. Flow model (loads EEPROM regression data)
    model.begin();
    Serial.println(F("[OK]   FlowModel loaded from EEPROM."));

    for (uint8_t s = 0; s < CAROUSEL_SLOT_COUNT; s++)
    {
        Serial.print(F("       Slot "));
        Serial.print(s + 1);
        Serial.print(F(": slope="));
        Serial.print(model.getSlope(s), 4);
        Serial.print(F("  coast="));
        Serial.print(model.getCoast(s), 3);
        Serial.print(F("g  n="));
        Serial.println(model.getSamples(s));
    }

    // 5. Carousel + Auger
    carousel.begin();
    Serial.println(F("[OK]   Carousel (M1) initialised."));
    auger.begin();
    Serial.println(F("[OK]   Auger (M2) initialised."));

    // 6. WiFi credentials  load from EEPROM, or provision via Serial
    bool wifiOk = wifiManager.begin();

    if (!wifiOk)
    {
        Serial.println(F("[WARN] System running without network features."));
    }

    Serial.println(F("\nSetup complete. State machine starting.\n"));
}

void loop()
{
    sm.update();
    carousel.runService();
    auger.runService();
}