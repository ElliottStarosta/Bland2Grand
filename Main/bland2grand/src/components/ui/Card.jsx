// components/ui/Card.jsx
import React from 'react';
import clsx from 'clsx';

export default function Card({ children, variant, className, bodyClass, style }) {
  return (
    <div
      className={clsx('card', variant && `card--${variant}`, className)}
      style={style}
    >
      <div className={clsx('card__body', bodyClass)}>
        {children}
      </div>
    </div>
  );
}
