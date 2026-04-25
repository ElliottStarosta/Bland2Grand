#pragma once


#include <Arduino.h>
#include <EEPROM.h>
#include <ArduinoBLE.h>

static constexpr uint16_t CRED_EEPROM_ADDR = 96;
static constexpr uint8_t CRED_MAGIC = 0xC7;

// BLE UUIDs — these are arbitrary but fixed; the provisioner script matches them
static const char BLE_SERVICE_UUID[] = "12ab3456-0000-1000-8000-00805f9b34fb";
static const char BLE_CRED_UUID[] = "12ab3457-0000-1000-8000-00805f9b34fb";   // write
static const char BLE_STATUS_UUID[] = "12ab3458-0000-1000-8000-00805f9b34fb"; // notify

struct WiFiCredentials
{
    char ssid[33];
    char pass[65];
};

class WiFiProvisioner
{
public:
    WiFiProvisioner() : _provisioned(false) {}

    // Returns true if valid credentials exist in EEPROM.
    // Call this first — if it returns true you can skip BLE entirely.
    bool loadCredentials(WiFiCredentials &out)
    {
        uint8_t magic;
        EEPROM.get(CRED_EEPROM_ADDR, magic);
        if (magic != CRED_MAGIC)
            return false;

        EEPROM.get(CRED_EEPROM_ADDR + 1, out.ssid);
        EEPROM.get(CRED_EEPROM_ADDR + 1 + sizeof(out.ssid), out.pass);

        // Safety: ensure null-termination
        out.ssid[32] = '\0';
        out.pass[64] = '\0';

        return (out.ssid[0] != '\0');
    }

    void clearCredentials()
    {
        uint8_t zero = 0;
        EEPROM.put(CRED_EEPROM_ADDR, zero);
    }

    // Blocks until credentials are received over BLE, then saves and returns them.
    // Progress is printed to Serial and can optionally light an LED.
    // Timeout: 0 = wait forever.
    bool provision(WiFiCredentials &out, uint32_t timeoutMs = 0)
    {
        Serial.println(F("[BLE] Starting provisioning mode…"));

        if (!BLE.begin())
        {
            Serial.println(F("[BLE] BLE init failed!"));
            return false;
        }

        BLEService svc(BLE_SERVICE_UUID);
        BLEStringCharacteristic credChar(BLE_CRED_UUID,
                                         BLEWrite | BLEWriteWithoutResponse, 128);
        BLEStringCharacteristic statusChar(BLE_STATUS_UUID,
                                           BLERead | BLENotify, 32);

        svc.addCharacteristic(credChar);
        svc.addCharacteristic(statusChar);
        BLE.addService(svc);

        BLE.setLocalName("B2G-Setup");
        BLE.setAdvertisedService(svc);
        BLE.advertise();

        Serial.println(F("[BLE] Advertising as 'B2G-Setup'"));
        Serial.println(F("[BLE] Write: SSID:<name>\\nPASS:<password>\\n"));

        statusChar.writeValue("WAITING");

        uint32_t start = millis();
        bool success = false;

        while (true)
        {
            if (timeoutMs > 0 && millis() - start > timeoutMs)
            {
                Serial.println(F("[BLE] Provisioning timed out"));
                break;
            }

            BLEDevice central = BLE.central();
            if (!central)
            {
                BLE.poll();
                delay(10);
                continue;
            }

            Serial.print(F("[BLE] Connected: "));
            Serial.println(central.address());
            statusChar.writeValue("CONNECTED");

            while (central.connected())
            {
                BLE.poll();

                if (!credChar.written())
                {
                    delay(10);
                    continue;
                }

                String payload = credChar.value();
                Serial.print(F("[BLE] Received payload ("));
                Serial.print(payload.length());
                Serial.println(F(" bytes)"));

                if (_parsePayload(payload, out))
                {
                    _saveCredentials(out);
                    statusChar.writeValue("OK");
                    Serial.println(F("[BLE] Credentials saved. Disconnecting."));
                    delay(500);
                    success = true;
                    break;
                }
                else
                {
                    statusChar.writeValue("ERR:FORMAT");
                    Serial.println(F("[BLE] Bad format. Expected SSID:<name>\\nPASS:<pw>\\n"));
                }
            }

            if (success)
                break;
            Serial.println(F("[BLE] Central disconnected. Waiting for reconnect…"));
        }

        BLE.stopAdvertise();
        BLE.end();
        return success;
    }

private:
    bool _provisioned;

    // Parse "SSID:MyNetwork\nPASS:MyPassword\n" (newline may be \n or \r\n)
    bool _parsePayload(const String &payload, WiFiCredentials &out)
    {
        memset(&out, 0, sizeof(out));

        int ssidTag = payload.indexOf("SSID:");
        int passTag = payload.indexOf("PASS:");
        if (ssidTag < 0 || passTag < 0)
            return false;

        // Extract SSID
        int ssidStart = ssidTag + 5;
        int ssidEnd = payload.indexOf('\n', ssidStart);
        if (ssidEnd < 0)
            ssidEnd = payload.length();
        if (ssidEnd > ssidStart && payload[ssidEnd - 1] == '\r')
            ssidEnd--;
        String ssid = payload.substring(ssidStart, ssidEnd);
        ssid.trim();
        if (ssid.length() == 0 || ssid.length() > 32)
            return false;

        // Extract password
        int passStart = passTag + 5;
        int passEnd = payload.indexOf('\n', passStart);
        if (passEnd < 0)
            passEnd = payload.length();
        if (passEnd > passStart && payload[passEnd - 1] == '\r')
            passEnd--;
        String pass = payload.substring(passStart, passEnd);
        pass.trim();
        if (pass.length() > 64)
            return false;

        ssid.toCharArray(out.ssid, sizeof(out.ssid));
        pass.toCharArray(out.pass, sizeof(out.pass));
        return true;
    }

    void _saveCredentials(const WiFiCredentials &cred)
    {
        uint8_t magic = CRED_MAGIC;
        EEPROM.put(CRED_EEPROM_ADDR, magic);
        EEPROM.put(CRED_EEPROM_ADDR + 1, cred.ssid);
        EEPROM.put(CRED_EEPROM_ADDR + 1 + sizeof(cred.ssid), cred.pass);
    }
};