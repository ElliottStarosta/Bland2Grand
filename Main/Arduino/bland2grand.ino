//bland2grand.ino
//Main orchestrator for the Bland2Grand spice dispenser.
//
//This file handles:
//  - Arduino setup and subsystem initialisation
//  - WiFi connection (Arduino Uno R4 WiFi built-in)
//  - TCP server on port 8080 for Flask commands
//  - Serial command interface for debugging
//  - EEPROM persistence for calibration data
//  - Full dispense sequence orchestration
//
//COMMAND PROTOCOL (Serial and TCP, newline-terminated):
//  DISPENSE:<slot>:<grams>   Run full dispense sequence
//  GOTO:<slot>               Move carousel only (no dispense)
//  WHERE                     Report carousel position
//  STATUS                    Report full system status
//  TARE                      Zero the scale
//  WEIGHT                    Read current scale weight
//  CALIBRATE                 Set carousel home (slot 0 = Cumin)
//  SCALECAL:<grams>          Calibrate scale with known weight
//  SLOTS                     Print slot assignment table
//  HELP                      Print command list
//
//RESPONSE PROTOCOL (sent back to Flask):
//  OK                        Command succeeded
//  DONE:<actual_grams>       Dispense complete with actual weight
//  READY:<slot>:<grams>      Carousel positioned, auger ready
//  ERROR:<reason>            Something went wrong
//
//FILE STRUCTURE:
//  bland2grand.ino  — this file (setup, loop, WiFi, EEPROM, commands)
//  carousel.ino     — AS5600 encoder + NEMA 23 carousel control
//  auger.ino        — NEMA 17 auger motor + dispense algorithm
//  scale.ino        — HX711 + load cell + flow rate calculation
//  config.h         — all pin/constant/tuning definitions

#include "config.h"
#include <Wire.h>
#include <EEPROM.h>
#include <WiFiS3.h>     //Arduino Uno R4 WiFi built-in library

//----------------------------------------------------------------
//WIFI CREDENTIALS — change these
//----------------------------------------------------------------
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

//----------------------------------------------------------------
//SPICE NAMES (referenced by config.h extern declaration)
//----------------------------------------------------------------
const char* SPICE_NAMES[NUM_SLOTS] = {
    "Cumin",          //slot 0  — 0 deg
    "Paprika",        //slot 1  — 45 deg
    "Garlic Powder",  //slot 2  — 90 deg
    "Chili Powder",   //slot 3  — 135 deg
    "Oregano",        //slot 4  — 180 deg
    "Onion Powder",   //slot 5  — 225 deg
    "Black Pepper",   //slot 6  — 270 deg
    "Cayenne"         //slot 7  — 315 deg
};

//----------------------------------------------------------------
//TCP SERVER
//----------------------------------------------------------------
WiFiServer tcpServer(TCP_PORT);
WiFiClient tcpClient;


//EEPROM HELPERS

void eepromSaveHomeOffset(int offset) {
    EEPROM.put(EEPROM_HOME_OFFSET_ADDR, offset);
    EEPROM.update(EEPROM_VALID_FLAG_ADDR, EEPROM_VALID_FLAG);
}

int eepromLoadHomeOffset() {
    if (EEPROM.read(EEPROM_VALID_FLAG_ADDR) != EEPROM_VALID_FLAG) {
        Serial.println("[EEPROM] No valid home offset found, using 0");
        return 0;
    }
    int offset;
    EEPROM.get(EEPROM_HOME_OFFSET_ADDR, offset);
    Serial.print("[EEPROM] Loaded home offset: ");
    Serial.println(offset);
    return offset;
}

void eepromSaveScaleCal(float factor) {
    EEPROM.put(EEPROM_SCALE_CAL_ADDR, factor);
    EEPROM.update(EEPROM_VALID_FLAG_ADDR, EEPROM_VALID_FLAG);
}

