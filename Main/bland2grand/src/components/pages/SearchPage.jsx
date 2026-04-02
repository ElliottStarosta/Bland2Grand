// pages/SearchPage.jsx
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gsap } from 'gsap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faMagnifyingGlass,
  faXmark,
  faWandMagicSparkles,
  faCircleNotch,
} from '@fortawesome/free-solid-svg-icons';
import NavBar from '../layout/NavBar';
import RecipeCard from '../ui/RecipeCard';
import { useAppDispatch, useAppState, ACTIONS } from '../../context/AppContext';
import { useDebounce } from '../../hooks/useDebounce';
import { searchRecipes } from '../../utils/api';
import './SearchPage.css';

export default function SearchPage() {
  const navigate   = useNavigate();
  const dispatch   = useAppDispatch();
  const { searchQuery, searchResults, searchLoading, searchError } = useAppState();

  const [inputValue, setInputValue] = useState(searchQuery);
  const debouncedQuery = useDebounce(inputValue, 320);

  const containerRef = useRef(null);
  const inputRef     = useRef(null);

  // ── Entrance animation ───────────────────────────────────
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.from('[data-animate]', {
        opacity: 0, y: 18, duration: 0.5,
        stagger: 0.08, ease: 'power3.out',
        clearProps: 'all',
      });
    }, containerRef);
    return () => ctx.revert();
  }, []);

  // ── Trigger search on debounced input ────────────────────
  useEffect(() => {
    const q = debouncedQuery.trim();
    dispatch({ type: ACTIONS.SET_SEARCH_QUERY, payload: q });

    if (!q) {
      dispatch({ type: ACTIONS.SET_SEARCH_RESULTS, payload: [] });
      return;
    }

    let cancelled = false;
    dispatch({ type: ACTIONS.SET_SEARCH_LOADING, payload: true });

    searchRecipes(q)
      .then((data) => {
        if (!cancelled) {
          dispatch({ type: ACTIONS.SET_SEARCH_RESULTS, payload: data.results || [] });
        }
      })
      .catch((err) => {
        if (!cancelled) {
          dispatch({ type: ACTIONS.SET_SEARCH_ERROR, payload: err.message });
        }
      });

    return () => { cancelled = true; };
  }, [debouncedQuery]); // eslint-disable-line

  const handleSelect = (recipe) => {
    dispatch({ type: ACTIONS.SELECT_RECIPE, payload: recipe });
    navigate('/blend');
  };

  const clearInput = () => {
    setInputValue('');
    dispatch({ type: ACTIONS.CLEAR_SEARCH });
    inputRef.current?.focus();
  };

  const showEmpty   = !searchLoading && debouncedQuery && searchResults.length === 0 && !searchError;
  const showResults = searchResults.length > 0;

  return (
    <>
      <NavBar showSettings />
      <div className="search-page" ref={containerRef}>
        {/* Hero label */}
        <div className="search-page__hero" data-animate>
          <p className="search-page__label">What are you cooking?</p>
        </div>

        {/* Search input */}
        <div className="search-page__input-wrap" data-animate>
          <div className="input-wrap">
            <FontAwesomeIcon
              icon={faMagnifyingGlass}
              className="input-icon input-icon--left"
            />
            <input
              ref={inputRef}
              type="text"
              className="input input--search"
              placeholder="Tacos, Butter Chicken, BBQ Ribs..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              autoFocus
              autoComplete="off"
              autoCorrect="off"
              spellCheck="false"
            />
            {inputValue && (
              <button
                className="search-page__clear"
                onClick={clearInput}
                aria-label="Clear search"
              >
                {searchLoading
                  ? <FontAwesomeIcon icon={faCircleNotch} spin />
                  : <FontAwesomeIcon icon={faXmark} />
                }
              </button>
            )}
          </div>
        </div>

        {/* Error */}
        {searchError && !searchLoading && (
          <div className="search-page__alert toast toast--error" data-animate>
            {searchError}
          </div>
        )}

        {/* Results */}
        {showResults && (
          <div className="search-page__results" data-animate>
            {searchResults.map((recipe, i) => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                index={i}
                onSelect={() => handleSelect(recipe)}
              />
            ))}
          </div>
        )}

        {/* AI generating state */}
        {searchLoading && debouncedQuery && searchResults.length === 0 && (
          <div className="search-page__ai-state" data-animate>
            <FontAwesomeIcon icon={faWandMagicSparkles} className="search-page__ai-icon" />
            <p className="search-page__ai-text">Finding the best blend...</p>
          </div>
        )}

        {/* Empty state */}
        {showEmpty && (
          <div className="search-page__empty" data-animate>
            <p className="search-page__empty-title">No results found</p>
            <p className="search-page__empty-sub">
              Try a different dish name or check your spelling.
            </p>
          </div>
        )}

        {/* Idle prompt */}
        {!inputValue && (
          <div className="search-page__idle" data-animate>
            <div className="search-page__suggestions">
              {['Taco Seasoning', 'Butter Chicken', 'BBQ Dry Rub', 'Cajun Seasoning'].map((s) => (
                <button
                  key={s}
                  className="search-page__suggestion-chip"
                  onClick={() => setInputValue(s)}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
