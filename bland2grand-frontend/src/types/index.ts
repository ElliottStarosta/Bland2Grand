// Shared types for recipes, dispense progress, and SSE payloads.

export {
  SPICE_SLOTS,
  SPICE_COLORS,
  SPICE_DENSITY_G_PER_ML,
  SPICE_LABELS,
} from "../slotConfig";

// All possible screens in the app navigation flow
export type Screen =
  | "search"
  | "results"
  | "serving"
  | "dispensing"
  | "complete"
  | "custom";

// Individual spice amount within a recipe
export interface SpiceAmount {
  slot: number; // Dispenser slot number (1-8)
  name: string; // Spice name
  grams_per_serving: number; // Weight in grams for one serving
}

// Complete recipe definition
export interface Recipe {
  id: number;
  name: string;
  category: string;
  description: string;
  spices: SpiceAmount[];
}

// Dispense state types

// Current status of a single spice slot during dispensing
export type SlotStatus =
  | "pending" // Not yet started
  | "indexing" // Turntable rotating to position
  | "dispensing" // Actively dispensing spice
  | "done" // Successfully completed
  | "error"; // Failed to dispense

// Progress tracking for a single spice slot
export interface SlotProgress {
  slot: number;
  name: string;
  target: number; // Target weight in grams
  current: number; // Current weight dispensed
  status: SlotStatus;
  actual?: number; // Final actual weight when complete
}

// Full dispense session state
export interface DispenseSession {
  recipeName: string;
  servingCount: number;
  slots: SlotProgress[];
  activeSlotIndex: number; // Index of currently active slot (-1 if none)
  isComplete: boolean;
  isError: boolean;
  errorMessage?: string;
  totalWeight: number; // Total weight dispensed so far
  totalTarget: number; // Total target weight for all spices
  lastCompletedSlot?: number; // Last slot that finished
  awaitingBowl: boolean; // Whether bowl is needed on scale
}

// Server-sent events from Flask backend (/api/status/stream)
export type SSEEvent =
  | { type: "connected" } // Connection established
  | { type: "heartbeat" } // Keep-alive ping
  | {
      type: "session_start";
      recipe_name: string;
      total_slots: number;
      slots: { slot: number; name: string; target: number }[];
    }
  | { type: "no_bowl" } // No bowl detected on scale
  | { type: "bowl_detected" } // Bowl placed on scale
  | {
      type: "indexing";
      slot: number;
      spice_name: string;
      slot_index: number;
      total_slots: number;
    }
  | {
      type: "nearly_there"; // Voice cue trigger - spice nearly complete
      slot: number;
      spice_name: string;
    }
  | {
      type: "dispensing_start";
      slot: number;
      spice_name: string;
      target_weight: number;
      slot_index: number;
      total_slots: number;
    }
  | {
      type: "weight_update";
      slot: number;
      current_weight: number;
      target_weight: number;
    }
  | {
      type: "spice_complete";
      slot: number;
      spice_name: string;
      actual: number;
      target: number;
      status: "done" | "timeout";
      slot_index: number;
    }
  | {
      type: "session_complete";
      recipe_name: string;
      completed: CompletedSpice[];
    }
  | { type: "session_error"; message: string; completed: CompletedSpice[] };

// Final spice result after dispense
export interface CompletedSpice {
  slot: number;
  name: string;
  target: number;
  actual: number;
  status: "done" | "timeout";
}

// Unit conversion constants
export const TSP_ML = 4.92; // 1 teaspoon in mL
export const TBSP_ML = 14.79; // 1 tablespoon in mL

// Unit types for custom recipe builder
export type Unit = "g" | "tsp" | "tbsp";

// Unit configuration
export const UNIT_STEPS: Record<Unit, number> = {
  g: 0.5,
  tsp: 0.25,
  tbsp: 0.25,
};
export const UNIT_MAX: Record<Unit, number> = {
  g: 10,
  tsp: 3,
  tbsp: 1,
};
export const UNIT_CYCLE: Unit[] = ["g", "tsp", "tbsp"]; // Cycle order for unit picker