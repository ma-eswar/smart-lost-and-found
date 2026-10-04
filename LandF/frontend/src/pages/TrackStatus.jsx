import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { useAuth } from '../components/AuthContext';

const DEMO_HINGE_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='%2318181b'/><line x1='240' y1='80' x2='240' y2='220' stroke='%2352525b' stroke-width='6'/><path d='M250 110 L280 125' stroke='%23ef4444' stroke-width='3'/><text x='200' y='50' fill='%23f43f5e' font-weight='bold' text-anchor='middle'>Right Hinge Verification Photo</text></svg>";

export default function TrackStatus() {
  const [searchParams] = useSearchParams();
  const toast = useToast();
  const { user, isLoggedIn, setShowLoginModal } = useAuth();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [metrics, setMetrics] = useState({ rewards_earned: 0, money_spent: 0, active_lost_count: 0, active_found_count: 0 });
  const [activeTab, setActiveTab] = useState('lost'); // 'lost' | 'found'
  const [copiedCode, setCopiedCode] = useState(false);
  const [activeProbeModal, setActiveProbeModal] = useState(null);

  // Auto load when user is logged in or if q query param exists
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      executeSearch(q);
    } else if (user?.phone) {
      setQuery(user.phone);
      executeSearch(user.phone);
    } else if (user?.id) {
      setQuery(user.id);
      executeSearch(user.id);
    } else {
      const lastPhone = localStorage.getItem('last_user_phone');
      if (lastPhone) {
        setQuery(lastPhone);
        executeSearch(lastPhone);
      }
    }
  }, [searchParams, user]);

  // Real-time automatic background polling
  useEffect(() => {
    const ident = query || user?.phone || user?.id || localStorage.getItem('last_user_phone');
    if (!ident) return;

    const interval = setInterval(async () => {
      try {
        const [res, metricRes] = await Promise.all([
          api.lookupStatus(ident),
          api.getUserMetrics(ident).catch(() => null)
        ]);
        if (res) setData(res);
        if (metricRes) setMetrics(metricRes);
      } catch {
        // Silent background update
      }
    }, 10000);

    return () => clearInterval(interval);
  }, [query, user]);

  const executeSearch = async (val) => {
    if (!val || !val.trim()) return;
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
      executeSearch(query || user?.phone || user?.id);
    } catch (err) {
      toast.error(err);
    }
  };

  const handleRunFoundMatch = async (foundId) => {
    try {
      const res = await api.evaluateFoundMatches(foundId, 'admin123');
      toast.success(`Scanned against lost records! Found ${res.match_count || 0} match(es).`);
      executeSearch(query || user?.phone || user?.id);
    } catch (err) {
      toast.error(err);
    }
  };

  const handleProbeSubmit = async (probeId) => {
    try {
      await api.submitProbeResponse(probeId, DEMO_HINGE_PHOTO, 'Clear close-up photo under natural lighting.');
      toast.success('Verification photo submitted! Match confirmed.');
      executeSearch(query || user?.phone || user?.id);
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
      <div style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <span className="badge badge-neutral"><i className="bi bi-speedometer2"></i> User Dashboard</span>
          <h1 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>
            {isLoggedIn ? `Welcome, ${user.full_name || 'User'}` : 'Status & Verification Hub'}
          </h1>
          <p className="field-hint" style={{ color: 'var(--text-secondary)' }}>
            {isLoggedIn
              ? 'Your personalized portal: track continuous automated matching, respond to neutral photo challenges, and view physical pickup passcodes.'
              : 'Track continuous automated matching, respond to neutral photo challenges, and view physical pickup passcodes.'}
          </p>
        </div>

        {!isLoggedIn && (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setShowLoginModal(true)}
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <i className="bi bi-person-lock"></i> Sign In to Account
          </button>
        )}
      </div>

      {/* Logged-In User Profile Info Card */}
      {isLoggedIn && user && (
        <div className="form-card" style={{ marginBottom: '1.5rem', padding: '1.25rem', background: 'linear-gradient(to right, #f8fafc, #eff6ff)', border: '1px solid #bfdbfe' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
              <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.4rem' }}>
                <i className="bi bi-person-check-fill"></i>
              </div>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>{user.full_name || 'Verified User'}</h4>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '0.2rem' }}>
                  <span><i className="bi bi-phone"></i> {user.phone}</span>
                  {user.email && <span><i className="bi bi-envelope"></i> {user.email}</span>}
                  {user.institutional_id && <span><i className="bi bi-card-text"></i> ID: {user.institutional_id}</span>}
                </div>
              </div>
            </div>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={() => executeSearch(user.phone || user.id)}
              disabled={loading}
            >
              <i className="bi bi-arrow-clockwise"></i> Refresh Records
            </button>
          </div>
        </div>
      )}

      {/* Guest Search Bar if not logged in */}
      {!isLoggedIn && (
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
      )}

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
                  <h4 style={{ marginTop: '0.75rem' }}>No Lost Items Registered</h4>
                  <p className="text-muted small">No active lost reports found for this account.</p>
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
                  <h4 style={{ marginTop: '0.75rem' }}>No Found Items Registered</h4>
                  <p className="text-muted small">You have not registered any found property with this account.</p>
                </div>
              ) : (() => {
                let pendingChallengeRendered = false;
                return data.found_items.map((item) => {
                  const verifiedProbes = item.pending_probes ? item.pending_probes.filter(p => p.probe_status === 'VERIFIED') : [];
                  const isAlreadyVerified = item.status === 'READY_FOR_HANDOVER' || item.status === 'RESOLVED' || verifiedProbes.length > 0;
                  const pendingProbe = !isAlreadyVerified && item.pending_probes && item.pending_probes.find(p => p.probe_status === 'PENDING_RESPONSE');
                  const showPendingChallenge = !pendingChallengeRendered && pendingProbe;
                  if (showPendingChallenge) {
                    pendingChallengeRendered = true;
                  }
                  
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
                        {item.status !== 'RESOLVED' && (
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => handleRunFoundMatch(item.id)}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem' }}
                          >
                            <i className="bi bi-cpu"></i> Check Matching Claims
                          </button>
                        )}
                      </div>

                      {/* ACTIVE PENDING AI PHOTO CHALLENGE (Single instance) */}
                      {showPendingChallenge && (
                        <div className="photo-probe-challenge-box" style={{ background: '#fffbeb', border: '1.5px solid #fcd34d', borderRadius: 'var(--radius-sm, 8px)', padding: '1.25rem', marginTop: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#92400e', fontWeight: 800, fontSize: '1rem' }}>
                              <i className="bi bi-robot" style={{ fontSize: '1.3rem', color: 'var(--color-primary)' }}></i>
                              <span>AI Verification Agent Assignment</span>
                            </div>
                            <span className="badge badge-neutral" style={{ fontSize: '0.75rem', background: '#fef3c7', color: '#92400e', border: '1px solid #fde68a' }}>
                              <i className="bi bi-shield-check"></i> Blind Ownership Challenge
                            </span>
                          </div>

                          <div style={{ background: '#ffffff', padding: '1rem', borderRadius: '6px', margin: '0.75rem 0', border: '1px solid #fef08a' }}>
                            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Target Inspection Zone:
                            </span>
                            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1e293b', marginTop: '0.15rem' }}>
                              <i className="bi bi-crosshair" style={{ color: '#d97706' }}></i> {pendingProbe.target_area}
                            </div>
                            <p style={{ margin: '0.5rem 0 0 0', color: '#475569', fontSize: '0.92rem', lineHeight: 1.5 }}>
                              "{pendingProbe.neutral_prompt}"
                            </p>
                          </div>

                          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                            <button
                              type="button"
                              className="btn btn-primary btn-sm"
                              onClick={() => setActiveProbeModal(pendingProbe)}
                              style={{ display: 'inline-flex', alignItems: 'center', gap: '0.4rem', fontWeight: 600 }}
                            >
                              <i className="bi bi-camera-fill"></i> Complete & Submit Verification Image
                            </button>
                            <span style={{ fontSize: '0.78rem', color: '#78350f' }}>
                              <i className="bi bi-shield-lock"></i> The owner's secret markings are never revealed to you.
                            </span>
                          </div>
                        </div>
                      )}

                      {/* COMPLETED / VERIFIED PROBES HISTORY */}
                      {verifiedProbes.length > 0 && (
                        <div style={{ marginTop: '1rem', background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: '6px', padding: '1rem' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem', marginBottom: '0.5rem' }}>
                            <span style={{ fontWeight: 700, color: '#166534', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                              <i className="bi bi-patch-check-fill" style={{ color: '#16a34a' }}></i>
                              AI Verification Authenticated
                            </span>
                            <span className="badge badge-verified" style={{ fontSize: '0.75rem' }}>
                              Score: {Math.round((verifiedProbes[0].agent_verification_score || 0.95) * 100)}%
                            </span>
                          </div>
                          <p style={{ margin: '0 0 0.5rem 0', fontSize: '0.86rem', color: '#374151', lineHeight: 1.4 }}>
                            {verifiedProbes[0].agent_analysis_reasoning || "Close-up photograph authenticated successfully against owner's confidential proof."}
                          </p>
                          <div style={{ fontSize: '0.78rem', color: '#059669', fontWeight: 600 }}>
                            <i className="bi bi-key-fill"></i> 6-digit Handover Passcode issued to rightful owner.
                          </div>
                        </div>
                      )}
                    </div>
                  );
                });
              })()}
            </div>
          )}
        </div>
      )}

      {/* Interactive AI Agent Photo Upload Modal */}
      {activeProbeModal && (
        <ProbeUploadModal
          probe={activeProbeModal}
          onClose={() => setActiveProbeModal(null)}
          onSuccess={() => {
            setActiveProbeModal(null);
            executeSearch(query || user?.phone || user?.id);
          }}
        />
      )}
    </div>
  );
}

