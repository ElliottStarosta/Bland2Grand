export type Screen =
  | "search"
  | "results"
  | "serving"
  | "dispensing"
  | "complete"
  | "custom";

export interface SpiceAmount {
  slot: number;
  name: string;
  grams_per_serving: number;
}

export interface Recipe {
  id: number;
  name: string;
  category: string;
  description: string;
  spices: SpiceAmount[];
}

// Dispense state

export type SlotStatus =
  | "pending"
  | "indexing"
  | "dispensing"
  | "done"
  | "error";

export interface SlotProgress {
  slot: number;
  name: string;
  target: number;
  current: number;
  status: SlotStatus;
  actual?: number;
}

export interface DispenseSession {
  recipeName: string;
  servingCount: number;
  slots: SlotProgress[];
  activeSlotIndex: number;
  isComplete: boolean;
  isError: boolean;
  errorMessage?: string;
  totalWeight: number;
  totalTarget: number;
}

// SSE events

export type SSEEvent =
  | { type: "connected" }
  | { type: "heartbeat" }
  | {
      type: "session_start";
      recipe_name: string;
      total_slots: number;
      slots: { slot: number; name: string; target: number }[];
    }
  | {
      type: "indexing";
      slot: number;
      spice_name: string;
      slot_index: number;
      total_slots: number;
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

export interface CompletedSpice {
  slot: number;
  name: string;
  target: number;
  actual: number;
  status: "done" | "timeout";
}

// Spice colours

export const SPICE_COLORS: Record<number, string> = {
  1: "#8B6914", // Cumin       -- warm brown
  2: "#C94020", // Paprika     -- deep red
  3: "#D4C57A", // Garlic      -- pale gold
  4: "#7B1F1F", // Chili       -- dark red
  5: "#4E7C55", // Oregano     -- forest green
  6: "#D4A870", // Onion       -- sandy tan
  7: "#6f009a", // Pepper      -- near black
  8: "#C63B0A", // Cayenne     -- vivid orange-red
};

export const SPICE_LABELS: Record<number, string> = {
  1: "Cumin",
  2: "Paprika",
  3: "Garlic Powder",
  4: "Chili Powder",
  5: "Oregano",
  6: "Onion Powder",
  7: "Black Pepper",
  8: "Cayenne",
};

export const SPICE_DENSITY_G_PER_ML: Record<number, number> = {
  1: 0.5, // Cumin (ground)
  2: 0.45, // Paprika
  3: 0.55, // Garlic Powder
  4: 0.5, // Chili Powder
  5: 0.3, // Oregano (dried, fluffy)
  6: 0.5, // Onion Powder
  7: 0.6, // Black Pepper (ground)
  8: 0.45, // Cayenne
};

export const TSP_ML = 4.92;
export const TBSP_ML = 14.79;

export type Unit = "g" | "tsp" | "tbsp";

export const UNIT_STEPS: Record<Unit, number> = {
  g: 0.5,
  tsp: 0.25,
  tbsp: 0.25,
};
export const UNIT_MAX: Record<Unit, number> = { g: 10, tsp: 3, tbsp: 1 };
export const UNIT_CYCLE: Unit[] = ["g", "tsp", "tbsp"];
