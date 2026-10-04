import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';

const DEMO_HINGE_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='%2318181b'/><line x1='240' y1='80' x2='240' y2='220' stroke='%2352525b' stroke-width='6'/><path d='M250 110 L280 125' stroke='%23ef4444' stroke-width='3'/><text x='200' y='50' fill='%23f43f5e' font-weight='bold' text-anchor='middle'>Right Hinge Verification Photo</text></svg>";

export default function TrackStatus() {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState({ rewards_earned: 0, money_spent: 0, active_lost_count: 0, active_found_count: 0 });
  const [activeTab, setActiveTab] = useState('lost'); // 'lost' | 'found'
  const [copiedCode, setCopiedCode] = useState(false);

  useEffect(() => {
    const q = searchParams.get('q') || localStorage.getItem('last_user_phone');
    if (q) {
      setQuery(q);
      executeSearch(q);
    }
  }, [searchParams]);

  const executeSearch = async (val) => {
    if (!val.trim()) return;
    setLoading(true);
    try {
      const [res, metricRes] = await Promise.all([
        api.lookupStatus(val.trim()),
        api.getUserMetrics(val.trim()).catch(() => ({ rewards_earned: 0, money_spent: 0, active_lost_count: 0, active_found_count: 0 }))
      ]);
      setData(res);
      setMetrics(metricRes);
      localStorage.setItem('last_user_phone', val.trim());
    } catch (err) {
      toast.error(err);
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = (e) => {
    e.preventDefault();
    executeSearch(query);
  };

  const handleRunMatch = async (lostId) => {
    try {
      const res = await api.evaluateMatches(lostId, 'admin123');
      toast.success(`Match check complete! Found ${res.candidate_count || 0} candidate(s).`);
      executeSearch(query);
    } catch (err) {
      toast.error(err);
    }
  };

  const handleProbeSubmit = async (probeId) => {
    try {
      await api.submitProbeResponse(probeId, DEMO_HINGE_PHOTO, 'Clear close-up photo under natural lighting.');
      toast.success('Verification photo submitted! Match confirmed.');
      executeSearch(query);
    } catch (err) {
      toast.error(err);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    toast.success('Pickup code copied to clipboard!');
    setTimeout(() => setCopiedCode(false), 3000);
  };

  const getItemPhase = (status, activePasscode) => {
    if (activePasscode || status === 'MATCHED' || status === 'PASSCODE_ISSUED') {
      return { label: 'Ready for Pickup', class: 'badge-verified', icon: 'bi-check-circle-fill' };
    }
    if (status === 'PROBE_SENT' || status === 'VERIFICATION_PENDING') {
      return { label: 'Photo Verification in Progress', class: 'badge-neutral', icon: 'bi-camera' };
    }
    if (status === 'RESOLVED' || status === 'ARCHIVED') {
      return { label: 'Resolved / Handed Over', class: 'badge-verified', icon: 'bi-archive' };
    }
    return { label: 'Active Search in Progress', class: 'badge-lost', icon: 'bi-radar' };
  };

  return (
    <div className="main-content" style={{ maxWidth: '900px' }}>
      {/* Header Banner */}
      <div style={{ marginBottom: '1.5rem' }}>
        <span className="badge badge-neutral"><i className="bi bi-speedometer2"></i> User Dashboard</span>
        <h1 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>Status &amp; Verification Hub</h1>
        <p className="field-hint" style={{ color: 'var(--text-secondary)' }}>
          Track continuous automated matching, respond to neutral photo challenges, and view physical pickup passcodes.
        </p>
      </div>

      {/* Quick Search Bar */}
      <div className="form-card" style={{ marginBottom: '1.75rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            className="form-control" 
            style={{ flex: 1, minWidth: '240px' }} 
            placeholder="Enter your phone number or report ID (e.g. +91 98765 43210)" 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            required 
          />
          <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }} disabled={loading}>
            {loading ? <><i className="bi bi-hourglass-split"></i> Searching...</> : <><i className="bi bi-search"></i> Search Records</>}
          </button>
        </form>
      </div>

      {/* 1. FINANCIAL OVERVIEW METRIC CARDS */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
        <div className="financial-card financial-card-rewards">
          <div className="financial-icon-wrapper" style={{ background: '#ecfdf5', color: '#059669' }}>
            <i className="bi bi-cash-coin" style={{ fontSize: '1.6rem' }}></i>
          </div>
          <div>
            <span className="financial-label">Escrow Rewards Earned</span>
            <div className="financial-value">₹{metrics.rewards_earned.toLocaleString('en-IN')}</div>
            <span className="financial-sub">Disbursed directly via UPI</span>
          </div>
        </div>

        <div className="financial-card financial-card-spent">
          <div className="financial-icon-wrapper" style={{ background: '#eff6ff', color: '#2563eb' }}>
            <i className="bi bi-shield-check" style={{ fontSize: '1.6rem' }}></i>
          </div>
          <div>
            <span className="financial-label">Reward Escrow Spent</span>
            <div className="financial-value">₹{metrics.money_spent.toLocaleString('en-IN')}</div>
            <span className="financial-sub">Released upon safe item recovery</span>
          </div>
        </div>
      </div>

      {/* Dashboard Listings */}
      {data && (
        <div>
          {/* 2. TAB NAVIGATION */}
          <div className="dashboard-tab-bar">
            <button
              type="button"
              className={`dashboard-tab ${activeTab === 'lost' ? 'active' : ''}`}
              onClick={() => setActiveTab('lost')}
            >
              <i className="bi bi-search"></i> My Lost Reports ({data.lost_items?.length || 0})
            </button>
            <button
              type="button"
              className={`dashboard-tab ${activeTab === 'found' ? 'active' : ''}`}
              onClick={() => setActiveTab('found')}
            >
              <i className="bi bi-box-seam"></i> Items I Found ({data.found_items?.length || 0})
            </button>
          </div>

          {/* MY LOST ITEMS */}
          {activeTab === 'lost' && (
            <div>
              {(!data.lost_items || data.lost_items.length === 0) ? (
                <div className="form-card text-center" style={{ padding: '2.5rem 1rem' }}>
                  <i className="bi bi-search" style={{ fontSize: '2rem', color: 'var(--color-slate-400)' }}></i>
                  <h4 style={{ marginTop: '0.75rem' }}>No Lost Items Found</h4>
                  <p className="text-muted small">No active lost reports registered under this phone number.</p>
                </div>
              ) : (
                data.lost_items.map((item) => {
                  const phase = getItemPhase(item.status, item.active_passcode);
                  return (
                    <div key={item.id} className="form-card listing-card" style={{ marginBottom: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <span className={`badge ${phase.class}`}>
                            <i className={`bi ${phase.icon}`}></i> {phase.label}
                          </span>
                          <h3 style={{ fontSize: '1.3rem', margin: '0.4rem 0 0.2rem 0' }}>{item.product_name}</h3>
                          <span className="field-hint">
                            Report ID: <code>{item.id}</code> • Last Seen: <strong>{item.last_seen_location}</strong>
                            {item.secret_points_count > 0 && ` • ${item.secret_points_count} Confirmation Detail(s) Saved`}
                          </span>
                        </div>
                        {item.status !== 'RESOLVED' && item.status !== 'ARCHIVED' && (
                          <button type="button" className="btn btn-outline btn-sm" onClick={() => handleRunMatch(item.id)}>
                            <i className="bi bi-cpu"></i> Scan for Matches
                          </button>
                        )}
                      </div>

                      {/* Ready for Pickup 6-digit passcode block */}
                      {item.active_passcode && (
                        <div className="pickup-passcode-box">
                          <span className="badge badge-verified">
                            <i className="bi bi-check2-circle"></i> Ready for Physical Handover
                          </span>
                          <div className="passcode-display">
                            <span>{item.active_passcode}</span>
                            <button
                              type="button"
                              className="btn btn-outline btn-sm passcode-copy-btn"
                              onClick={() => copyToClipboard(item.active_passcode)}
                              title="Copy Passcode"
                            >
                              <i className={`bi ${copiedCode ? 'bi-check2' : 'bi-clipboard'}`}></i> {copiedCode ? 'Copied' : 'Copy'}
                            </button>
                          </div>
                          <p className="passcode-instructions">
                            Present this confidential 6-digit code to the duty officer at the campus security desk to complete verification and claim your item.
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ITEMS I FOUND */}
          {activeTab === 'found' && (
            <div>
              {(!data.found_items || data.found_items.length === 0) ? (
                <div className="form-card text-center" style={{ padding: '2.5rem 1rem' }}>
                  <i className="bi bi-box-seam" style={{ fontSize: '2rem', color: 'var(--color-slate-400)' }}></i>
                  <h4 style={{ marginTop: '0.75rem' }}>No Found Items Found</h4>
                  <p className="text-muted small">You have not registered any found property with this number.</p>
                </div>
              ) : (
                data.found_items.map((item) => {
                  const pendingProbe = item.pending_probes && item.pending_probes.find(p => p.probe_status === 'PENDING_RESPONSE');
                  return (
                    <div key={item.id} className="form-card listing-card" style={{ marginBottom: '1.25rem' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem' }}>
                        <div>
                          <span className={`badge ${item.status === 'RESOLVED' ? 'badge-verified' : 'badge-found'}`}>
                            <i className="bi bi-box-seam"></i> {item.status}
                          </span>
                          <h3 style={{ fontSize: '1.3rem', margin: '0.4rem 0 0.2rem 0' }}>{item.object_name}</h3>
                          <span className="field-hint">
                            Deposit ID: <code>{item.id}</code> • Found At: {item.found_location} • Reward UPI: <code>{item.finder_upi_id}</code>
                          </span>
                        </div>
                      </div>

                      {/* 3. PHOTO CHALLENGE ACTION */}
                      {pendingProbe && (
                        <div className="photo-probe-challenge-box">
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#92400e', fontWeight: 700 }}>
                            <i className="bi bi-camera-fill" style={{ fontSize: '1.2rem' }}></i>
                            <span>Close-Up Photo Verification Challenge</span>
                          </div>
                          <p style={{ margin: '0.5rem 0', color: '#78350f', fontSize: '0.96rem', fontWeight: 600 }}>
                            "{pendingProbe.neutral_prompt}"
                          </p>
                          <span className="field-hint" style={{ color: '#b45309', display: 'block', marginBottom: '0.75rem' }}>
                            Target Zone: <strong>{pendingProbe.target_area}</strong> (The owner's secret markings are never revealed).
                          </span>
                          <button
                            type="button"
                            className="btn btn-primary btn-sm"
                            onClick={() => handleProbeSubmit(pendingProbe.id)}
                          >
                            <i className="bi bi-upload"></i> Submit Verification Photo
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