float eepromLoadScaleCal() {
    if (EEPROM.read(EEPROM_VALID_FLAG_ADDR) != EEPROM_VALID_FLAG) {
        Serial.println("[EEPROM] No valid scale cal found, using default");
        return SCALE_CALIBRATION_FACTOR;
    }
    float factor;
    EEPROM.get(EEPROM_SCALE_CAL_ADDR, factor);
    if (factor <= 0 || isnan(factor)) {
        Serial.println("[EEPROM] Scale cal corrupt, using default");
        return SCALE_CALIBRATION_FACTOR;
    }
    Serial.print("[EEPROM] Loaded scale cal: ");
    Serial.println(factor, 2);
    return factor;
}


//WIFI SETUP

void wifiConnect() {
    Serial.print("[WIFI] Connecting to ");
    Serial.print(WIFI_SSID);

    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    int attempts = 0;
    while (WiFi.status() != WL_CONNECTED && attempts < 20) {
        delay(500);
        Serial.print(".");
        attempts++;
    }

    if (WiFi.status() == WL_CONNECTED) {
        Serial.println();
        Serial.print("[WIFI] Connected. IP: ");
        Serial.println(WiFi.localIP());
        tcpServer.begin();
        Serial.print("[WIFI] TCP server listening on port ");
        Serial.println(TCP_PORT);
    } else {
        Serial.println();
        Serial.println("[WIFI] WARNING: Could not connect.");
        Serial.println("[WIFI] Serial commands still work.");
    }
}


//COMMAND HANDLER

/**
 * Parse and execute one command string.
 * Commands come from either Serial or TCP client.
 * Responses are sent to the same source.
 */
void handleCommand(String cmd, bool fromTCP) {
    cmd.trim();
    String cmdUpper = cmd;
    cmdUpper.toUpperCase();

    //Helper lambda to send response to right destination
    auto respond = [&](String msg) {
        Serial.println(msg);
        if (fromTCP && tcpClient && tcpClient.connected()) {
            tcpClient.println(msg);
        }
    };

    // DISPENSE:<slot>:<grams> 
    //Full sequence: carousel move + auger dispense
    if (cmdUpper.startsWith("DISPENSE:")) {
        int    sep1  = cmd.indexOf(':', 9);
        if (sep1 < 0) { respond("ERROR:bad_format DISPENSE:<slot>:<grams>"); return; }
        int    slot  = cmd.substring(9, sep1).toInt();
        float  grams = cmd.substring(sep1 + 1).toFloat();

        if (slot < 0 || slot >= NUM_SLOTS) {
            respond("ERROR:invalid_slot_0_to_7");
            return;
        }
        if (grams < 0.1f || grams > 30.0f) {
            respond("ERROR:grams_must_be_0.1_to_30");
            return;
        }
        if (!carouselIsReady()) {
            respond("ERROR:carousel_not_ready");
            return;
        }
        if (!scaleIsReady()) {
            respond("ERROR:scale_not_ready");
            return;
        }

        Serial.print("[CMD] DISPENSE slot=");
        Serial.print(slot);
        Serial.print(" (");
        Serial.print(SPICE_NAMES[slot]);
        Serial.print(") grams=");
        Serial.println(grams);

        //Step 1: Move carousel
        bool arrived = moveToSlot(slot);
        if (!arrived) {
            respond("ERROR:carousel_failed");
            return;
        }

        //Step 2: Dispense
        float actual = dispenseGrams(slot, grams);

        //Step 3: Report result
        String result = "DONE:";
        result += String(actual, 2);
        respond(result);
        return;
    }

    // GOTO:<slot> 
    if (cmdUpper.startsWith("GOTO:")) {
        int slot = cmd.substring(5).toInt();
        if (slot < 0 || slot >= NUM_SLOTS) {
            respond("ERROR:invalid_slot_0_to_7");
            return;
        }
        bool ok = moveToSlot(slot);
        respond(ok ? "OK" : "ERROR:carousel_failed");
        return;
    }

    // WHERE 
    if (cmdUpper == "WHERE") {
        carouselPrintStatus();
        String s = "SLOT:";
        s += String(carouselCurrentSlot());
        respond(s);
        return;
    }

    // STATUS 
    if (cmdUpper == "STATUS") {
        Serial.println("=== BLAND2GRAND STATUS ===");
        Serial.print("Firmware:      Bland2Grand v1.0\n");
        Serial.print("Gear ratio:    ");
        Serial.print(CAROUSEL_GEAR_RATIO, 4);
        Serial.println(":1  (128 ring / 48 pinion)");
        carouselPrintStatus();
        scalePrintStatus();
        Serial.print("WiFi:          ");
        Serial.println(WiFi.status() == WL_CONNECTED ? WiFi.localIP() : IPAddress(0,0,0,0));
        respond("OK");
        return;
    }

    // TARE 
    if (cmdUpper == "TARE") {
        scaleTare();
        respond("OK");
        return;
    }

    // WEIGHT 
    if (cmdUpper == "WEIGHT") {
        float w = scaleAverage(8);
        Serial.print("[SCALE] ");
        Serial.print(w, 2);
        Serial.println("g");
        String s = "WEIGHT:";
        s += String(w, 2);
        respond(s);
        return;
    }

    // CALIBRATE 
    //Sets current carousel position as slot 0 (Cumin)
    if (cmdUpper == "CALIBRATE") {
        carouselCalibrate();
        respond("OK");
        return;
    }

    // SCALECAL:<grams> 
    //Calibrate scale with a known reference weight on the bowl
    if (cmdUpper.startsWith("SCALECAL:")) {
        float knownGrams = cmd.substring(9).toFloat();
        scaleCalibrateWithWeight(knownGrams);
        respond("OK");
        return;
    }

    // SLOTS 
    if (cmdUpper == "SLOTS") {
        carouselPrintSlotTable();
        respond("OK");
        return;
    }

    // HELP 
    if (cmdUpper == "HELP") {
        Serial.println("=== COMMANDS ===");
        Serial.println("DISPENSE:<slot>:<grams>  Full dispense sequence");
        Serial.println("GOTO:<slot>              Move carousel to slot 0-7");
        Serial.println("WHERE                    Current carousel position");
        Serial.println("STATUS                   Full system status");
        Serial.println("TARE                     Zero the scale");
        Serial.println("WEIGHT                   Read current weight");
        Serial.println("CALIBRATE                Set carousel home (slot 0 = Cumin)");
        Serial.println("SCALECAL:<grams>         Calibrate scale with known weight");
        Serial.println("SLOTS                    Print slot assignments");
        respond("OK");
        return;
    }

    // Unknown 
    respond("ERROR:unknown_command — send HELP");
}


