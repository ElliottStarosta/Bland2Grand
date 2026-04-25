#pragma once

#include <Arduino.h>

//Pin Assignments

//Carousel motor (M1 / NEMA 23 / TB6600 U4)
static constexpr uint8_t PIN_CAROUSEL_STEP = 3;
static constexpr uint8_t PIN_CAROUSEL_DIR = 4;

//Auger motor (M2 / NEMA 17 / TB6600 U5)
static constexpr uint8_t PIN_AUGER_STEP = 5;
static constexpr uint8_t PIN_AUGER_DIR = 7;

//HX711 load cell (U3)
static constexpr uint8_t PIN_HX711_DOUT = 9;
static constexpr uint8_t PIN_HX711_SCK = 10;

//AS5600 encoder is on the hardware I2C bus (A4=SDA, A5=SCL) — no pin constants needed.

//Stepper Motor Geometry

//Both motors use 1.8° step angle and 1/8 microstepping
static constexpr float STEP_ANGLE_DEG = 1.8f;
static constexpr uint8_t MICROSTEP_DIVISOR = 8;
static constexpr uint16_t STEPS_PER_REV = static_cast<uint16_t>(
    360.0f / STEP_ANGLE_DEG * MICROSTEP_DIVISOR); //= 1600

//Carousel Kinematics

//External pinion/ring gear ratio: ring=96 teeth, pinion=48 teeth → GR = 2
static constexpr float CAROUSEL_GEAR_RATIO = 2.0f;
static constexpr uint8_t CAROUSEL_SLOT_COUNT = 8;
static constexpr float CAROUSEL_SLOT_DEG = 360.0f / CAROUSEL_SLOT_COUNT; //45°

//Motor shaft degrees per 1 carousel slot index
static constexpr float MOTOR_DEG_PER_SLOT = CAROUSEL_SLOT_DEG * CAROUSEL_GEAR_RATIO; //90°

//Microsteps per carousel index move
static constexpr uint16_t STEPS_PER_SLOT = static_cast<uint16_t>(
    MOTOR_DEG_PER_SLOT / 360.0f * STEPS_PER_REV); //= 400

//AS5600 encoder counts per index move (12-bit, 4096 counts per shaft revolution)
static constexpr uint16_t ENCODER_COUNTS_PER_REV = 4096;
static constexpr uint16_t ENCODER_COUNTS_PER_SLOT = static_cast<uint16_t>(
    MOTOR_DEG_PER_SLOT / 360.0f * ENCODER_COUNTS_PER_REV); //= 1024

//Carousel slot-1 home position: AS5600 raw count when slot 1 is aligned under the auger.
//CALIBRATION REQUIRED: rotate the carousel until slot 1 is perfectly aligned, read
//encoder.rawAngle() over Serial, and replace 512 with the observed value.
static constexpr uint16_t MODULE_1_SHAFT_COUNTS = 512; // ← CALIBRATE THIS VALUE

//Acceptable encoder positioning error: ±1° at carousel = ±2° at shaft
static constexpr uint8_t ENCODER_TOLERANCE_COUNTS = static_cast<uint8_t>(
    2.0f / 360.0f * ENCODER_COUNTS_PER_REV + 0.5f); //≈ 23 counts

//Homing scan speed (microsteps/s) — slow enough for encoder stability
static constexpr float HOMING_SPEED_STEPS_S = 200.0f;

//Normal index speed (microsteps/s)
static constexpr float INDEX_SPEED_STEPS_S = 1600.0f;

//Settling delay after index before dispense begins (ms)
static constexpr uint16_t INDEX_SETTLE_MS = 1000;

//Auger / Half-Spur Gear Geometry

//The half-spur gear has teeth on exactly 180° of its circumference.
//One full M2 revolution therefore produces exactly ONE auger revolution
//(180° toothed arc drives the container full-spur gear through one complete turn,
//then the toothless 180° provides a mechanical cutoff).
//
//We define an "auger cycle" = 1 full M2 revolution = 1 auger revolution.
//Flow rate calibration is performed per-spice in grams per auger cycle.

static constexpr uint16_t STEPS_PER_AUGER_CYCLE = STEPS_PER_REV; //1600

//Auger tube orientation
static constexpr float AUGER_TILT_DEG = 0.0f;

