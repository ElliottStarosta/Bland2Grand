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

// WiFi credential EEPROM layout
static constexpr uint16_t CRED_BASE = 200;
static constexpr uint16_t CRED_SSID_OFF = 0;   // 33 bytes  (max 32-char SSID + null)
static constexpr uint16_t CRED_PASS_OFF = 33;  // 65 bytes  (max 64-char password + null)
static constexpr uint16_t CRED_MAGIC_OFF = 98; // 1 byte
static constexpr uint8_t CRED_MAGIC = 0xB2;

// Credential storage
static char g_ssid[33] = {};
static char g_password[65] = {};

// Subsystems
Scale scale;
Encoder encoder;
FlowModel model;
Carousel carousel(encoder);
Auger auger(scale, model);
WiFiComm wifi;
StateMachine sm(carousel, auger, scale, model, wifi);

// EEPROM helpers

static void saveString(uint16_t addr, const char *str, uint8_t maxLen)
{
    for (uint8_t i = 0; i < maxLen; i++)
    {
        EEPROM.write(addr + i, (uint8_t)str[i]);
        if (str[i] == '\0')
            break;
    }
    EEPROM.write(addr + maxLen - 1, '\0'); // guarantee null terminator
}

static void loadString(uint16_t addr, char *buf, uint8_t maxLen)
{
    for (uint8_t i = 0; i < maxLen; i++)
    {
        buf[i] = (char)EEPROM.read(addr + i);
        if (buf[i] == '\0')
            return;
    }
    buf[maxLen - 1] = '\0'; // guarantee null terminator
}

// Credential persistence

static bool loadCredentials()
{
    uint8_t magic = EEPROM.read(CRED_BASE + CRED_MAGIC_OFF);
    if (magic != CRED_MAGIC)
        return false;
    loadString(CRED_BASE + CRED_SSID_OFF, g_ssid, sizeof(g_ssid));
    loadString(CRED_BASE + CRED_PASS_OFF, g_password, sizeof(g_password));
    return g_ssid[0] != '\0';
}

static void saveCredentials()
{
    saveString(CRED_BASE + CRED_SSID_OFF, g_ssid, sizeof(g_ssid));
    saveString(CRED_BASE + CRED_PASS_OFF, g_password, sizeof(g_password));
    EEPROM.write(CRED_BASE + CRED_MAGIC_OFF, CRED_MAGIC);
}


static bool waitForProvisioning(uint32_t timeoutMs)
{
    Serial.println(F("[PROV] No WiFi credentials found in EEPROM."));
    Serial.println(F("[PROV] Run provision.py to send credentials over USB Serial."));
    Serial.println(F("[PROV] Waiting up to 30 seconds..."));

    String line = "";
    uint32_t start = millis();

    while (millis() - start < timeoutMs)
    {
        while (Serial.available())
        {
            char c = (char)Serial.read();
            if (c == '\n')
            {
                line.trim();
                if (line.length() == 0)
                {
                    line = "";
                    continue;
                }

                StaticJsonDocument<256> doc;
                DeserializationError err = deserializeJson(doc, line);

                if (err != DeserializationError::Ok)
                {
                    Serial.println(F("PROV:FAIL (JSON parse error)"));
                    line = "";
                    continue;
                }

                const char *cmd = doc["cmd"] | "";
                const char *ssid = doc["ssid"] | "";
                const char *pass = doc["password"] | "";

                if (strcmp(cmd, "provision") != 0)
                {
                    Serial.println(F("PROV:FAIL (unknown cmd)"));
                    line = "";
                    continue;
                }

                if (strlen(ssid) == 0 || strlen(ssid) > 32)
                {
                    Serial.println(F("PROV:FAIL (SSID empty or too long)"));
                    line = "";
                    continue;
                }

                if (strlen(pass) > 64)
                {
                    Serial.println(F("PROV:FAIL (password too long)"));
                    line = "";
                    continue;
                }

                // Copy into globals and save
                strncpy(g_ssid, ssid, sizeof(g_ssid) - 1);
                strncpy(g_password, pass, sizeof(g_password) - 1);
                g_ssid[sizeof(g_ssid) - 1] = '\0';
                g_password[sizeof(g_password) - 1] = '\0';

                saveCredentials();

                Serial.print(F("PROV:OK (SSID="));
                Serial.print(g_ssid);
                Serial.println(F(")"));
                return true;
            }
            else
            {
                line += c;
            }
        }
        delay(10);
    }

    Serial.println(F("[PROV] Timed out. Continuing without WiFi."));
    return false;
}


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
    bool hasCreds = loadCredentials();
    if (!hasCreds)
    {
        // Give provision.py 30 seconds to send credentials
        hasCreds = waitForProvisioning(30000UL);
    }

    if (hasCreds)
    {
        Serial.print(F("[WiFi] Connecting to '"));
        Serial.print(g_ssid);
        Serial.print(F("'..."));

        if (wifi.begin(g_ssid, g_password))
        {
            Serial.println(F(" connected."));
            wifi.printIP();
            Serial.println(F("[INFO] Flask should call this IP on port 80."));
        }
        else
        {
            Serial.println(F(" FAILED."));
            Serial.println(F("[WARN] Running without WiFi — only local Serial available."));
        }
    }
    else
    {
        Serial.println(F("[WiFi] No credentials. Running without WiFi."));
    }

    Serial.println(F("\nSetup complete. State machine starting.\n"));
}

void loop()
{
    sm.update();
    carousel.runService();
    auger.runService();
}