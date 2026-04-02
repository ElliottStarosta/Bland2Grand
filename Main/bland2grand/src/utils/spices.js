// utils/spices.js
// Canonical spice metadata, display helpers, and gram formatting.

export const SPICE_KEYS = [
  'cumin',
  'paprika',
  'garlic_powder',
  'chili_powder',
  'oregano',
  'onion_powder',
  'black_pepper',
  'cayenne',
];

export const SPICE_META = {
  cumin:         { label: 'Cumin',         motor: 1, color: '#C4893A' },
  paprika:       { label: 'Paprika',       motor: 2, color: '#C94030' },
  garlic_powder: { label: 'Garlic Powder', motor: 3, color: '#D4B86A' },
  chili_powder:  { label: 'Chili Powder',  motor: 4, color: '#9E2A2B' },
  oregano:       { label: 'Oregano',       motor: 5, color: '#5A8A3C' },
  onion_powder:  { label: 'Onion Powder',  motor: 6, color: '#C9A85A' },
  black_pepper:  { label: 'Black Pepper',  motor: 7, color: '#3A3A3A' },
  cayenne:       { label: 'Cayenne',       motor: 8, color: '#D44A1A' },
};

/**
 * Display label for a spice key.
 * @param {string} key
 */
export const spiceLabel = (key) => SPICE_META[key]?.label ?? key;

/**
 * Format grams to 1 decimal with 'g' suffix.
 * @param {number} grams
 */
export const formatGrams = (grams) =>
  grams != null ? `${(+grams).toFixed(1)}g` : '—';

/**
 * Scale a recipe's spice amounts by servings count.
 * @param {Object} spices   — { spice_key: base_grams_per_serving }
 * @param {number} servings
 * @returns {Object}         — { spice_key: scaled_grams }
 */
export const scaleSpices = (spices, servings) => {
  const result = {};
  SPICE_KEYS.forEach((key) => {
    const base = spices[key] || 0;
    const scaled = Math.round(base * servings * 10) / 10;
    if (scaled > 0) result[key] = scaled;
  });
  return result;
};

/**
 * Get only non-zero spice entries from a recipe's spice map.
 * @param {Object} spices
 */
export const activeSpices = (spices) =>
  SPICE_KEYS.filter((k) => (spices[k] || 0) > 0);

/**
 * Accuracy colour for a dispensed vs target comparison.
 * @param {number} actual
 * @param {number} target
 */
export const accuracyColor = (actual, target) => {
  const diff = Math.abs(actual - target);
  if (diff <= 0.3)  return 'var(--color-success)';
  if (diff <= 0.6)  return 'var(--color-warning)';
  return 'var(--color-error)';
};