//Back-purge: number of full M2 revolutions in reverse after a dispense.
//The toothed half sweeps back through the container gear, pulling spice back
//up the auger helix.  One full back-revolution clears the tube effectively.
static constexpr uint8_t BACK_PURGE_REVOLUTIONS = 1;
static constexpr uint16_t BACK_PURGE_STEPS = STEPS_PER_AUGER_CYCLE * BACK_PURGE_REVOLUTIONS;
static constexpr float BACK_PURGE_SPEED_STEPS_S = 800.0f; //moderate speed for clean reversal

//Dispense Speed Ramp

//Three-stage closed-loop ramp-down keyed to (current_weight / target_weight).
//Speeds are fractions of AUGER_FULL_SPEED_STEPS_S.
static constexpr float AUGER_FULL_SPEED_STEPS_S = 1200.0f;

//Stage boundaries (weight ratio thresholds)
static constexpr float RAMP_STAGE2_THRESHOLD = 0.80f; //below this → full speed
static constexpr float RAMP_STAGE3_THRESHOLD = 0.95f; //below this → 50% speed
                                                      //above 0.95 → 15% speed

static constexpr float RAMP_SPEED_STAGE1 = 1.00f; //100%
static constexpr float RAMP_SPEED_STAGE2 = 0.50f; //50%
static constexpr float RAMP_SPEED_STAGE3 = 0.15f; //15%

//After stop: coil disable delay (ms) to prevent unnecessary heating
static constexpr uint16_t AUGER_COIL_DISABLE_DELAY_MS = 500;

//Per-spice dispense timeout (ms).  If target not reached within this time
//the firmware reports a fault and aborts the blend.
static constexpr uint32_t DISPENSE_TIMEOUT_MS = 60000UL;

//Load Cell

//Number of HX711 samples averaged for each weight reading
static constexpr uint8_t SCALE_AVG_SAMPLES = 4;

//Polling interval for scale during dispense (ms)
static constexpr uint16_t SCALE_POLL_MS = 100;

//Tare settle delay after motor stop / carousel move (ms)
static constexpr uint16_t TARE_SETTLE_MS = 500;

//Regression / Flow-Rate Model

//Number of calibration data points to collect per slot
//(stored in EEPROM; slope + intercept for each)
static constexpr uint8_t CALIB_POINTS_MIN = 3; //minimum before regression is valid

//Prediction horizon: we predict how many more cycles are needed and stop
//early to account for in-flight spice.  This "coast" allowance is computed
//dynamically from the linear model, but is clamped to [0, MAX_COAST_GRAMS].
static constexpr float MAX_COAST_GRAMS = 2.0f;

//EEPROM layout:
//For each slot (0-7): 8 bytes
//float  slope     (bytes 0-3)
//float  intercept (bytes 4-7)
//Total: 64 bytes starting at EEPROM_BASE_ADDR
static constexpr uint16_t EEPROM_BASE_ADDR = 0;
static constexpr uint8_t EEPROM_BYTES_PER_SLOT = 8;

//WiFi / HTTP

static constexpr uint16_t HTTP_PORT = 80;
static constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000UL;
static constexpr uint32_t WATCHDOG_TIMEOUT_MS = 30000UL; //return to IDLE if no command

//Physical Dimensions (informational / used in torque sanity checks)

//Carousel: containers treated as point masses at radius r = 80 mm
static constexpr float CAROUSEL_LOAD_RADIUS_M = 0.080f;
static constexpr float CONTAINER_LOADED_MASS_KG = 0.125f; //125 g each

//Load cell
static constexpr float SCALE_CAPACITY_G = 1000.0f;
static constexpr float SCALE_OVERLOAD_G = 1500.0f; //150% safe overload
static constexpr float SCALE_ACCURACY_G = 0.30f;   //±0.3 g spec

//Auger tube inner radius (m)
static constexpr float AUGER_TUBE_RADIUS_M = 0.010f;
//Auger helix pitch (m)
static constexpr float AUGER_PITCH_M = 0.010f;
//Spice bulk density range
static constexpr float SPICE_DENSITY_MIN_G_ML = 0.19f; //oregano
static constexpr float SPICE_DENSITY_MAX_G_ML = 0.55f; //paprika