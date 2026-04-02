// pages/SettingsPage.jsx
import React, { useEffect, useState, useRef } from 'react';
import { gsap } from 'gsap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faCircle,
  faFloppyDisk,
  faRotateRight,
} from '@fortawesome/free-solid-svg-icons';
import NavBar from '../layout/NavBar';
import Button from '../ui/Button';
import { useAppDispatch, ACTIONS } from '../../context/AppContext';
import {
  getCalibration,
  updateCalibration,
  getSpices,
  saveCustomRecipe,
} from '../../utils/api';
import { SPICE_KEYS, spiceLabel, SPICE_META } from '../../utils/spices';
import './SettingsPage.css';

// ── Initial custom recipe state ───────────────────────────
const emptyCustom = {
  name: '',
  description: '',
  cuisine_tag: 'general',
  spices: Object.fromEntries(SPICE_KEYS.map((k) => [k, ''])),
};

export default function SettingsPage() {
  const dispatch = useAppDispatch();

  const [calibration,  setCalibration]  = useState({});
  const [spiceInfo,    setSpiceInfo]     = useState([]);
  const [calSaving,    setCalSaving]     = useState({});
  const [calValues,    setCalValues]     = useState({});
  const [connected,    setConnected]     = useState(null); // null=unknown
  const [custom,       setCustom]        = useState(emptyCustom);
  const [customSaving, setCustomSaving]  = useState(false);
  const [customError,  setCustomError]   = useState(null);
  const [customSuccess,setCustomSuccess] = useState(false);

  const containerRef = useRef(null);

  // ── Load calibration & spice info on mount ───────────────
  useEffect(() => {
    Promise.all([getCalibration(), getSpices()])
      .then(([cal, spicesData]) => {
        setCalibration(cal);
        setCalValues(
          Object.fromEntries(
            Object.entries(cal).map(([k, v]) => [k, String(v)])
          )
        );
        setSpiceInfo(spicesData.spices || []);
        dispatch({ type: ACTIONS.SET_CALIBRATION, payload: cal });
        dispatch({ type: ACTIONS.SET_SPICE_INFO, payload: spicesData.spices || [] });
        setConnected(true);
      })
      .catch(() => setConnected(false));
  }, []); // eslint-disable-line

  // ── Entrance animation ───────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-animate]', {
        opacity: 0, y: 16, duration: 0.45,
        stagger: 0.06, ease: 'power3.out', clearProps: 'all',
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  // ── Calibration save ─────────────────────────────────────
  const handleCalSave = async (spice) => {
    const val = parseFloat(calValues[spice]);
    if (isNaN(val) || val < 0.01 || val > 2.0) return;
    setCalSaving((s) => ({ ...s, [spice]: true }));
    try {
      await updateCalibration({ spice, grams_per_revolution: val });
      setCalibration((c) => ({ ...c, [spice]: val }));
    } finally {
      setCalSaving((s) => ({ ...s, [spice]: false }));
    }
  };

  // ── Custom recipe save ───────────────────────────────────
  const handleCustomSave = async () => {
    setCustomError(null);
    setCustomSuccess(false);
    if (!custom.name.trim()) {
      setCustomError('Recipe name is required.');
      return;
    }
    const spiceGrams = {};
    SPICE_KEYS.forEach((k) => {
      const v = parseFloat(custom.spices[k]);
      if (!isNaN(v) && v > 0) spiceGrams[k] = v;
    });
    if (Object.keys(spiceGrams).length === 0) {
      setCustomError('At least one spice amount is required.');
      return;
    }
    setCustomSaving(true);
    try {
      await saveCustomRecipe({
        name:        custom.name.trim(),
        description: custom.description.trim(),
        cuisine_tag: custom.cuisine_tag,
        spices:      spiceGrams,
      });
      setCustomSuccess(true);
      setCustom(emptyCustom);
    } catch (err) {
      setCustomError(err.message);
    } finally {
      setCustomSaving(false);
    }
  };

  return (
    <>
      <NavBar title="Settings" showBack />
      <div className="settings-page" ref={containerRef}>

        {/* ── Network status ─────────────────────────────── */}
        <section className="settings-section" data-animate>
          <p className="settings-section__title">Network</p>
          <div className="card">
            <div className="card__body card__body--sm">
              <div className="settings-network">
                <div className="settings-network__status">
                  <FontAwesomeIcon
                    icon={faCircle}
                    className="settings-network__dot"
                    style={{ color: connected === true ? 'var(--color-success)' : connected === false ? 'var(--color-error)' : 'var(--color-text-muted)' }}
                  />
                  <div>
                    <p className="settings-network__label">Arduino Connection</p>
                    <p className="settings-network__sub">
                      {connected === null ? 'Checking...' : connected ? 'Connected via WiFi' : 'Not reachable'}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  icon={faRotateRight}
                  onClick={() => window.location.reload()}
                >
                  Retry
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ── Calibration ────────────────────────────────── */}
        <section className="settings-section" data-animate>
          <p className="settings-section__title">Slot Calibration</p>
          <p className="settings-section__desc">
            Grams per revolution for each spice slot. Run a test dispense after changing.
          </p>
          <div className="card">
            <div className="card__body card__body--sm">
              {SPICE_KEYS.map((key, i) => {
                const meta = SPICE_META[key];
                return (
                  <div key={key} className="settings-cal-row">
                    <div className="settings-cal-row__slot"
                      style={{ background: meta?.color ?? 'var(--color-navy)' }}>
                      {i + 1}
                    </div>
                    <span className="settings-cal-row__label">{spiceLabel(key)}</span>
                    <input
                      type="number"
                      className="input settings-cal-row__input"
                      value={calValues[key] ?? ''}
                      step="0.01"
                      min="0.01"
                      max="2.0"
                      onChange={(e) =>
                        setCalValues((v) => ({ ...v, [key]: e.target.value }))
                      }
                      aria-label={`${spiceLabel(key)} grams per revolution`}
                    />
                    <Button
                      variant="ghost"
                      size="sm"
                      icon={faFloppyDisk}
                      loading={calSaving[key]}
                      onClick={() => handleCalSave(key)}
                    >
                      Save
                    </Button>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* ── Custom Recipe Builder ───────────────────────── */}
        <section className="settings-section" data-animate>
          <p className="settings-section__title">Custom Recipe</p>
          <p className="settings-section__desc">
            Define your own spice blend and save it to the database.
          </p>
          <div className="card">
            <div className="card__body">
              <div className="settings-custom">

                <div className="settings-field">
                  <label className="settings-field__label">Recipe Name</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="e.g. House Rub"
                    value={custom.name}
                    onChange={(e) => setCustom((c) => ({ ...c, name: e.target.value }))}
                  />
                </div>

                <div className="settings-field">
                  <label className="settings-field__label">Description (optional)</label>
                  <input
                    type="text"
                    className="input"
                    placeholder="One-line flavour note"
                    value={custom.description}
                    onChange={(e) => setCustom((c) => ({ ...c, description: e.target.value }))}
                  />
                </div>

                <div className="settings-field">
                  <label className="settings-field__label">Cuisine Tag</label>
                  <select
                    className="input"
                    value={custom.cuisine_tag}
                    onChange={(e) => setCustom((c) => ({ ...c, cuisine_tag: e.target.value }))}
                  >
                    {['general','mexican','indian','italian','bbq','cajun','middleeast','asian',
                      'greek','african','latin','seafood','vegan','american'].map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>

                <p className="settings-field__label" style={{ marginTop: 'var(--space-2)' }}>
                  Grams per serving
                </p>
                <div className="settings-spice-grid">
                  {SPICE_KEYS.map((key) => (
                    <div key={key} className="settings-spice-field">
                      <label className="settings-spice-field__label">{spiceLabel(key)}</label>
                      <input
                        type="number"
                        className="input settings-spice-field__input"
                        placeholder="0"
                        min="0"
                        max="10"
                        step="0.1"
                        value={custom.spices[key]}
                        onChange={(e) =>
                          setCustom((c) => ({
                            ...c,
                            spices: { ...c.spices, [key]: e.target.value },
                          }))
                        }
                      />
                    </div>
                  ))}
                </div>

                {customError && (
                  <div className="toast toast--error">{customError}</div>
                )}
                {customSuccess && (
                  <div className="toast toast--success">Recipe saved successfully.</div>
                )}

                <Button
                  variant="navy"
                  full
                  loading={customSaving}
                  icon={faFloppyDisk}
                  onClick={handleCustomSave}
                  style={{ marginTop: 'var(--space-4)' }}
                >
                  Save Recipe
                </Button>
              </div>
            </div>
          </div>
        </section>

      </div>
    </>
  );
}
