#include <Wire.h>
#include "Constants.h"
#include "Scale.h"
#include "Encoder.h"
#include "FlowModel.h"
#include "Carousel.h"
#include "Auger.h"
#include "WiFiComm.h"
#include "StateMachine.h"

// WiFi credentials — edit before flashing
static const char WIFI_SSID[] = "YOUR_SSID_HERE";
static const char WIFI_PASSWORD[] = "YOUR_PASSWORD_HERE";

// Global subsystem instances
Scale scale;
Encoder encoder;
FlowModel model;
Carousel carousel(encoder);
Auger auger(scale, model);
WiFiComm wifi;
StateMachine sm(carousel, auger, scale, model, wifi);

void setup()
{
    Serial.begin(115200);
    while (!Serial && millis() < 3000)
    {
    } // Wait up to 3 s for Serial (USB CDC)

    Serial.println(F(" Bland2Grand Firmware v1.0 "));
    Serial.println(F("Initialising subsystems..."));

    // 1. I2C bus
    Wire.begin();
    Wire.setClock(400000); // 400 kHz fast-mode for AS5600

    // 2. Encoder
    if (!encoder.begin())
    {
        Serial.println(F("[WARN] AS5600 encoder not detected. Verify wiring and magnet gap."));
        // Non-fatal: carousel will run open-loop (homing will fail gracefully)
    }
    else
    {
        Serial.println(F("[OK] AS5600 encoder connected."));
    }

    // 3. Scale
    scale.begin();
    Serial.println(F("[OK] HX711 scale initialised."));

    // 4. Flow model (loads EEPROM regression data)
    model.begin();
    Serial.println(F("[OK] FlowModel loaded from EEPROM."));

    // Print model summary for each slot
    for (uint8_t s = 0; s < CAROUSEL_SLOT_COUNT; s++)
    {
        Serial.print(F("  Slot "));
        Serial.print(s + 1);
        Serial.print(F(": slope"));
        Serial.print(model.getSlope(s), 4);
        Serial.print(F(" g/cycle  coast"));
        Serial.print(model.getCoast(s), 3);
        Serial.print(F(" g  n"));
        Serial.println(model.getSamples(s));
    }

    // 5. Carousel motor
    carousel.begin();
    Serial.println(F("[OK] Carousel (M1) initialised."));

    // 6. Auger motor
    auger.begin();
    Serial.println(F("[OK] Auger (M2) initialised."));

    // 7. WiFi
    Serial.print(F("[WiFi] Connecting to "));
    Serial.print(WIFI_SSID);
    Serial.print(F("..."));

    if (wifi.begin(WIFI_SSID, WIFI_PASSWORD))
    {
        Serial.println(F(" connected."));
        wifi.printIP();
    }
    else
    {
        Serial.println(F(" FAILED. Running without WiFi (homing only)."));
        // Non-fatal: subsystems still initialise; WiFi poll will be a no-op
    }

    Serial.println(F("Setup complete. Starting state machine."));
    Serial.println(F(""));
}

//
// loop()
//
void loop()
{
    sm.update();

    // Keep background stepper service running (for future non-blocking extension)
    carousel.runService();
    auger.runService();
}
