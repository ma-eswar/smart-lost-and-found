import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate, useLocation } from 'react-router-dom';
import { api } from '../services/api';
import { useAuth } from './AuthContext';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, isLoggedIn, logout, setShowLoginModal } = useAuth();
  const [notifications, setNotifications] = useState([]);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const notifRef = useRef(null);
  const userMenuRef = useRef(null);

  // Close mobile menu on route change
  useEffect(() => {
    setIsMobileMenuOpen(false);
    setIsNotifOpen(false);
    setIsUserMenuOpen(false);
  }, [location.pathname]);

  // Get current user identifier (phone or user_id)
  const getUserIdentifier = () => {
    if (user?.phone) return user.phone;
    if (user?.id) return user.id;
    try {
      const lastPhone = localStorage.getItem('last_user_phone');
      if (lastPhone) return lastPhone;
    } catch {
      // fallback
    }
    return '';
  };

  const loadNotifications = async () => {
    const ident = getUserIdentifier();
    if (!ident) return;
    try {
      const data = await api.getNotifications(ident);
      setNotifications(Array.isArray(data) ? data : []);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 12000);
    return () => clearInterval(interval);
  }, [user]);

  // Close dropdowns on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (notifRef.current && !notifRef.current.contains(e.target)) {
        setIsNotifOpen(false);
      }
      if (userMenuRef.current && !userMenuRef.current.contains(e.target)) {
        setIsUserMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const handleNotificationClick = async (notif) => {
    try {
      await api.markNotificationRead(notif.id);
      setNotifications(prev => prev.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
    } catch {
      // ignore
    }
    setIsNotifOpen(false);
    if (notif.action_url) {
      navigate(notif.action_url);
    }
  };

  const markAllRead = async () => {
    const unread = notifications.filter(n => !n.is_read);
    await Promise.all(unread.map(n => api.markNotificationRead(n.id).catch(() => {})));
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
  };

  return (
    <header className="app-header">
      <div className="header-container">
        {/* Brand Logo */}
        <Link to="/" className="brand">
          <div className="brand-logo-icon">
            <i className="bi bi-shield-check"></i>
          </div>
          <div className="brand-text-group">
            <span className="brand-title">SafeRecover</span>
            <span className="brand-subtitle">Smart Lost &amp; Found</span>
          </div>
        </Link>
        
        {/* Desktop Navigation */}
        <nav className="main-nav desktop-nav">
          <NavLink to="/" end className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <i className="bi bi-house"></i> Home
          </NavLink>
          <NavLink to="/lost" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <i className="bi bi-search"></i> Report Lost
          </NavLink>
          <NavLink to="/found" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
            <i className="bi bi-box-seam"></i> Report Found
          </NavLink>
          {isLoggedIn && (
            <NavLink to="/status" className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}>
              <i className="bi bi-speedometer2"></i> My Dashboard
            </NavLink>
          )}
        </nav>

        {/* Header Right Actions */}
        <div className="header-right-actions">
          {/* Notification Bell (Only when logged in) */}
          {isLoggedIn && (
            <div className="header-actions" ref={notifRef} style={{ position: 'relative' }}>
              <button
                type="button"
                className="btn-icon notification-bell-btn"
                onClick={() => setIsNotifOpen(prev => !prev)}
                aria-label="Notifications"
                title="Notification Center"
              >
                <i className={`bi ${unreadCount > 0 ? 'bi-bell-fill' : 'bi-bell'}`}></i>
                {unreadCount > 0 && (
                  <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
                )}
              </button>

              {/* Notification Dropdown Drawer */}
              {isNotifOpen && (
                <div className="notification-drawer">
                  <div className="notification-drawer-header">
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <strong>Notifications</strong>
                      {unreadCount > 0 && (
                        <span className="badge badge-neutral" style={{ fontSize: '0.72rem' }}>
                          {unreadCount} unread
                        </span>
                      )}
                    </div>
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        className="btn-text-sm"
                        onClick={markAllRead}
                        style={{ fontSize: '0.78rem', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}
                      >
                        Mark all read
                      </button>
                    )}
                  </div>

                  <div className="notification-drawer-body">
                    {notifications.length === 0 ? (
                      <div className="notification-empty">
                        <i className="bi bi-bell-slash" style={{ fontSize: '1.6rem', color: 'var(--color-slate-400)' }}></i>
                        <p style={{ margin: '0.4rem 0 0 0', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                          No notifications yet
                        </p>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                          Automated match alerts &amp; photo requests appear here
                        </span>
                      </div>
                    ) : (
                      notifications.map((notif) => (
                        <div
                          key={notif.id}
                          className={`notification-item ${notif.is_read ? 'read' : 'unread'}`}
                          onClick={() => handleNotificationClick(notif)}
                        >
                          <div className="notification-item-icon">
                            {notif.type === 'MATCH_FOUND' && <i className="bi bi-radar" style={{ color: 'var(--color-primary)' }}></i>}
                            {notif.type === 'VERIFICATION_PROBE_REQUESTED' && <i className="bi bi-camera" style={{ color: '#d97706' }}></i>}
                            {notif.type !== 'MATCH_FOUND' && notif.type !== 'VERIFICATION_PROBE_REQUESTED' && (
                              <i className="bi bi-info-circle" style={{ color: 'var(--color-emerald)' }}></i>
                            )}
                          </div>
                          <div className="notification-item-content">
                            <div className="notification-item-title">{notif.title}</div>
                            <div className="notification-item-message">{notif.message}</div>
                            <div className="notification-item-time">
                              {new Date(notif.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {new Date(notif.created_at).toLocaleDateString()}
                            </div>
                          </div>
                          {!notif.is_read && <span className="notification-dot"></span>}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* User Profile Pill / Sign In */}
          {isLoggedIn ? (
            <div className="user-profile-menu-wrapper" ref={userMenuRef}>
              <button
                type="button"
                className="user-profile-btn"
                onClick={() => setIsUserMenuOpen(prev => !prev)}
                title="Account Menu"
              >
                <div className="user-avatar-circle">
                  <i className="bi bi-person-fill"></i>
                </div>
                <span className="user-name-text">
                  {user.full_name || user.phone}
                </span>
                <i className={`bi ${isUserMenuOpen ? 'bi-chevron-up' : 'bi-chevron-down'}`} style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}></i>
              </button>

              {/* User Menu Dropdown */}
              {isUserMenuOpen && (
                <div className="user-dropdown-menu">
                  <div className="user-dropdown-header">
                    <div style={{ fontWeight: 700, fontSize: '0.92rem', color: 'var(--text-main)' }}>{user.full_name || 'Verified User'}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)' }}>{user.phone}</div>
                    {user.email && <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email}</div>}
                  </div>
                  <div className="user-dropdown-divider"></div>
                  <Link to="/status" className="user-dropdown-item" onClick={() => setIsUserMenuOpen(false)}>
                    <i className="bi bi-speedometer2"></i> My Dashboard
                  </Link>
                  <Link to="/lost" className="user-dropdown-item" onClick={() => setIsUserMenuOpen(false)}>
                    <i className="bi bi-search"></i> Report Lost Item
                  </Link>
                  <Link to="/found" className="user-dropdown-item" onClick={() => setIsUserMenuOpen(false)}>
                    <i className="bi bi-box-seam"></i> Report Found Item
                  </Link>
                  <div className="user-dropdown-divider"></div>
                  <button type="button" className="user-dropdown-item logout-item" onClick={() => { setIsUserMenuOpen(false); logout(); }}>
                    <i className="bi bi-box-arrow-right"></i> Sign Out
                  </button>
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              className="btn btn-primary btn-sm sign-in-btn"
              onClick={() => setShowLoginModal(true)}
            >
              <i className="bi bi-person-lock"></i> Sign In
            </button>
          )}

          {/* Mobile Hamburger Menu Toggle */}
          <button
            type="button"
            className="mobile-menu-toggle-btn"
            onClick={() => setIsMobileMenuOpen(prev => !prev)}
            aria-label="Toggle navigation"
          >
            <i className={`bi ${isMobileMenuOpen ? 'bi-x-lg' : 'bi-list'}`}></i>
          </button>
        </div>
      </div>

      {/* Mobile Slide-Down Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="mobile-nav-drawer">
          <NavLink to="/" end className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
            <i className="bi bi-house"></i> Home
          </NavLink>
          <NavLink to="/lost" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
            <i className="bi bi-search"></i> Report Lost Item
          </NavLink>
          <NavLink to="/found" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
            <i className="bi bi-box-seam"></i> Report Found Property
          </NavLink>
          {isLoggedIn && (
            <NavLink to="/status" className={({ isActive }) => `mobile-nav-link ${isActive ? 'active' : ''}`} onClick={() => setIsMobileMenuOpen(false)}>
              <i className="bi bi-speedometer2"></i> My Dashboard &amp; Verification
            </NavLink>
          )}
          
          <div className="mobile-nav-footer">
            {isLoggedIn ? (
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{user.full_name || user.phone}</div>
                  <div style={{ fontSize: '0.76rem', color: 'var(--text-muted)' }}>{user.phone}</div>
                </div>
                <button type="button" className="btn btn-outline btn-sm" onClick={() => { setIsMobileMenuOpen(false); logout(); }}>
                  <i className="bi bi-box-arrow-right"></i> Sign Out
                </button>
              </div>
            ) : (
              <button type="button" className="btn btn-primary btn-sm" style={{ width: '100%' }} onClick={() => { setIsMobileMenuOpen(false); setShowLoginModal(true); }}>
                <i className="bi bi-person-lock"></i> Sign In to Account
              </button>
            )}
          </div>
        </div>
      )}
    </header>
  );
}
