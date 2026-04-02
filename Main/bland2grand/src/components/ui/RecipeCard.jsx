// components/ui/RecipeCard.jsx
import React, { useRef, useEffect } from 'react';
import { gsap } from 'gsap';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faArrowRight, faStar } from '@fortawesome/free-solid-svg-icons';
import { activeSpices, spiceLabel, SPICE_META } from '../../utils/spices';
import Button from './Button';
import './RecipeCard.css';

export default function RecipeCard({ recipe, onSelect, index = 0 }) {
  const cardRef = useRef(null);
  const active  = activeSpices(recipe.spices || {});

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    gsap.from(card, {
      opacity: 0,
      y: 20,
      duration: 0.4,
      delay: index * 0.08,
      ease: 'power3.out',
      clearProps: 'all',
    });
  }, []); // eslint-disable-line

  const handleMouseEnter = () => {
    gsap.to(cardRef.current, { y: -3, duration: 0.22, ease: 'power2.out' });
  };

  const handleMouseLeave = () => {
    gsap.to(cardRef.current, { y: 0, duration: 0.22, ease: 'power2.out' });
  };

  return (
    <div
      ref={cardRef}
      className="recipe-card"
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <div className="recipe-card__body">
        <div className="recipe-card__top">
          <div className="recipe-card__info">
            <h3 className="recipe-card__name">{recipe.name}</h3>
            <p className="recipe-card__desc">{recipe.description}</p>
          </div>
          <Button
            variant="primary"
            size="sm"
            iconRight={faArrowRight}
            onClick={onSelect}
            aria-label={`Select ${recipe.name}`}
          >
            Select
          </Button>
        </div>

        <div className="recipe-card__spices">
          {active.map((key) => (
            <span
              key={key}
              className="recipe-card__spice-pill"
              style={{ '--pill-color': SPICE_META[key]?.color ?? 'var(--color-navy)' }}
            >
              {spiceLabel(key)}
            </span>
          ))}
        </div>

        <div className="recipe-card__footer">
          <span className="recipe-card__tag badge badge--muted">
            {recipe.cuisine_tag}
          </span>
          {recipe.ai_generated && (
            <span className="recipe-card__ai badge badge--blue">
              <FontAwesomeIcon icon={faStar} /> AI blend
            </span>
          )}
          {recipe.use_count > 0 && (
            <span className="recipe-card__uses">
              {recipe.use_count} {recipe.use_count === 1 ? 'use' : 'uses'}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
