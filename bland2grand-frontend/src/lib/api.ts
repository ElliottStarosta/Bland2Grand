import type { Recipe } from '../types'

const BASE = '/api'

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error((body as { error?: string }).error ?? `HTTP ${res.status}`)
  }
  return res.json() as Promise<T>
}

export const api = {
  search(query: string) {
    return request<{ results: Recipe[]; count: number }>(
      `/search?q=${encodeURIComponent(query)}`,
    )
  },

  getRecipe(id: number) {
    return request<Recipe>(`/recipes/${id}`)
  },

  dispense(recipeId: number, servingCount: number) {
    return request<{ status: string; recipe: string; servings: number }>('/dispense', {
      method: 'POST',
      body: JSON.stringify({ recipe_id: recipeId, serving_count: servingCount }),
    })
  },

  createRecipe(name: string, spices: Record<string, number>, description?: string) {
    return request<{ status: string; recipe: Recipe }>('/recipe', {
      method: 'POST',
      body: JSON.stringify({ name, spices, description }),
    })
  },

  calibrate(slot: number, calFactor: number) {
    return request<{ status: string }>('/calibrate', {
      method: 'POST',
      body: JSON.stringify({ slot, cal_factor: calFactor }),
    })
  },

  health() {
    return request<{ status: string; mock_arduino: boolean }>('/health')
  },
}