//SETUP

void setup() {
    Serial.begin(SERIAL_BAUD);
    delay(1000);

    Serial.println();
    Serial.println("================================================");
    Serial.println("  Bland2Grand Spice Dispenser");
    Serial.println("  Firmware v1.0");
    Serial.println("================================================");
    Serial.print("Gear ratio: ");
    Serial.print(CAROUSEL_GEAR_RATIO, 4);
    Serial.println(":1  (128 ring / 48 pinion)");
    Serial.println();

    //Initialise subsystems
    scaleInit();
    carouselInit();
    augerInit();

    //Connect to WiFi
    wifiConnect();

    Serial.println();
    Serial.println("[BOOT] All subsystems ready.");
    Serial.println("[BOOT] Send HELP for command list.");

    //First-run prompt if EEPROM is blank
    if (EEPROM.read(EEPROM_VALID_FLAG_ADDR) != EEPROM_VALID_FLAG) {
        Serial.println();
        Serial.println("[BOOT] First run detected.");
        Serial.println("[BOOT] 1. Manually align Cumin under the auger.");
        Serial.println("[BOOT] 2. Send: CALIBRATE");
        Serial.println("[BOOT] 3. Place a known weight on the scale.");
        Serial.println("[BOOT] 4. Send: SCALECAL:<weight_in_grams>");
        Serial.println("[BOOT] 5. Update DROP_HEIGHT_M in config.h and re-upload.");
    }
}


//LOOP

void loop() {

    // Handle TCP client connection 
    if (WiFi.status() == WL_CONNECTED) {
        if (!tcpClient || !tcpClient.connected()) {
            tcpClient = tcpServer.available();
        }

        if (tcpClient && tcpClient.connected() && tcpClient.available()) {
            String cmd = tcpClient.readStringUntil('\n');
            handleCommand(cmd, true);
        }
    }

    // Handle Serial commands 
    if (Serial.available()) {
        String cmd = Serial.readStringUntil('\n');
        handleCommand(cmd, false);
    }
}
