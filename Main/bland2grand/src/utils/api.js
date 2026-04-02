// utils/api.js
// Centralised API client for Bland2Grand Flask backend
// All endpoints, error handling, and SSE streaming live here.

import axios from 'axios';

const BASE_URL = process.env.REACT_APP_API_URL || '';

const client = axios.create({
  baseURL: BASE_URL,
  timeout: 30_000,
  headers: { 'Content-Type': 'application/json' },
});

// ── Response interceptor for consistent error shape ──────────
client.interceptors.response.use(
  (res) => res.data,
  (err) => {
    const message =
      err.response?.data?.error ||
      err.message ||
      'An unexpected error occurred.';
    return Promise.reject(new Error(message));
  },
);

// ────────────────────────────────────────────────────────────
// Search
// ────────────────────────────────────────────────────────────

/**
 * Search recipes by dish name.
 * @param {string} query
 * @param {number} limit
 * @returns {Promise<{ results: Recipe[], query: string, count: number }>}
 */
export const searchRecipes = (query, limit = 3) =>
  client.get('/api/search', { params: { q: query, limit } });

// ────────────────────────────────────────────────────────────
// Recipes
// ────────────────────────────────────────────────────────────

/**
 * Get a single recipe by ID.
 * @param {number} id
 * @returns {Promise<Recipe>}
 */
export const getRecipe = (id) => client.get(`/api/recipe/${id}`);

/**
 * Save a custom user-defined recipe.
 * @param {{ name, description, cuisine_tag, spices }} data
 * @returns {Promise<{ status: string, recipe: Recipe }>}
 */
export const saveCustomRecipe = (data) =>
  client.post('/api/recipe/custom', data);

// ────────────────────────────────────────────────────────────
// Dispense
// ────────────────────────────────────────────────────────────

/**
 * Start a dispense sequence.
 * @param {{ recipe_id: number, servings: number }} data
 * @returns {Promise<{ status: string, recipe: string, plan: object }>}
 */
export const startDispense = (data) =>
  client.post('/api/dispense', data);

/**
 * Get current dispense session status (polling fallback).
 * @returns {Promise<SessionStatus>}
 */
export const getDispenseStatus = () =>
  client.get('/api/dispense/status');

/**
 * Create an EventSource for the SSE dispense stream.
 * Caller is responsible for closing the stream.
 * @param {(event: string, data: object) => void} onEvent
 * @param {(err: Event) => void} onError
 * @returns {EventSource}
 */
export const createDispenseStream = (onEvent, onError) => {
  const url = `${BASE_URL}/api/dispense/stream`;
  const es = new EventSource(url);

  const eventTypes = [
    'start', 'spice_start', 'progress', 'spice_done', 'complete', 'error',
  ];

  eventTypes.forEach((type) => {
    es.addEventListener(type, (e) => {
      try {
        const data = JSON.parse(e.data);
        onEvent(type, data);
      } catch {
        onEvent(type, e.data);
      }
    });
  });

  es.addEventListener('heartbeat', () => {
    // keep-alive, no-op
  });

  es.onerror = (err) => {
    if (onError) onError(err);
  };

  return es;
};

// ────────────────────────────────────────────────────────────
// Calibration
// ────────────────────────────────────────────────────────────

/** @returns {Promise<CalibrationMap>} */
export const getCalibration = () => client.get('/api/calibrate');

/**
 * @param {{ spice: string, grams_per_revolution: number }} data
 */
export const updateCalibration = (data) =>
  client.post('/api/calibrate', data);

// ────────────────────────────────────────────────────────────
// Spices
// ────────────────────────────────────────────────────────────

/** @returns {Promise<{ spices: SpiceInfo[] }>} */
export const getSpices = () => client.get('/api/spices');

// ────────────────────────────────────────────────────────────
// Stats
// ────────────────────────────────────────────────────────────

/** @returns {Promise<Stats>} */
export const getStats = () => client.get('/api/stats');

// ────────────────────────────────────────────────────────────
// JSDoc type stubs
// ────────────────────────────────────────────────────────────

/**
 * @typedef {Object} Recipe
 * @property {number}  id
 * @property {string}  name
 * @property {string}  description
 * @property {string}  cuisine_tag
 * @property {boolean} ai_generated
 * @property {number}  use_count
 * @property {Object}  spices  — { cumin: float, paprika: float, ... }
 */

/**
 * @typedef {Object} SessionStatus
 * @property {number}  recipe_id
 * @property {number}  total_spices
 * @property {number}  completed
 * @property {boolean} running
 * @property {Object}  actual_weights
 */
