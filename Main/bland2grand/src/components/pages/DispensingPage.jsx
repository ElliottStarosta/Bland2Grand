// pages/DispensingPage.jsx
import React, { useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import NavBar from '../layout/NavBar';
import OctagonDiagram from '../ui/OctagonDiagram';
import SpiceRow from '../ui/SpiceRow';
import { useApp, ACTIONS } from '../../context/AppContext';
import { createDispenseStream } from '../../utils/api';
import { SPICE_KEYS, scaleSpices, spiceLabel, formatGrams } from '../../utils/spices';
import './DispensingPage.css';

export default function DispensingPage() {
  const navigate  = useNavigate();
  const { state, dispatch } = useApp();
  const {
    selectedRecipe,
    servings,
    dispenseStatus,
    dispensePlan,
    currentSpice,
    completedSpices,
    dispenseError,
  } = state;

  const streamRef      = useRef(null);
  const gramCounterRef = useRef(null);
  const containerRef   = useRef(null);
  const prevGramRef    = useRef(0);

  // Redirect guard
  useEffect(() => {
    if (!selectedRecipe) {
      navigate('/search', { replace: true });
    }
  }, [selectedRecipe, navigate]);

  // ── SSE stream ──────────────────────────────────────────
  const handleEvent = useCallback((type, data) => {
    switch (type) {
      case 'start':
        dispatch({ type: ACTIONS.DISPENSE_START, payload: { plan: data.plan } });
        break;

      case 'spice_start':
        dispatch({ type: ACTIONS.DISPENSE_SPICE_START, payload: data });
        prevGramRef.current = 0;
        break;

      case 'progress':
        dispatch({ type: ACTIONS.DISPENSE_PROGRESS, payload: { current: data.current } });
        // Animate the gram counter
        if (gramCounterRef.current) {
          gsap.to({ val: prevGramRef.current }, {
            val: data.current,
            duration: 0.25,
            ease: 'power1.out',
            onUpdate: function () {
              if (gramCounterRef.current) {
                gramCounterRef.current.textContent = `${this.targets()[0].val.toFixed(1)}g`;
              }
            },
          });
          prevGramRef.current = data.current;
        }
        break;

      case 'spice_done':
        dispatch({ type: ACTIONS.DISPENSE_SPICE_DONE, payload: data });
        break;

      case 'complete':
        dispatch({ type: ACTIONS.DISPENSE_COMPLETE, payload: data });
        if (streamRef.current) {
          streamRef.current.close();
          streamRef.current = null;
        }
        navigate('/complete');
        break;

      case 'error':
        dispatch({ type: ACTIONS.DISPENSE_ERROR, payload: data });
        if (streamRef.current) {
          streamRef.current.close();
          streamRef.current = null;
        }
        break;

      default:
        break;
    }
  }, [dispatch, navigate]);

  useEffect(() => {
    // Open SSE connection
    streamRef.current = createDispenseStream(handleEvent, (err) => {
      console.error('SSE error:', err);
    });

    // Entrance animation
    const ctx = gsap.context(() => {
      gsap.from('[data-animate]', {
        opacity: 0, y: 16, duration: 0.45,
        stagger: 0.06, ease: 'power3.out', clearProps: 'all',
      });
    }, containerRef);

    return () => {
      ctx.revert();
      if (streamRef.current) {
        streamRef.current.close();
        streamRef.current = null;
      }
    };
  }, []); // eslint-disable-line

  if (!selectedRecipe) return null;

  const scaled      = scaleSpices(selectedRecipe.spices || {}, servings);
  const allSpices   = SPICE_KEYS.filter((k) => (scaled[k] || 0) > 0);
  const doneIndices = Object.keys(completedSpices).map((k) => allSpices.indexOf(k)).filter((i) => i >= 0);
  const activeIndex = currentSpice ? allSpices.indexOf(currentSpice.name) : -1;
  const progress    = currentSpice
    ? Math.min((currentSpice.current ?? 0) / (currentSpice.target || 1), 1)
    : 0;

  const getStatus = (key) => {
    if (completedSpices[key]) return 'done';
    if (currentSpice?.name === key) return 'active';
    return 'pending';
  };

  return (
    <>
      <NavBar title="Dispensing" dispensing />
      <div className="dispense-page" ref={containerRef}>

        {/* Octagon diagram */}
        <div className="dispense-page__octagon" data-animate>
          <OctagonDiagram
            activeSlot={activeIndex}
            doneSlots={doneIndices}
            spiceOrder={allSpices}
          />
        </div>

        {/* Active spice info */}
        {currentSpice && (
          <div className="dispense-page__active card" data-animate>
            <div className="card__body">
              <p className="dispense-page__active-label">Currently dispensing</p>
              <h2 className="dispense-page__active-name">
                {spiceLabel(currentSpice.name)}
              </h2>

              {/* Gram counter */}
              <div className="dispense-page__gram-counter">
                <span
                  ref={gramCounterRef}
                  className="dispense-page__gram-current font-mono"
                >
                  {formatGrams(currentSpice.current ?? 0)}
                </span>
                <span className="dispense-page__gram-sep">/</span>
                <span className="dispense-page__gram-target font-mono">
                  {formatGrams(currentSpice.target)}
                </span>
              </div>

              {/* Progress bar */}
              <div className="progress-bar" style={{ height: 8, marginTop: 'var(--space-3)' }}>
                <div
                  className="progress-bar__fill"
                  style={{ width: `${progress * 100}%`, transition: 'width 0.2s ease-out' }}
                />
              </div>

              {/* Spice index */}
              <p className="dispense-page__step text-muted">
                {currentSpice.index} of {currentSpice.total}
              </p>
            </div>
          </div>
        )}

        {/* Error state */}
        {dispenseStatus === 'error' && (
          <div className="toast toast--error" data-animate>
            {dispenseError || 'A dispense error occurred. Check the machine.'}
          </div>
        )}

        {/* Checklist */}
        <div className="dispense-page__checklist card" data-animate>
          <div className="card__body card__body--sm">
            <p className="blend-page__section-label" style={{ marginBottom: 'var(--space-3)' }}>
              Progress
            </p>
            {allSpices.map((key) => (
              <SpiceRow
                key={key}
                spiceKey={key}
                target={scaled[key]}
                grams={currentSpice?.name === key ? currentSpice.current : scaled[key]}
                actual={completedSpices[key]?.actual}
                status={getStatus(key)}
                showBar={currentSpice?.name === key}
              />
            ))}
          </div>
        </div>

        {/* Cancel */}
        <div className="dispense-page__footer" data-animate>
          <button
            className="btn btn--text"
            onClick={() => navigate('/search')}
          >
            Cancel
          </button>
        </div>

      </div>
    </>
  );
}
