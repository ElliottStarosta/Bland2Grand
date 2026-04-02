// pages/CompletionPage.jsx
import React, { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faTriangleExclamation,
  faRotateRight,
  faHouse,
} from '@fortawesome/free-solid-svg-icons';
import NavBar from '../layout/NavBar';
import Button from '../ui/Button';
import { useApp, ACTIONS } from '../../context/AppContext';
import { scaleSpices, SPICE_KEYS, spiceLabel, formatGrams, accuracyColor } from '../../utils/spices';
import { startDispense } from '../../utils/api';
import './CompletionPage.css';

export default function CompletionPage() {
  const navigate      = useNavigate();
  const { state, dispatch } = useApp();
  const { selectedRecipe, servings, dispenseStatus, actualWeights, dispenseError } = state;

  const containerRef   = useRef(null);
  const checkRef       = useRef(null);
  const isError        = dispenseStatus === 'error';

  // Redirect guard
  useEffect(() => {
    if (!selectedRecipe) navigate('/search', { replace: true });
  }, [selectedRecipe, navigate]);

  // ── Entrance animation ──────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const ctx = gsap.context(() => {
      const tl = gsap.timeline({ defaults: { ease: 'power3.out' } });

      tl.from('.completion-page__icon-wrap', { scale: 0.5, opacity: 0, duration: 0.55, ease: 'back.out(2)' })
        .from('.completion-page__heading',   { opacity: 0, y: 16, duration: 0.4 }, '-=0.2')
        .from('.completion-page__sub',       { opacity: 0, y: 12, duration: 0.35 }, '-=0.2')
        .from('.completion-page__summary',   { opacity: 0, y: 16, duration: 0.4 }, '-=0.1')
        .from('.completion-page__actions',   { opacity: 0, y: 12, duration: 0.35 }, '-=0.1');

      // Draw the check stroke
      if (!isError && checkRef.current) {
        gsap.fromTo(
          checkRef.current,
          { strokeDashoffset: 120 },
          { strokeDashoffset: 0, duration: 0.55, ease: 'power2.out', delay: 0.25 },
        );
      }
    }, containerRef);

    return () => ctx.revert();
  }, [isError]);

  if (!selectedRecipe) return null;

  const scaled    = scaleSpices(selectedRecipe.spices || {}, servings);
  const activeKeys = SPICE_KEYS.filter((k) => (scaled[k] || 0) > 0);

  const handleDispenseAgain = async () => {
    dispatch({ type: ACTIONS.DISPENSE_RESET });
    try {
      await startDispense({ recipe_id: selectedRecipe.id, servings });
      navigate('/dispense');
    } catch {
      navigate('/blend');
    }
  };

  const handleNewDish = () => {
    dispatch({ type: ACTIONS.DISPENSE_RESET });
    dispatch({ type: ACTIONS.CLEAR_SELECTION });
    navigate('/search');
  };

  return (
    <>
      <NavBar showBack={false} title="" />
      <div className="completion-page" ref={containerRef}>

        {/* Icon */}
        <div className="completion-page__icon-wrap">
          {isError ? (
            <div className="completion-page__icon completion-page__icon--error">
              <FontAwesomeIcon icon={faTriangleExclamation} />
            </div>
          ) : (
            <div className="completion-page__icon completion-page__icon--success">
              <svg viewBox="0 0 64 64" fill="none" aria-hidden="true" className="completion-page__check-svg">
                <circle cx="32" cy="32" r="30" fill="var(--color-success)" opacity={0.15} />
                <circle cx="32" cy="32" r="30" stroke="var(--color-success)" strokeWidth="2.5" />
                <polyline
                  ref={checkRef}
                  points="16,33 27,44 48,22"
                  fill="none"
                  stroke="var(--color-success)"
                  strokeWidth="3.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeDasharray="120"
                  strokeDashoffset="120"
                />
              </svg>
            </div>
          )}
        </div>

        {/* Heading */}
        <div className="completion-page__heading-wrap">
          <h1 className="completion-page__heading">
            {isError ? 'Something went wrong' : 'Done.'}
          </h1>
          <p className="completion-page__sub">
            {isError
              ? dispenseError || 'Check the machine and try again.'
              : `Your ${selectedRecipe.name} blend is ready.`}
          </p>
        </div>

        {/* Summary table */}
        {!isError && activeKeys.length > 0 && (
          <div className="completion-page__summary card">
            <div className="card__body card__body--sm">
              <p className="blend-page__section-label" style={{ marginBottom: 'var(--space-3)' }}>
                Dispensed Amounts
              </p>
              {activeKeys.map((key) => {
                const target  = scaled[key] || 0;
                const actual  = actualWeights[key];
                const hasData = actual != null;
                const color   = hasData ? accuracyColor(actual, target) : 'var(--color-text-muted)';

                return (
                  <div key={key} className="completion-page__row">
                    <span className="completion-page__row-label">{spiceLabel(key)}</span>
                    <div className="completion-page__row-values">
                      <span className="completion-page__row-target font-mono">
                        {formatGrams(target)}
                      </span>
                      <span className="completion-page__row-arrow">→</span>
                      <span
                        className="completion-page__row-actual font-mono"
                        style={{ color }}
                      >
                        {hasData ? formatGrams(actual) : '—'}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="completion-page__actions">
          {isError ? (
            <Button
              variant="navy"
              full
              size="lg"
              icon={faHouse}
              onClick={handleNewDish}
            >
              Return Home
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                full
                size="lg"
                icon={faRotateRight}
                onClick={handleDispenseAgain}
              >
                Dispense Again
              </Button>
              <Button
                variant="primary"
                full
                size="lg"
                onClick={handleNewDish}
              >
                New Dish
              </Button>
            </>
          )}
        </div>

      </div>
    </>
  );
}
