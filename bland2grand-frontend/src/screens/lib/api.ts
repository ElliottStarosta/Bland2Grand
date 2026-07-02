// Typed fetch wrapper for all backend /api routes
// In development, Vite proxies these requests to the Flask backend.

import type { Recipe } from '../../types'

// Base path for all API requests
const BASE = '/api'

/**
 * Generic request helper that wraps fetch with:
 * - consistent base URL
 * - JSON headers
 * - typed return values
 * - centralized error handling
 */
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })

  // Handle non-success HTTP responses
  if (!res.ok) {
    // Attempt to extract error message from response body
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }

  // Return parsed JSON response as typed data
  return res.json() as Promise<T>
}

// API wrapper for frontend ↔ backend communication
export const api = {
  // Search for recipes using a query string
  search(query: string) {
    return request<{ results: Recipe[]; count: number }>(
      `/search?q=${encodeURIComponent(query)}`
    )
  },

  // Fetch a single recipe by its ID
  getRecipe(id: number) {
    return request<Recipe>(`/recipes/${id}`)
  },

  // Trigger dispensing process for a recipe
  dispense(recipeId: number, servingCount: number) {
    return request<{ status: string; recipe: string; servings: number }>(
      '/dispense',
      {
        method: 'POST',
        body: JSON.stringify({
          recipe_id: recipeId,
          serving_count: servingCount,
        }),
      }
    )
  },

  // Create a new recipe with name, spice mapping, and optional description
  createRecipe(
    name: string,
    spices: Record<string, number>,
    description?: string
  ) {
    return request<{ status: string; recipe: Recipe }>('/recipe', {
      method: 'POST',
      body: JSON.stringify({ name, spices, description }),
    })
  },

  // Calibrate a dispenser slot with a calibration factor
  calibrate(slot: number, calFactor: number) {
    return request<{ status: string }>('/calibrate', {
      method: 'POST',
      body: JSON.stringify({ slot, cal_factor: calFactor }),
    })
  },

  // Check system health and Arduino connection status
  health() {
    return request<{ status: string; mock_arduino: boolean }>('/health')
  },
}