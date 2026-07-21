#pragma once

#include <Arduino.h>
#include <Arduino_RouterBridge.h>
#include "Constants.h"


class BridgeComms
{
public:
    BridgeComms() {}

    // Call once from setup(), after Bridge.begin().
    bool connect(){ return true; }

    void startServer() {}

    bool isConnected() const { return true; }

    // Carousel has started moving to the requested slot.
    bool pushIndexing(uint8_t slot, const char *spiceName,
                      uint8_t slotIdx, uint8_t total)
    {
        Bridge.call("push_indexing", slot, String(spiceName), slotIdx, total);
        return true;
    }

    // Carousel is one slot away; UI can prep the next animation beat.
    bool pushNearlyThere(uint8_t slot, const char *spiceName)
    {
        Bridge.call("push_nearly_there", slot, String(spiceName));
        return true;
    }

    // Auger has started; includes target weight for the progress bar.
    bool pushDispenseStart(uint8_t slot, const char *spiceName,
                           float targetGrams, uint8_t slotIdx, uint8_t total)
    {
        Bridge.call("push_dispense_start", slot, String(spiceName),
                    targetGrams, slotIdx, total);
        return true;
    }

    // Blocking-style weight push (kept for API compatibility -- now just an RPC call, same as pushWeightUDP below).
    bool pushWeightUpdate(uint8_t slot, float current, float target)
    {
        Bridge.call("push_weight_update", slot, current, target);
        return true;
    }

    // Unblocks the Python dispense loop -- must fire once per accepted spice.
    bool pushSpiceComplete(uint8_t slot, const char *spiceName,
                           float actual, float target, uint8_t slotIdx)
    {
        Bridge.call("push_spice_complete", slot, String(spiceName),
                    actual, target, slotIdx);
        return true;
    }

    bool pushNoBowl()
    {
        Bridge.call("push_no_bowl");
        return true;
    }

    bool pushBowlDetected()
    {
        Bridge.call("push_bowl_detected");
        return true;
    }

    bool pushSessionComplete(const char *recipeName)
    {
        Bridge.call("push_session_complete", String(recipeName));
        return true;
    }

    bool pushFault(const char *message)
    {
        Bridge.call("push_fault", String(message));
        return true;
    }

    // Fast-path weight push during motor moves.
    void pushWeightUDP(uint8_t slot, float current, float target)
    {
        Bridge.call("push_weight_update", slot, current, target);
    }

    // Burst of fake progress updates -- blocking, called after motors stop to animate the app progress bar smoothly.
    void pushProgressBurst(uint8_t slot, float targetGrams, uint8_t steps = 8)
    {
        for (uint8_t i = 1; i <= steps; i++)
        {
            float progress = targetGrams * (static_cast<float>(i) / steps);
            pushWeightUpdate(slot, progress, targetGrams);
            delay(40);
        }
    }
};
