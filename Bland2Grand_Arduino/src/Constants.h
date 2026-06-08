#pragma once
// Constants.h - pin map, motor geometry, and tuning knobs for the whole machine.

#include <Arduino.h>

// Pin Assignments

// Carousel motor (M1 / NEMA 23 / TB6600)
static constexpr uint8_t PIN_CAROUSEL_STEP = 5;
static constexpr uint8_t PIN_CAROUSEL_DIR = 7;

// Auger motor (M2 / NEMA 17 / TB6600)
static constexpr uint8_t PIN_AUGER_STEP = 3;
static constexpr uint8_t PIN_AUGER_DIR = 4;

// HX711 load cell
static constexpr uint8_t PIN_HX711_DOUT = A1;
static constexpr uint8_t PIN_HX711_SCK = A0;

// Stepper Motor Geometry
// Both motors: 1.8 deg step angle, 1/8 microstepping
static constexpr float STEP_ANGLE_DEG = 1.8f;
static constexpr uint8_t MICROSTEP_DIVISOR = 8;
static constexpr uint16_t STEPS_PER_REV = static_cast<uint16_t>(
    360.0f / STEP_ANGLE_DEG * MICROSTEP_DIVISOR); // = 1600

// Carousel Kinematics

static constexpr float CAROUSEL_GEAR_RATIO = 18.0f;
static constexpr uint8_t CAROUSEL_SLOT_COUNT = 8;
static constexpr float CAROUSEL_SLOT_DEG = 360.0f / CAROUSEL_SLOT_COUNT;

// Motor shaft degrees to move one carousel slot
static constexpr float MOTOR_DEG_PER_SLOT = CAROUSEL_SLOT_DEG * CAROUSEL_GEAR_RATIO;

// Microsteps per carousel index move
static constexpr uint16_t STEPS_PER_SLOT = static_cast<uint16_t>(
    MOTOR_DEG_PER_SLOT / 360.0f * STEPS_PER_REV);

// Homing scan speed (steps/s)
static constexpr float HOMING_SPEED_STEPS_S = 500.0f;

// Normal index speed and acceleration
static constexpr float INDEX_SPEED_STEPS_S = 3000.0f;
static constexpr float INDEX_ACCEL_STEPS_S2 = 500.0f;

static constexpr uint16_t STEPS_PER_SLOT_CORRECTION = 143;

// Settle delay after index before dispense begins (ms)
static constexpr uint16_t INDEX_SETTLE_MS = 1000;

// Auger / Half-Spur Gear Geometry

static constexpr uint16_t STEPS_PER_AUGER_CYCLE = STEPS_PER_REV;

// Back-purge: reverse all dispensed steps after each dispense.
// This sweeps spice back up the helix and re-parks the toothless arc.
static constexpr float BACK_PURGE_SPEED_STEPS_S = 1600.0f;


// Delay after back-purge before disabling coils (ms)
static constexpr uint16_t AUGER_COIL_DISABLE_DELAY_MS = 200;

// Auger Speed Ramp
static constexpr float AUGER_FULL_SPEED_STEPS_S = 3200.0f;
static constexpr float AUGER_NUDGE_MAX_SPEED = AUGER_FULL_SPEED_STEPS_S * 0.35f;  

// Three-stage closed-loop ramp keyed to (steps_done / total_steps)
static constexpr float RAMP_STAGE2_THRESHOLD = 0.80f;
static constexpr float RAMP_STAGE3_THRESHOLD = 0.95f;

static constexpr float RAMP_SPEED_STAGE1 = 1.00f;
static constexpr float RAMP_SPEED_STAGE2 = 0.75f;
static constexpr float RAMP_SPEED_STAGE3 = 0.50f;

// Auger Flow Model
// Clump / overshoot tuning constants
// Phase 1 stops at this fraction of target weight.
// In-flight + clump release must not exceed the remainder.
static constexpr float COAST_UNDERSHOOT_RATIO = 0.85f;

// Phase 3: how many auger cycles per nudge tap.
// Smaller = finer control but more settle delays.
// 1 cycle ≈ GRAMS_PER_REV[slot] grams per tap.
static constexpr uint8_t TAP_CYCLES = 1;

// Phase 2/3: how many consecutive stable scale reads before we trust the weight.
// Stability = successive readings within STABLE_BAND_G of each other.
static constexpr uint8_t SETTLE_READS = 3;
static constexpr float STABLE_BAND_G = 0.25f;

// Maximum nudge taps before giving up (prevents infinite loop on stuck auger).
static constexpr uint8_t MAX_TAPS = 30;

// Per-slot coast EMA: how fast the coast estimate adapts (0=never, 1=instant).
static constexpr float COAST_ALPHA = 0.30f;

// Safety: if a single tap delivers more than this many grams, flag it as a clump.
// Useful for Serial diagnostics; does not abort the dispense.
static constexpr float CLUMP_WARN_G = 0.5f;


// WiFi Push Timing
// How often to send a weight update to Flask during dispensing (ms).
// Keep >= 150 ms so the WiFi call fits between motor steps cleanly.
static constexpr uint16_t WIFI_PUSH_INTERVAL_MS = 150;

// Settle delay between forward dispense ending and back-purge starting (ms)
static constexpr uint16_t DISPENSE_SETTLE_MS = 400;

// Per-spice dispense timeout (ms)
static constexpr uint32_t DISPENSE_TIMEOUT_MS = 60000UL;

// Flask Server
static constexpr const char *FLASK_SERVER_HOST = "192.168.137.1";
static constexpr uint16_t FLASK_SERVER_PORT = 5000;

// HTTP / WiFi
static constexpr uint16_t HTTP_PORT = 80;
static constexpr uint32_t WIFI_CONNECT_TIMEOUT_MS = 15000UL;
static constexpr uint32_t WATCHDOG_TIMEOUT_MS = 30000UL;

// Load Cell
static constexpr uint8_t SCALE_AVG_SAMPLES = 1;
static constexpr uint8_t SCALE_AVG_SAMPLES_CAL = 32;
static constexpr uint16_t SCALE_POLL_MS = 100;
static constexpr uint16_t TARE_SETTLE_MS = 500;
static constexpr float SCALE_CAPACITY_G = 1000.0f;
static constexpr float SCALE_OVERLOAD_G = 1500.0f;
static constexpr float SCALE_ACCURACY_G = 0.30f;
static constexpr float SCALE_CAL_FACTOR = 687.473f;
static constexpr float MIN_BOWL_WEIGHT_G = 50.0f;

// Flow Model (EEPROM-backed regression)

static constexpr uint8_t CALIB_POINTS_MIN = 3;
static constexpr float MAX_COAST_GRAMS = 2.0f;
static constexpr uint16_t EEPROM_BASE_ADDR = 0;
static constexpr uint8_t EEPROM_BYTES_PER_SLOT = 8;

// Physical Dimensions  (informational)

static constexpr float CAROUSEL_LOAD_RADIUS_M = 0.080f;
static constexpr float CONTAINER_LOADED_MASS_KG = 0.125f;
static constexpr float AUGER_TUBE_RADIUS_M = 0.010f;
static constexpr float AUGER_PITCH_M = 0.010f;
static constexpr float SPICE_DENSITY_MIN_G_ML = 0.19f; // oregano
static constexpr float SPICE_DENSITY_MAX_G_ML = 1.20f; // 