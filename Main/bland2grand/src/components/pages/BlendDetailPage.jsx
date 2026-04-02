// pages/BlendDetailPage.jsx
import React, { useRef, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faFlask, faChevronRight } from '@fortawesome/free-solid-svg-icons';
import NavBar from '../layout/NavBar';
import Button from '../ui/Button';
import SpiceRow from '../ui/SpiceRow';
import { useApp, useAppState, ACTIONS } from '../../context/AppContext';
import { scaleSpices, SPICE_KEYS, spiceLabel, formatGrams } from '../../utils/spices';
import { startDispense } from '../../utils/api';
import './BlendDetailPage.css';

export default function BlendDetailPage() {
  const navigate = useNavigate();
  const { state, dispatch } = useApp();
  const { selectedRecipe, servings } = useAppState();

  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState(null);
  const containerRef            = useRef(null);
  const gramsRef                = useRef(null);

  // ── Redirect if no recipe selected ─────────────────────
  useEffect(() => {
    if (!selectedRecipe) navigate('/search', { replace: true });
  }, [selectedRecipe, navigate]);

  // ── Entrance animation ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;
    const ctx = gsap.context(() => {
      gsap.from('[data-animate]', {
        opacity: 0, y: 22, duration: 0.5,
        stagger: 0.07, ease: 'power3.out', clearProps: 'all',
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  // ── Animate gram values when servings change ────────────
  useEffect(() => {
    if (!gramsRef.current) return;
    gsap.from(gramsRef.current.querySelectorAll('.spice-row__value'), {
      opacity: 0.2, duration: 0.25, ease: 'power2.out', clearProps: 'all',
    });
  }, [servings]);

  if (!selectedRecipe) return null;

  const scaled  = scaleSpices(selectedRecipe.spices || {}, servings);
  const active  = SPICE_KEYS.filter((k) => (scaled[k] || 0) > 0);
  const total   = active.reduce((s, k) => s + (scaled[k] || 0), 0);

  const handleServingsChange = (e) => {
    dispatch({ type: ACTIONS.SET_SERVINGS, payload: Number(e.target.value) });
  };

  const handleDispense = async () => {
    setError(null);
    setLoading(true);
    try {
      await startDispense({ recipe_id: selectedRecipe.id, servings });
      navigate('/dispense');
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <NavBar title={selectedRecipe.name} showBack />
      <div className="blend-page" ref={containerRef}>

        {/* Recipe header */}
        <div className="blend-page__header" data-animate>
          <div className="blend-page__title-row">
            <div className="blend-page__icon">
              <FontAwesomeIcon icon={faFlask} />
            </div>
            <div>
              <h1 className="blend-page__name">{selectedRecipe.name}</h1>
              <p className="blend-page__desc">{selectedRecipe.description}</p>
            </div>
          </div>
        </div>

        {/* Servings slider */}
        <div className="blend-page__section card" data-animate>
          <div className="card__body">
            <div className="blend-page__servings-header">
              <span className="blend-page__section-label">Servings</span>
              <span className="blend-page__servings-value">{servings}</span>
            </div>
            <input
              type="range"
              className="slider"
              min={1}
              max={20}
              value={servings}
              onChange={handleServingsChange}
              aria-label="Number of servings"
            />
            <div className="blend-page__servings-ticks">
              <span>1</span>
              <span>10</span>
              <span>20</span>
            </div>
          </div>
        </div>

        {/* Spice breakdown */}
        <div className="blend-page__section card" data-animate>
          <div className="card__body">
            <p className="blend-page__section-label" style={{ marginBottom: 'var(--space-2)' }}>
              Spice Breakdown
            </p>
            <div ref={gramsRef}>
              {active.map((key) => (
                <SpiceRow
                  key={key}
                  spiceKey={key}
                  grams={scaled[key]}
                  target={scaled[key]}
                  status="pending"
                />
              ))}
            </div>

            {/* Total */}
            <div className="blend-page__total">
              <span className="blend-page__total-label">Total</span>
              <span className="blend-page__total-value font-mono">
                {formatGrams(total)}
              </span>
            </div>

            {/* Slot indicators */}
            <div className="blend-page__slots">
              {Array.from({ length: 8 }, (_, i) => {
                const key    = SPICE_KEYS[i];
                const inBlend = (scaled[key] || 0) > 0;
                return (
                  <div
                    key={i}
                    className={`blend-page__slot${inBlend ? ' blend-page__slot--active' : ''}`}
                    title={inBlend ? spiceLabel(key) : `Slot ${i + 1} unused`}
                  >
                    {i + 1}
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="toast toast--error" data-animate>{error}</div>
        )}

        {/* CTA */}
        <div className="blend-page__cta" data-animate>
          <Button
            variant="navy"
            size="lg"
            full
            loading={loading}
            disabled={active.length === 0}
            iconRight={faChevronRight}
            onClick={handleDispense}
          >
            Start Dispensing
          </Button>
        </div>

      </div>
    </>
  );
}