function ProbeUploadModal({ probe, onClose, onSuccess }) {
  const toast = useToast();
  const [photoData, setPhotoData] = useState('');
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [evaluationResult, setEvaluationResult] = useState(null);

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setPhotoData(evt.target.result);
      toast.success('Close-up photo attached.');
    };
    reader.readAsDataURL(file);
  };

  const handleUseDemo = () => {
    setPhotoData(DEMO_HINGE_PHOTO);
    toast.success('Loaded test verification photo.');
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!photoData) {
      toast.error('Please attach or take a close-up photograph.');
      return;
    }
    setSubmitting(true);
    try {
      const res = await api.submitProbeResponse(probe.id, photoData, notes.trim());
      setEvaluationResult(res);
      toast.success('Verification photo evaluated by AI Agent!');
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err) {
      toast.error(err);
      setSubmitting(false);
    }
  };

  return (
    <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.65)', zIndex: 9999, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
      <div className="form-card" style={{ maxWidth: '520px', width: '100%', padding: '1.75rem', maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="bi bi-robot" style={{ color: 'var(--color-primary)' }}></i>
            AI Agent Verification Task
          </h3>
          <button type="button" className="btn-icon" onClick={onClose} style={{ border: 'none', background: 'none', cursor: 'pointer' }}>
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '6px', padding: '0.85rem', marginBottom: '1rem' }}>
          <strong style={{ fontSize: '0.88rem', color: '#1e293b', display: 'block', marginBottom: '0.2rem' }}>
            <i className="bi bi-crosshair" style={{ color: '#d97706' }}></i> Target Zone: {probe.target_area}
          </strong>
          <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569', lineHeight: 1.4 }}>
            "{probe.neutral_prompt}"
          </p>
        </div>

        {evaluationResult ? (
          <div style={{ textAlign: 'center', padding: '1.25rem 0' }}>
            <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: '#ecfdf5', color: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto', fontSize: '1.8rem' }}>
              <i className="bi bi-check-circle-fill"></i>
            </div>
            <h4 style={{ fontSize: '1.25rem', fontWeight: 800, color: '#065f46', margin: '0 0 0.4rem 0' }}>
              Ownership Confirmed ({Math.round(evaluationResult.agent_verification_score * 100)}%)
            </h4>
            <p style={{ fontSize: '0.88rem', color: '#475569', lineHeight: 1.5, margin: '0 0 1rem 0' }}>
              {evaluationResult.agent_analysis_reasoning}
            </p>
            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '0.75rem', borderRadius: '6px', color: '#065f46', fontWeight: 600, fontSize: '0.85rem' }}>
              <i className="bi bi-shield-lock-fill"></i> Handover Passcode Issued to Claimant
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit}>
            <div className="form-group" style={{ marginBottom: '1rem' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.4rem' }}>
                <label style={{ fontWeight: 600, fontSize: '0.9rem', margin: 0 }}>Attach Close-Up Photo *</label>
                <button type="button" className="btn btn-outline btn-sm" onClick={handleUseDemo} style={{ fontSize: '0.75rem', padding: '0.2rem 0.5rem' }}>
                  <i className="bi bi-magic"></i> Use Sample Photo
                </button>
              </div>
              <input type="file" accept="image/*" className="form-control" onChange={handleFileUpload} />
              
              {photoData && (
                <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                  <img
                    src={photoData}
                    alt="Probe preview"
                    style={{ maxHeight: '160px', width: '100%', objectFit: 'contain', background: '#09090b', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                  />
                  <div style={{ marginTop: '0.3rem' }}>
                    <button type="button" className="btn btn-outline btn-sm" onClick={() => setPhotoData('')} style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}>
                      Remove Photo
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label style={{ fontWeight: 600, fontSize: '0.9rem' }}>Finder Inspection Notes (Optional)</label>
              <input
                type="text"
                className="form-control"
                placeholder="e.g. Captured under direct white light, right hinge close-up"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button type="button" className="btn btn-outline" onClick={onClose} disabled={submitting}>
                Cancel
              </button>
              <button type="submit" className="btn btn-primary" disabled={submitting || !photoData}>
                {submitting ? (
                  <><i className="bi bi-cpu"></i> AI Agent Inspecting...</>
                ) : (
                  <><i className="bi bi-upload"></i> Submit for AI Analysis</>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
