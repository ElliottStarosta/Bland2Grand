//config.h
//Central configuration for Bland2Grand.
//Change hardware constants here — nothing else needs editing.

#pragma once
#include <Arduino.h>

//----------------------------------------------------------------
//SPICE SLOTS
//----------------------------------------------------------------
#define NUM_SLOTS 8

extern const char *SPICE_NAMES[NUM_SLOTS];

//----------------------------------------------------------------
//PIN DEFINITIONS — CAROUSEL (NEMA 23 via TB6600)
//----------------------------------------------------------------
#define CAROUSEL_STEP_PIN 2
#define CAROUSEL_DIR_PIN 3
#define CAROUSEL_EN_PIN 4

//----------------------------------------------------------------
//PIN DEFINITIONS — AUGER (NEMA 17 via TB6600)
//----------------------------------------------------------------
#define AUGER_STEP_PIN 5
#define AUGER_DIR_PIN 6
#define AUGER_EN_PIN 7

//----------------------------------------------------------------
//PIN DEFINITIONS — SCALE (HX711)
//----------------------------------------------------------------
#define HX711_DT_PIN 8
#define HX711_SCK_PIN 9

//----------------------------------------------------------------
//AS5600 ENCODER
//----------------------------------------------------------------
#define AS5600_I2C_ADDR 0x36
#define AS5600_RAW_REG 0x0C
#define ENCODER_COUNTS 4096
#define COUNTS_PER_SLOT (ENCODER_COUNTS / NUM_SLOTS) //512

//----------------------------------------------------------------
//CAROUSEL GEAR RATIO
//Motor pinion: 48 teeth
//Carousel ring gear: 128 teeth
//Ratio: 128/48 = 2.6667 : 1
//Motor steps per carousel slot (45 deg):
//  (1/8 rev) * 2.6667 * 3200 steps = 1066 steps
//----------------------------------------------------------------
#define CAROUSEL_PINION_TEETH 48
#define CAROUSEL_RING_TEETH 128
const float CAROUSEL_GEAR_RATIO = (float)CAROUSEL_RING_TEETH / (float)CAROUSEL_PINION_TEETH;

//----------------------------------------------------------------
//CAROUSEL MOVEMENT TUNING
//----------------------------------------------------------------

#define POSITION_TOLERANCE 12 //encoder counts (~1.05 deg)
#define CAROUSEL_STEP_LIMIT 8000 //abort if exceeded (jam detection)

//Speed limits in microseconds per half-pulse
//Lower = faster. NEMA 23 at 24V can handle down to ~200us reliably.
#define CAROUSEL_DELAY_MIN 250  //fastest step — full speed
#define CAROUSEL_DELAY_MAX 2500 //slowest step — right at target

//Acceleration ramp length in steps from standstill
//300 steps = ~8 degrees of carousel rotation — gentle on PLA gears
#define CAROUSEL_ACCEL_STEPS 300

//Exponential curve power for deceleration
//1.0 = linear, 2.0 = quadratic, 2.5 = aggressive near target
//Higher values spend more time at fast speed and brake harder near target
#define CAROUSEL_CURVE 2.5f

//----------------------------------------------------------------
//STEPPER MOTOR (both NEMA 23 and NEMA 17)
//----------------------------------------------------------------
#define MOTOR_FULL_STEPS_PER_REV 200 //1.8 deg step angle
#define MICROSTEP_SETTING 16 //TB6600 DIP switch
#define MOTOR_STEPS_PER_REV (MOTOR_FULL_STEPS_PER_REV * MICROSTEP_SETTING) //3200

//----------------------------------------------------------------
//AUGER SPEED SETTINGS
//Step delay in microseconds — larger = slower
//----------------------------------------------------------------
#define AUGER_SPEED_FAST 800     //full speed dispensing
#define AUGER_SPEED_SLOW 2000    //80% of target reached
#define AUGER_SPEED_TRICKLE 5000 //95% of target reached

//----------------------------------------------------------------
//DISPENSE PHYSICS
//----------------------------------------------------------------
//Measure this with a ruler: vertical distance in meters from
//the auger nozzle exit to the surface of the scale bowl.
#define DROP_HEIGHT_M 0.12 //12cm default — MEASURE YOURS

//Precomputed freefall time: t = sqrt(2h/g)
//Recalculated at runtime in scale.ino
//Listed here for documentation:
//sqrt(2 * 0.12 / 9.81) = 0.1564 seconds

//Flow rate ring buffer size for linear regression
#define FLOW_BUFFER_SIZE 6

//Correction pulse settings
#define CORRECTION_PULSE_MS 180      //how long each correction burst runs
#define CORRECTION_MAX 3             //max correction attempts
#define CORRECTION_THRESHOLD_G 0.08f //retry if short by more than this

//Scale settle confirmation
#define SETTLE_READINGS 8        //consecutive stable readings required
#define SETTLE_TOLERANCE_G 0.02f //grams — what counts as stable
#define SETTLE_WAIT_MS 80        //ms between settle check readings

//----------------------------------------------------------------
//SCALE (HX711) CALIBRATION
//Run SCALECAL command with a known weight to find this value.
//----------------------------------------------------------------
#define SCALE_CALIBRATION_FACTOR 420.0f //raw units per gram — calibrate!
#define SCALE_AVERAGE_SAMPLES 8         //readings to average for stable read
#define SCALE_READ_TIMEOUT_MS 200       //ms before giving up on a reading

//----------------------------------------------------------------
//EEPROM ADDRESSES
//----------------------------------------------------------------
#define EEPROM_HOME_OFFSET_ADDR 0 //4 bytes (int)
#define EEPROM_SCALE_CAL_ADDR 4   //4 bytes (float)
#define EEPROM_VALID_FLAG_ADDR 8  //1 byte, value 0xAB means valid

#define EEPROM_VALID_FLAG 0xAB

//----------------------------------------------------------------
//WIFI / COMMUNICATION
//----------------------------------------------------------------
#define SERIAL_BAUD 115200
#define TCP_PORT 8080

//----------------------------------------------------------------
//EEPROM helpers — declared here, defined in bland2grand.ino
//----------------------------------------------------------------
void eepromSaveHomeOffset(int offset);
int eepromLoadHomeOffset();
void eepromSaveScaleCal(float factor);
float eepromLoadScaleCal();
