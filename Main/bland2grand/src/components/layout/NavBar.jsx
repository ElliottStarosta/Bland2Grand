// components/layout/NavBar.jsx
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import {
  faChevronLeft,
  faGear,
  faCircle,
} from '@fortawesome/free-solid-svg-icons';
import './NavBar.css';

const ROUTE_TITLES = {
  '/':          null,          // splash has its own header
  '/search':    'Bland2Grand',
  '/blend':     null,          // dynamic — set by page
  '/dispense':  'Dispensing',
  '/complete':  null,
  '/settings':  'Settings',
};

export default function NavBar({ title, showBack = false, showSettings = false, dispensing = false }) {
  const navigate  = useNavigate();
  const location  = useLocation();

  const resolvedTitle = title ?? ROUTE_TITLES[location.pathname] ?? '';

  if (location.pathname === '/') return null;

  return (
    <nav className="navbar">
      <div className="navbar__left">
        {showBack && (
          <button className="navbar__back" onClick={() => navigate(-1)} aria-label="Go back">
            <FontAwesomeIcon icon={faChevronLeft} />
          </button>
        )}
      </div>

      <div className="navbar__center">
        {dispensing && (
          <span className="navbar__pulse" aria-hidden="true">
            <FontAwesomeIcon icon={faCircle} />
          </span>
        )}
        <span className="navbar__title">{resolvedTitle}</span>
      </div>

      <div className="navbar__right">
        {showSettings && (
          <button
            className="navbar__icon-btn"
            onClick={() => navigate('/settings')}
            aria-label="Open settings"
          >
            <FontAwesomeIcon icon={faGear} />
          </button>
        )}
      </div>
    </nav>
  );
}
