import React, { useState, useEffect, useRef } from 'react';
import { NavLink, Link, useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function Header() {
  const navigate = useNavigate();
  const [notifications, setNotifications] = useState([]);
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef(null);

  // Get current user identifier (phone or user_id)
  const getUserIdentifier = () => {
    try {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.phone) return user.phone;
      if (user.id) return user.id;
      const lastPhone = localStorage.getItem('last_user_phone');
      if (lastPhone) return lastPhone;
    } catch {
      // fallback
    }
    return '+91 98765 43210';
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
  }, []);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false);
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
    setIsOpen(false);
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

        {/* In-App Notification Center */}
        <div className="header-actions" ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            type="button"
            className="btn-icon notification-bell-btn"
            onClick={() => setIsOpen(prev => !prev)}
            aria-label="Notifications"
            title="Notification Center"
          >
            <i className={`bi ${unreadCount > 0 ? 'bi-bell-fill' : 'bi-bell'}`}></i>
            {unreadCount > 0 && (
              <span className="notification-badge">{unreadCount > 9 ? '9+' : unreadCount}</span>
            )}
          </button>

          {/* Notification Dropdown Drawer */}
          {isOpen && (
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
                    style={{ fontSize: '0.78rem', color: 'var(--color-primary)', background: 'none', border: 'none', cursor: 'pointer' }}
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
      </div>
    </header>
  );
}
