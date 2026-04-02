// components/ui/Button.jsx
import React from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import clsx from 'clsx';

/**
 * Button
 * variant: primary | navy | ghost | text
 * size: sm | md (default) | lg
 */
export default function Button({
  children,
  variant = 'primary',
  size,
  full = false,
  loading = false,
  disabled = false,
  icon,
  iconRight,
  className,
  onClick,
  type = 'button',
  ...rest
}) {
  return (
    <button
      type={type}
      className={clsx(
        'btn',
        `btn--${variant}`,
        size && `btn--${size}`,
        full && 'btn--full',
        className,
      )}
      disabled={disabled || loading}
      onClick={onClick}
      {...rest}
    >
      {loading ? (
        <FontAwesomeIcon icon={faCircleNotch} spin />
      ) : (
        <>
          {icon && <FontAwesomeIcon icon={icon} />}
          {children}
          {iconRight && <FontAwesomeIcon icon={iconRight} />}
        </>
      )}
    </button>
  );
}
