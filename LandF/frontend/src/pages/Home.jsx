import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function Home() {
  const [desks, setDesks] = useState([]);
  const [quickQuery, setQuickQuery] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.getDesks().then(setDesks).catch(console.error);
  }, []);

  const handleQuickTrack = (e) => {
    e.preventDefault();
    if (quickQuery.trim()) {
      navigate(`/status?q=${encodeURIComponent(quickQuery.trim())}`);
    }
  };

  return (
    <div className="main-content">
      <div style={{ textAlign: 'center', margin: '2rem 0 3rem 0' }}>
        <h1 style={{ fontSize: '2.4rem', fontWeight: 800, letterSpacing: '-0.03em' }}>
          Recover What You Lost. Return What You Found.
        </h1>
        <p style={{ color: 'var(--text-secondary)', maxWidth: '600px', margin: '0.75rem auto', fontSize: '1.05rem' }}>
          An automated campus portal that cross-references lost reports with found property and coordinates safe physical returns through verified security desks.
        </p>
      </div>

      {/* Main Two Action Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem', marginBottom: '3rem' }}>
        <div className="form-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/lost')}>
          <div style={{ fontSize: '2.2rem', color: '#dc2626' }}><i className="bi bi-search"></i></div>
          <h3>I Lost Something</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', flexGrow: 1 }}>
            File a report with item details and confidential confirmation questions. When a matching item is registered, we verify ownership for safe collection.
          </p>
          <button className="btn btn-primary" style={{ width: '100%' }}>
            Report Lost Item <i className="bi bi-arrow-right"></i>
          </button>
        </div>

        <div className="form-card" style={{ cursor: 'pointer' }} onClick={() => navigate('/found')}>
          <div style={{ fontSize: '2.2rem', color: '#059669' }}><i className="bi bi-box-seam"></i></div>
          <h3>I Found Something</h3>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', flexGrow: 1 }}>
            Drop the item at an official campus security desk or keep it with you until the true owner is verified. Cash rewards transfer directly via UPI.
          </p>
          <button className="btn btn-primary" style={{ width: '100%' }}>
            Report Found Item <i className="bi bi-arrow-right"></i>
          </button>
        </div>
      </div>

      {/* Quick Status Tracking Box */}
      <div className="form-card" style={{ marginBottom: '3rem' }}>
        <h3 style={{ fontSize: '1.1rem' }}><i className="bi bi-clock-history"></i> Check Existing Report Status</h3>
        <p className="field-hint">Enter your phone number or report ID to check live verification status or view your 6-digit pickup code.</p>
        <form onSubmit={handleQuickTrack} style={{ display: 'flex', gap: '0.75rem', marginTop: '0.5rem', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            className="form-control" 
            style={{ flex: 1, minWidth: '240px' }}
            placeholder="Enter phone number or ID (e.g. +91 98765 43210)" 
            value={quickQuery}
            onChange={(e) => setQuickQuery(e.target.value)}
            required 
          />
          <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
            <i className="bi bi-arrow-right-circle"></i> Check
          </button>
        </form>
      </div>

      {/* Verified Campus Desks */}
      <div>
        <h3 style={{ fontSize: '1.2rem', marginBottom: '1rem' }}><i className="bi bi-building"></i> Official Custody &amp; Handover Desks</h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '1rem' }}>
          {desks.map(d => (
            <div key={d.id} className="form-card" style={{ padding: '1.25rem' }}>
              <span className="badge badge-verified" style={{ width: 'fit-content' }}>Official Partner Desk</span>
              <strong style={{ marginTop: '0.3rem' }}>{d.name}</strong>
              <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{d.building_or_zone} • {d.address}</span>
              <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}><i className="bi bi-clock"></i> {d.operating_hours}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
