
#include <Arduino.h>
#include <Wire.h>

#define AS5600_ADDR 0x36

#define REG_STATUS 0x0B
#define REG_RAW_HI 0x0C
#define REG_RAW_LO 0x0D
#define REG_AGC 0x1A

uint8_t readReg(uint8_t reg)
{
    Wire.beginTransmission(AS5600_ADDR);
    Wire.write(reg);
    Wire.endTransmission();
    Wire.requestFrom(AS5600_ADDR, 1);
    while (Wire.available() == 0)
        ;
    return Wire.read();
}

uint16_t readRawAngle()
{
    uint16_t hi = readReg(REG_RAW_HI) & 0x0F;
    uint8_t lo = readReg(REG_RAW_LO);
    return (hi << 8) | lo;
}

void setup()
{
    Serial.begin(9600);
    while (!Serial && millis() < 3000)
        ;

    Wire.begin();
    Wire.setClock(400000);

    // First confirm chip is visible on I2C
    Serial.println(F("Scanning for AS5600..."));
    Wire.beginTransmission(AS5600_ADDR);
    if (Wire.endTransmission() != 0)
    {
        Serial.println(F("[ERROR] AS5600 not found at 0x36! Check wiring."));
        while (true)
            ;
    }
    Serial.println(F("[OK] AS5600 found at 0x36."));
    Serial.println(F(""));

    // Wait for magnet
    Serial.println(F("Waiting for magnet..."));
    uint8_t status = 0;
    while ((status & 0x20) != 0x20)
    {
        status = readReg(REG_STATUS);
        Serial.print(F("  Status: 0b"));
        Serial.println(status, BIN);
        delay(500);
    }

    Serial.println(F("[OK] Magnet detected!"));
    Serial.println(F(""));
    Serial.println(F("Rotate carousel MANUALLY to slot 1."));
    Serial.println(F("When 'Raw' stabilises, copy that value into Constants.h:"));
    Serial.println(F("  MODULE_1_SHAFT_COUNTS = <value>;"));
    Serial.println(F(""));
    Serial.println(F("  Raw  |  Degrees  |  AGC  |  Magnet status"));
    Serial.println(F("------------------------------------------------"));
}

void loop()
{
    uint8_t status = readReg(REG_STATUS);
    uint8_t agc = readReg(REG_AGC);
    uint16_t raw = readRawAngle();
    float deg = raw * 0.087890625f;

    const char *magStatus;
    if (!(status & 0x20))
        magStatus = "NO MAGNET  <-- check gap";
    else if (status & 0x08)
        magStatus = "TOO STRONG <-- move magnet away";
    else if (status & 0x10)
        magStatus = "TOO WEAK   <-- move magnet closer";
    else
        magStatus = "OK";

    char buf[80];
    snprintf(buf, sizeof(buf),
             "  %4u | %7.2f deg | AGC:%3u | %s",
             raw, deg, agc, magStatus);
    Serial.println(buf);

    delay(200);
}