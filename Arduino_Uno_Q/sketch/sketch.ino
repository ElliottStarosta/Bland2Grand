// USE_LOAD_CELL=1 uses the HX711 scale; 0 estimates weight from motor cycles.
#define USE_LOAD_CELL 1

#include <Arduino.h>
#include <Arduino_RouterBridge.h>
#include <Arduino_LED_Matrix.h>
#include "Constants.h"
#include "BridgeComms.h"
#include "CarouselDriver.h"
#include "AugerDriver.h"

#if USE_LOAD_CELL
#include "Scale.h"
#endif

// LED Matrix frames -- UNO Q's onboard matrix is 8 rows x 13 cols (104 LEDs), one column wider than the R4 WiFi's 8x12. Frames below were padded with an extra trailing column of zeros; redraw them to taste.
ArduinoLEDMatrix matrix;

static uint8_t FRAME_CHECK[8][13] = {
    {0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0},
    {0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0},
    {0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0},
    {0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0},
    {0, 1, 1, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0},
    {0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0},
    {0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0},
    {0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0},
};

static uint8_t FRAME_X[8][13] = {
    {1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0},
    {0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0},
    {0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0},
    {0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0},
    {0, 0, 0, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0},
    {0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0, 0, 0},
    {0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0, 0},
    {1, 1, 1, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0},
};

// Subsystem instances
BridgeComms wifi; // kept the name "wifi" so Carousel/AugerDriver need zero changes
CarouselDriver carousel(wifi);

#if USE_LOAD_CELL
Scale scale;
AugerDriver auger(wifi, scale);
#else
AugerDriver auger(wifi);
#endif

// Dispense state machine
enum class DispenseState
{
    IDLE,
    WAITING_FOR_BOWL,
    INDEXING,
    DISPENSING,
    PARKING,
    PUSH_COMPLETE,
    DONE
};

DispenseState dispenseState = DispenseState::IDLE;

// Holds the spice Python asked for on the last accepted start_dispense() RPC.
struct ActiveDispense
{
    uint8_t slot = 0;
    char spiceName[24] = {};
    char recipeName[48] = {};
    float targetGrams = 0.0f;
    uint8_t slotIdx = 0;
    uint8_t total = 1;
};

ActiveDispense active;
bool _bowlTared = false;
volatile bool _stopRequested = false;


bool onStartDispense(int slot, float grams, String spiceName,
                     String recipeName, int slotIdx, int total)
{
    if (dispenseState != DispenseState::IDLE)
    {
        Monitor.println(F("[Bridge] start_dispense rejected -- busy"));
        return false;
    }

    active.slot = (uint8_t)(slot & 0xFF);
    active.targetGrams = grams;
    active.slotIdx = (uint8_t)(slotIdx & 0xFF);
    active.total = (uint8_t)(total & 0xFF);

    strncpy(active.recipeName, recipeName.c_str(), sizeof(active.recipeName) - 1);
    strncpy(active.spiceName, spiceName.c_str(), sizeof(active.spiceName) - 1);
    active.recipeName[sizeof(active.recipeName) - 1] = '\0';
    active.spiceName[sizeof(active.spiceName) - 1] = '\0';

    Monitor.print(F("[CMD] slot="));
    Monitor.print(active.slot);
    Monitor.print(F(" grams="));
    Monitor.print(active.targetGrams);
    Monitor.print(F(" spice="));
    Monitor.print(active.spiceName);
    Monitor.print(F(" ("));
    Monitor.print(active.slotIdx + 1);
    Monitor.print(F("/"));
    Monitor.print(active.total);
    Monitor.println(F(")"));

    dispenseState = DispenseState::INDEXING;
    return true;
}

// Called from Python: Bridge.call("stop_dispense")
bool onStopDispense()
{
    Monitor.println(F("[CMD] STOP received -- aborting dispense."));
    _stopRequested = true;
    if (dispenseState != DispenseState::IDLE)
    {
        dispenseState = DispenseState::PUSH_COMPLETE;
    }
    return true;
}

// Called from Python: Bridge.call("get_health")

int onGetHealth()
{
    return (int)carousel.currentSlot();
}

bool onIsBusy()
{
    return dispenseState != DispenseState::IDLE;
}

