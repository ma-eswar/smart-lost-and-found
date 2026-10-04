import React from 'react';
import { NavLink, Link } from 'react-router-dom';

export default function Header() {
  return (
    <header className="app-header">
      <div className="header-container">
        <Link to="/" className="brand">
          <span className="brand-badge"><i className="bi bi-shield-check"></i> SAFE RECOVER</span>
          <span>Lost &amp; Found Portal</span>
        </Link>
        <nav className="main-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <i className="bi bi-house"></i> Home
          </NavLink>
          <NavLink to="/lost" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <i className="bi bi-search"></i> Report Lost
          </NavLink>
          <NavLink to="/found" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <i className="bi bi-box-seam"></i> Report Found
          </NavLink>
          <NavLink to="/status" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <i className="bi bi-clock-history"></i> Track Status
          </NavLink>
          <NavLink to="/admin" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <i className="bi bi-person-badge"></i> Staff Portal
          </NavLink>
          <NavLink to="/archive" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <i className="bi bi-archive"></i> Archive
          </NavLink>
        </nav>
      </div>
    </header>
  );
}
