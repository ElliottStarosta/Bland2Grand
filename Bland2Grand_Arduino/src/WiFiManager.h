#pragma once

#include <Arduino.h>
#include <EEPROM.h>
#include <WiFiS3.h>
#include <ArduinoJson.h>
#include "WiFiComm.h"

class WiFiManager
{
public:
    WiFiManager(WiFiComm &wifiRef) : wifi(wifiRef) {}

    bool begin()
    {
        bool hasCreds = loadCredentials();

        if (!hasCreds)
        {
            hasCreds = waitForProvisioning(30000UL);
        }

        if (hasCreds)
        {
            Serial.print(F("[WiFi] Connecting to '"));
            Serial.print(ssid);
            Serial.print(F("'..."));

            if (wifi.begin(ssid, password))
            {
                Serial.println(F(" connected."));
                wifi.printIP();
                Serial.println(F("[INFO] Flask should call this IP on port 80."));
                connected = true;
                return true;
            }
            else
            {
                Serial.println(F(" FAILED."));
            }
        }

        Serial.println(F("[WiFi] Running without WiFi."));
        connected = false;
        return false;
    }

    bool isConnected() const
    {
        return connected;
    }

private:
    // EEPROM layout 
    static constexpr uint16_t CRED_BASE = 200;
    static constexpr uint16_t CRED_SSID_OFF = 0;
    static constexpr uint16_t CRED_PASS_OFF = 33;
    static constexpr uint16_t CRED_MAGIC_OFF = 98;
    static constexpr uint8_t CRED_MAGIC = 0xB2;

    // Storage 
    char ssid[33] = {};
    char password[65] = {};
    bool connected = false;

    WiFiComm &wifi;

    // EEPROM helpers 
    void saveString(uint16_t addr, const char *str, uint8_t maxLen)
    {
        for (uint8_t i = 0; i < maxLen; i++)
        {
            EEPROM.write(addr + i, (uint8_t)str[i]);
            if (str[i] == '\0') break;
        }
        EEPROM.write(addr + maxLen - 1, '\0');
    }

    void loadString(uint16_t addr, char *buf, uint8_t maxLen)
    {
        for (uint8_t i = 0; i < maxLen; i++)
        {
            buf[i] = (char)EEPROM.read(addr + i);
            if (buf[i] == '\0') return;
        }
        buf[maxLen - 1] = '\0';
    }

    // Credential handling 
    bool loadCredentials()
    {
        if (EEPROM.read(CRED_BASE + CRED_MAGIC_OFF) != CRED_MAGIC)
            return false;

        loadString(CRED_BASE + CRED_SSID_OFF, ssid, sizeof(ssid));
        loadString(CRED_BASE + CRED_PASS_OFF, password, sizeof(password));

        return ssid[0] != '\0';
    }

    void saveCredentials()
    {
        saveString(CRED_BASE + CRED_SSID_OFF, ssid, sizeof(ssid));
        saveString(CRED_BASE + CRED_PASS_OFF, password, sizeof(password));
        EEPROM.write(CRED_BASE + CRED_MAGIC_OFF, CRED_MAGIC);
    }

    // Serial provisioning 
    bool waitForProvisioning(uint32_t timeoutMs)
    {
        Serial.println(F("[PROV] No WiFi credentials found."));
        Serial.println(F("[PROV] Send JSON over Serial (30s timeout)..."));

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
                    if (deserializeJson(doc, line))
                    {
                        Serial.println(F("PROV:FAIL (JSON error)"));
                        line = "";
                        continue;
                    }

                    const char *cmd = doc["cmd"] | "";
                    const char *s = doc["ssid"] | "";
                    const char *p = doc["password"] | "";

                    if (strcmp(cmd, "provision") != 0)
                    {
                        Serial.println(F("PROV:FAIL (bad cmd)"));
                        line = "";
                        continue;
                    }

                    if (strlen(s) == 0 || strlen(s) > 32)
                    {
                        Serial.println(F("PROV:FAIL (bad ssid)"));
                        line = "";
                        continue;
                    }

                    if (strlen(p) > 64)
                    {
                        Serial.println(F("PROV:FAIL (pass too long)"));
                        line = "";
                        continue;
                    }

                    strncpy(ssid, s, sizeof(ssid) - 1);
                    strncpy(password, p, sizeof(password) - 1);

                    ssid[sizeof(ssid) - 1] = '\0';
                    password[sizeof(password) - 1] = '\0';

                    saveCredentials();

                    Serial.print(F("PROV:OK ("));
                    Serial.print(ssid);
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

        Serial.println(F("[PROV] Timeout."));
        return false;
    }
};