// State machine tick -- called every loop() 
void tickDispense()
{
    switch (dispenseState)
    {
    case DispenseState::IDLE:
        break;

    case DispenseState::INDEXING:
    {
#if USE_LOAD_CELL
        if (active.slotIdx == 0 && !_bowlTared)
        {
            float bowlWeight = scale.readStable();

            Monitor.print(F("[Bowl] Scale reads: "));
            Monitor.print(bowlWeight, 2);
            Monitor.println(F("g"));

            if (bowlWeight < MIN_BOWL_WEIGHT_G)
            {
                Monitor.println(F("[Bowl] No bowl detected -- waiting..."));
                wifi.pushNoBowl();
                dispenseState = DispenseState::WAITING_FOR_BOWL;
                return;
            }

            Monitor.println(F("[Bowl] Bowl confirmed -- taring..."));
            scale.tare();
            _bowlTared = true;
            Monitor.println(F("[Bowl] Tare complete."));
        }
        else if (active.slotIdx > 0)
        {
            Monitor.println(F("[Bowl] Retaring for next slot..."));
            scale.tare();
            Monitor.println(F("[Bowl] Retare complete."));
        }
#endif

        wifi.pushIndexing(active.slot, active.spiceName,
                          active.slotIdx, active.total);
        auger.enableCoils();
        carousel.goToSlot(active.slot, active.spiceName);
        auger.startDispense(active.slot, active.spiceName,
                            active.targetGrams,
                            active.slotIdx, active.total);
        dispenseState = DispenseState::DISPENSING;
        break;
    }

    case DispenseState::WAITING_FOR_BOWL:
    {
#if USE_LOAD_CELL
        float w = scale.read();

        Monitor.print(F("[Bowl] Waiting... scale="));
        Monitor.print(w, 2);
        Monitor.println(F("g"));

        if (w >= MIN_BOWL_WEIGHT_G)
        {
            Monitor.println(F("[Bowl] Bowl detected! Proceeding..."));
            wifi.pushBowlDetected();
            delay(200);
            dispenseState = DispenseState::INDEXING;
        }
#else
        dispenseState = DispenseState::INDEXING;
#endif
        break;
    }

    case DispenseState::DISPENSING:
    {
        if (_stopRequested)
        {
            _stopRequested = false;
            active.slotIdx = active.total - 1;
            dispenseState = DispenseState::PUSH_COMPLETE;
            break;
        }
        if (auger.tickDispense())
        {
            auger.startPark();
            dispenseState = DispenseState::PARKING;
        }
        break;
    }

    case DispenseState::PARKING:
        if (auger.tickPark())
        {
            auger.finishPark();
            dispenseState = DispenseState::PUSH_COMPLETE;
        }
        break;

    case DispenseState::PUSH_COMPLETE:
        wifi.pushSpiceComplete(active.slot, active.spiceName,
                               active.targetGrams, active.targetGrams,
                               active.slotIdx);

        if (active.slotIdx + 1 >= active.total)
        {
            Monitor.println(F("[CMD] All spices done."));
            wifi.pushSessionComplete(active.recipeName);
            Monitor.println(F("[Carousel] Returning to slot 1..."));
            carousel.goToSlot(1);
            _bowlTared = false;

#if USE_LOAD_CELL
        // After session, tare with bowl+spice still on scale
        delay(500);
        scale.tare();
        Monitor.println(F("[Bowl] Post-session tare. Waiting for bowl removal..."));

        bool bowlRemoved = false;
        while (!bowlRemoved)
        {
            long raw = scale.rawRead(); // raw ADC, uncalibrated
            float w = scale.read();
            Monitor.print(F("[Bowl] raw="));
            Monitor.print(raw);
            Monitor.print(F("  filtered="));
            Monitor.println(w, 3);

            if (raw < 500000L) // large negative ADC count = bowl removed
            {
                bowlRemoved = true;
            }
            delay(200);
        }

        Monitor.println(F("[Bowl] Bowl removed! Settling then retaring..."));
        delay(1000);
        scale.tare();
        Monitor.println(F("[Bowl] Retared to empty scale. Ready for next session."));
#endif
        }
        dispenseState = DispenseState::IDLE;
        break;
    case DispenseState::DONE:
        dispenseState = DispenseState::IDLE;
        break;
    }
}

// setup()
void setup()
{
    Monitor.begin(115200);

    matrix.begin();
    matrix.renderBitmap(FRAME_X, 8, 13); // show X until Bridge is up

#if USE_LOAD_CELL
    Monitor.println(F("[boot] Bland2Grand - closed-loop (load cell)"));
#else
    Monitor.println(F("[boot] Bland2Grand - dead-reckoning mode"));
#endif

    // Subsystems
    carousel.begin();
    auger.begin();

#if USE_LOAD_CELL
    if (!scale.begin())
        Monitor.println(F("[WARN] HX711 not responding -- check wiring."));
    else
        Monitor.println(F("[OK] HX711 scale ready."));
#endif

  
    Bridge.begin();
    Bridge.provide_safe("start_dispense", onStartDispense);
    Bridge.provide_safe("stop_dispense", onStopDispense);
    Bridge.provide_safe("get_health", onGetHealth);
    Bridge.provide_safe("is_busy", onIsBusy);

    matrix.renderBitmap(FRAME_CHECK, 8, 13); // show checkmark once ready

    Monitor.println(F("[boot] ready"));
}

void loop()
{
    // Always tick the state machine (keeps motors smooth)
    tickDispense();
}
