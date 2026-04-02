// context/AppContext.js
// Global app state: selected recipe, servings, dispense session, navigation flow.

import React, { createContext, useContext, useReducer, useCallback } from 'react';

// ── Initial State ──────────────────────────────────────────
const initialState = {
  // Search
  searchQuery: '',
  searchResults: [],
  searchLoading: false,
  searchError: null,

  // Recipe selection
  selectedRecipe: null,
  servings: 1,

  // Dispense session
  dispenseStatus: 'idle',  // idle | starting | running | complete | error
  dispensePlan: null,
  dispenseEvents: [],
  currentSpice: null,
  completedSpices: {},
  actualWeights: {},
  dispenseError: null,

  // Settings
  calibration: {},
  spiceInfo: [],
};

// ── Action Types ───────────────────────────────────────────
export const ACTIONS = {
  SET_SEARCH_QUERY:    'SET_SEARCH_QUERY',
  SET_SEARCH_RESULTS:  'SET_SEARCH_RESULTS',
  SET_SEARCH_LOADING:  'SET_SEARCH_LOADING',
  SET_SEARCH_ERROR:    'SET_SEARCH_ERROR',
  CLEAR_SEARCH:        'CLEAR_SEARCH',

  SELECT_RECIPE:       'SELECT_RECIPE',
  SET_SERVINGS:        'SET_SERVINGS',
  CLEAR_SELECTION:     'CLEAR_SELECTION',

  DISPENSE_START:      'DISPENSE_START',
  DISPENSE_EVENT:      'DISPENSE_EVENT',
  DISPENSE_SPICE_START:'DISPENSE_SPICE_START',
  DISPENSE_PROGRESS:   'DISPENSE_PROGRESS',
  DISPENSE_SPICE_DONE: 'DISPENSE_SPICE_DONE',
  DISPENSE_COMPLETE:   'DISPENSE_COMPLETE',
  DISPENSE_ERROR:      'DISPENSE_ERROR',
  DISPENSE_RESET:      'DISPENSE_RESET',

  SET_CALIBRATION:     'SET_CALIBRATION',
  SET_SPICE_INFO:      'SET_SPICE_INFO',
};

// ── Reducer ────────────────────────────────────────────────
function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.SET_SEARCH_QUERY:
      return { ...state, searchQuery: action.payload };

    case ACTIONS.SET_SEARCH_RESULTS:
      return { ...state, searchResults: action.payload, searchLoading: false, searchError: null };

    case ACTIONS.SET_SEARCH_LOADING:
      return { ...state, searchLoading: action.payload };

    case ACTIONS.SET_SEARCH_ERROR:
      return { ...state, searchError: action.payload, searchLoading: false };

    case ACTIONS.CLEAR_SEARCH:
      return { ...state, searchQuery: '', searchResults: [], searchError: null };

    case ACTIONS.SELECT_RECIPE:
      return { ...state, selectedRecipe: action.payload, servings: 1 };

    case ACTIONS.SET_SERVINGS:
      return { ...state, servings: action.payload };

    case ACTIONS.CLEAR_SELECTION:
      return { ...state, selectedRecipe: null, servings: 1 };

    case ACTIONS.DISPENSE_START:
      return {
        ...state,
        dispenseStatus: 'running',
        dispensePlan: action.payload.plan,
        dispenseEvents: [],
        currentSpice: null,
        completedSpices: {},
        actualWeights: {},
        dispenseError: null,
      };

    case ACTIONS.DISPENSE_SPICE_START:
      return {
        ...state,
        currentSpice: {
          name: action.payload.spice,
          target: action.payload.target,
          current: 0,
          index: action.payload.index,
          total: action.payload.total,
        },
      };

    case ACTIONS.DISPENSE_PROGRESS:
      return {
        ...state,
        currentSpice: state.currentSpice
          ? { ...state.currentSpice, current: action.payload.current }
          : state.currentSpice,
      };

    case ACTIONS.DISPENSE_SPICE_DONE:
      return {
        ...state,
        completedSpices: {
          ...state.completedSpices,
          [action.payload.spice]: {
            actual: action.payload.actual,
            target: action.payload.target,
            accuracy: action.payload.accuracy,
          },
        },
        actualWeights: {
          ...state.actualWeights,
          [action.payload.spice]: action.payload.actual,
        },
        currentSpice: null,
      };

    case ACTIONS.DISPENSE_COMPLETE:
      return {
        ...state,
        dispenseStatus: 'complete',
        currentSpice: null,
        actualWeights: action.payload.actual_weights || state.actualWeights,
      };

    case ACTIONS.DISPENSE_ERROR:
      return {
        ...state,
        dispenseStatus: 'error',
        dispenseError: action.payload.message,
        currentSpice: null,
      };

    case ACTIONS.DISPENSE_RESET:
      return {
        ...state,
        dispenseStatus: 'idle',
        dispensePlan: null,
        dispenseEvents: [],
        currentSpice: null,
        completedSpices: {},
        actualWeights: {},
        dispenseError: null,
      };

    case ACTIONS.SET_CALIBRATION:
      return { ...state, calibration: action.payload };

    case ACTIONS.SET_SPICE_INFO:
      return { ...state, spiceInfo: action.payload };

    default:
      return state;
  }
}

// ── Context ────────────────────────────────────────────────
const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, initialState);

  const setSearchQuery = useCallback((q) =>
    dispatch({ type: ACTIONS.SET_SEARCH_QUERY, payload: q }), []);

  const selectRecipe = useCallback((recipe) =>
    dispatch({ type: ACTIONS.SELECT_RECIPE, payload: recipe }), []);

  const setServings = useCallback((n) =>
    dispatch({ type: ACTIONS.SET_SERVINGS, payload: n }), []);

  const resetDispense = useCallback(() =>
    dispatch({ type: ACTIONS.DISPENSE_RESET }), []);

  return (
    <AppContext.Provider value={{ state, dispatch, setSearchQuery, selectRecipe, setServings, resetDispense }}>
      {children}
    </AppContext.Provider>
  );
}

export function useAppState()    { return useContext(AppContext).state; }
export function useAppDispatch() { return useContext(AppContext).dispatch; }
export function useApp()         { return useContext(AppContext); }
