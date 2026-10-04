import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';

export default function Admin() {
  const toast = useToast();
  const [pin, setPin] = useState(localStorage.getItem('admin_pin') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState('lost');

  const [lostItems, setLostItems] = useState([]);
  const [foundItems, setFoundItems] = useState([]);
  const [escrowRecords, setEscrowRecords] = useState([]);
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(false);

  // Handover state
  const [handoverCode, setHandoverCode] = useState('');
  const [selectedDesk, setSelectedDesk] = useState('DESK-LIB-02');
  const [officerName, setOfficerName] = useState('Officer Rajesh Kumar');
  const [handoverResult, setHandoverResult] = useState(null);

  // Match Evaluation modal state
  const [evaluatingId, setEvaluatingId] = useState(null);
  const [matchResults, setMatchResults] = useState(null);
  const [evalLoading, setEvalLoading] = useState(false);

  useEffect(() => {
    if (pin) {
      handleLogin(pin);
    }
  }, []);

  const handleLogin = async (pinToTry) => {
    setAuthError('');
    setLoading(true);
    try {
      await api.adminLogin(pinToTry);
      setIsAuthenticated(true);
      localStorage.setItem('admin_pin', pinToTry);
      fetchAdminData(pinToTry);
    } catch (err) {
      setIsAuthenticated(false);
      setAuthError('Invalid Staff PIN. Default is admin123');
    } finally {
      setLoading(false);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('admin_pin');
    setPin('');
    setIsAuthenticated(false);
    toast.info('Logged out from staff terminal.');
  };

  const fetchAdminData = async (currentPin = pin) => {
    setLoading(true);
    try {
      const [lost, found, escrow, deskList] = await Promise.all([
        api.getAdminLostItems(currentPin),
        api.getAdminFoundItems(currentPin),
        api.getAdminEscrowRecords(currentPin),
        api.getDesks()
      ]);
      setLostItems(lost);
      setFoundItems(found);
      setEscrowRecords(escrow);
      setDesks(deskList);
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  };

  const runMatchCheck = async (lostItemId) => {
    setEvaluatingId(lostItemId);
    setEvalLoading(true);
    setMatchResults(null);
    try {
      const res = await api.evaluateMatches(lostItemId, pin);
      setMatchResults(res);
      toast.success(`Matching evaluated: ${res.evaluations?.length || 0} candidate(s) compared.`);
      fetchAdminData();
    } catch (err) {
      toast.error(err);
    } finally {
      setEvalLoading(false);
    }
  };

  const generatePasscode = async (evaluationId) => {
    try {
      const res = await api.generatePasscode(evaluationId, pin);
      toast.success(`Handover Passcode Generated: ${res.handover_passcode}`);
      if (evaluatingId) {
        const updatedResults = await api.getMatchResults(evaluatingId, pin);
        setMatchResults(updatedResults);
      }
    } catch (err) {
      toast.error(err);
    }
  };

  const requestPhotoVerification = async (lostItemId, foundItemId) => {
    try {
      const res = await api.createProbe(lostItemId, foundItemId, 0, pin);
      toast.success(`Photo Verification Request created (Probe ID: ${res.probe_id}).`);
      if (evaluatingId) {
        const updatedResults = await api.getMatchResults(evaluatingId, pin);
        setMatchResults(updatedResults);
      }
    } catch (err) {
      toast.error(err);
    }
  };

  const handleHandoverSubmit = async (e) => {
    e.preventDefault();
    if (!handoverCode || handoverCode.trim().length !== 6) {
      toast.error('Please enter a valid 6-digit pickup passcode');
      return;
    }

    try {
      const res = await api.verifyHandoverPasscode(handoverCode.trim(), selectedDesk, officerName, pin);
      setHandoverResult(res);
      setHandoverCode('');
      toast.success(`Handover verified! Escrow disbursed: ₹${res.escrow_amount || 0}. Record archived.`);
      fetchAdminData();
    } catch (err) {
      toast.error(err);
      setHandoverResult(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="main-content" style={{ maxWidth: '440px' }}>
        <div className="form-card" style={{ textAlign: 'center' }}>
          <div style={{ width: '56px', height: '56px', background: '#eff6ff', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 0.75rem auto' }}>
            <i className="bi bi-shield-lock" style={{ fontSize: '1.8rem', color: 'var(--color-primary)' }}></i>
          </div>
          <h3 style={{ fontSize: '1.5rem', fontWeight: 800 }}>Staff Terminal Access</h3>
          <p className="field-hint" style={{ color: 'var(--text-secondary)' }}>
            Enter your duty officer PIN to unlock the verification engine &amp; handover terminal.
          </p>

          {authError && <div className="toast-card toast-error" style={{ margin: '0.5rem 0' }}>{authError}</div>}

          <form onSubmit={(e) => { e.preventDefault(); handleLogin(pin); }}>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label style={{ textAlign: 'left' }}>Staff Security PIN</label>
              <input
                type="password"
                className="form-control text-center"
                style={{ fontSize: '1.25rem', letterSpacing: '0.2em' }}
                placeholder="Enter PIN (e.g. admin123)"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoFocus
                required
              />
            </div>
            <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={loading}>
              {loading ? <><i className="bi bi-hourglass-split"></i> Authenticating...</> : <><i className="bi bi-unlock"></i> Unlock Staff Terminal</>}
            </button>
          </form>
          <span className="field-hint" style={{ marginTop: '0.5rem' }}>Default test PIN: <code>admin123</code></span>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content" style={{ maxWidth: '1140px' }}>
      {/* 1. Header & Action Bar Alignment */}
      <div className="admin-header-bar">
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="bi bi-person-badge" style={{ color: 'var(--color-primary)' }}></i>
            Staff &amp; Handover Terminal
          </h2>
          <span className="field-hint" style={{ color: 'var(--text-secondary)' }}>
            Verified Partner Desk Operations, 5-Stage Matching Engine &amp; Escrow Releases
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fetchAdminData()} disabled={loading}>
            <i className="bi bi-arrow-clockwise"></i> Refresh
          </button>
          <Link to="/archive" className="btn btn-outline btn-sm">
            <i className="bi bi-archive"></i> Archives
          </Link>
          <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--color-rose)', borderColor: '#fecaca' }} onClick={handleLogout}>
            <i className="bi bi-box-arrow-right"></i> Log Out
          </button>
        </div>
      </div>

      {/* 2. 5 Admin Tabs */}
      <div className="admin-tab-bar">
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'lost' ? 'active' : ''}`}
          onClick={() => setActiveTab('lost')}
        >
          <i className="bi bi-search"></i> Lost Reports ({lostItems.length})
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'found' ? 'active' : ''}`}
          onClick={() => setActiveTab('found')}
        >
          <i className="bi bi-box-seam"></i> Found Items ({foundItems.length})
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'terminal' ? 'active' : ''}`}
          onClick={() => setActiveTab('terminal')}
        >
          <i className="bi bi-key"></i> Handover Terminal
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'escrow' ? 'active' : ''}`}
          onClick={() => setActiveTab('escrow')}
        >
          <i className="bi bi-cash-stack"></i> Rewards Vault ({escrowRecords.length})
        </button>
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'desks' ? 'active' : ''}`}
          onClick={() => setActiveTab('desks')}
        >
          <i className="bi bi-building"></i> Partner Desks ({desks.length})
        </button>
      </div>

      {/* Tab 1: Lost Reports */}
      {activeTab === 'lost' && (
        <div className="admin-table-wrapper" id="admin-lost-list">
          {lostItems.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No active lost reports in registry.
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Report ID</th>
                  <th>Item &amp; Category</th>
                  <th>Location / Landmark</th>
                  <th>Confirmation Details</th>
                  <th>Owner Contact</th>
                  <th>Status</th>
                  <th style={{ textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {lostItems.map((item) => (
                  <tr key={item.id}>
                    <td><code>{item.id}</code></td>
                    <td>
                      <strong>{item.title || item.product_name}</strong>
                      <span className="badge badge-neutral" style={{ display: 'block', width: 'fit-content', marginTop: '0.2rem', fontSize: '0.72rem' }}>
                        {item.category}
                      </span>
                    </td>
                    <td>
                      <div>{item.location_name || item.last_seen_location || 'Not specified'}</div>
                      {item.latitude && item.longitude && (
                        <span className="field-hint">({item.latitude.toFixed(4)}, {item.longitude.toFixed(4)})</span>
                      )}
                    </td>
                    <td>
                      {item.secret_points && item.secret_points.length > 0 ? (
                        <div style={{ maxWidth: '220px' }}>
                          <span className="badge badge-neutral" style={{ fontSize: '0.7rem', marginBottom: '0.2rem' }}>
                            {item.secret_points.length} Detail(s)
                          </span>
                          <div style={{ fontSize: '0.8rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={item.secret_points.map(p => p.point || p).join(' | ')}>
                            {item.secret_points[0].point || item.secret_points[0]}
                          </div>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--text-muted)' }}>—</span>
                      )}
                    </td>
                    <td>
                      <div>{item.contact_phone}</div>
                      <span className="field-hint">{item.claimant_name}</span>
                    </td>
                    <td>
                      <span className={`badge ${
                        item.status === 'ARCHIVED' || item.status === 'RESOLVED' ? 'badge-verified' :
                        item.status === 'MATCHED' ? 'badge-verified' : 'badge-lost'
                      }`}>
                        {item.status}
                      </span>
                    </td>
                    <td style={{ textAlign: 'right' }}>
                      <button
                        type="button"
                        className="btn btn-primary btn-sm"
                        onClick={() => runMatchCheck(item.id)}
                        disabled={evalLoading}
                      >
                        <i className="bi bi-cpu"></i> Match Engine
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 2: Found Items */}
      {activeTab === 'found' && (
        <div className="admin-table-wrapper" id="admin-found-list">
          {foundItems.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No active found items in registry.
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Found ID</th>
                  <th>Item &amp; Category</th>
                  <th>Custody Type</th>
                  <th>Found Location</th>
                  <th>Finder Contact</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {foundItems.map((item) => (
                  <tr key={item.id}>
                    <td><code>{item.id}</code></td>
                    <td>
                      <strong>{item.title || item.object_name}</strong>
                      <span className="badge badge-neutral" style={{ display: 'block', width: 'fit-content', marginTop: '0.2rem', fontSize: '0.72rem' }}>
                        {item.category}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${item.custody_type === 'DESK' || item.submission_type === 'VERIFIED_DESK' ? 'badge-verified' : 'badge-neutral'}`}>
                        {item.custody_type === 'DESK' || item.submission_type === 'VERIFIED_DESK' ? 'Physical Desk' : 'Direct Holding'}
                      </span>
                    </td>
                    <td>{item.location_name || item.found_location || 'Not specified'}</td>
                    <td>
                      <div>{item.finder_phone || 'Anonymous'}</div>
                      {item.finder_upi && <code style={{ fontSize: '0.75rem' }}>UPI: {item.finder_upi}</code>}
                    </td>
                    <td>
                      <span className={`badge ${item.status === 'RESOLVED' ? 'badge-verified' : 'badge-found'}`}>
                        {item.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 3: Handover Terminal */}
      {activeTab === 'terminal' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '1.5rem' }}>
          <div className="form-card">
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
              <i className="bi bi-key" style={{ color: 'var(--color-primary)' }}></i>
              Verify Physical Handover Passcode
            </h3>
            <p className="field-hint" style={{ color: 'var(--text-secondary)' }}>
              When the owner presents their 6-digit passcode at the security desk, verify it here to release escrow rewards and archive records.
            </p>

            <form onSubmit={handleHandoverSubmit}>
              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>6-Digit Pickup Passcode *</label>
                <input
                  type="text"
                  maxLength="6"
                  className="form-control terminal-code-input"
                  placeholder="000000"
                  value={handoverCode}
                  onChange={(e) => setHandoverCode(e.target.value)}
                  style={{ height: '44px' }}
                  required
                />
              </div>

              <div className="form-group" style={{ marginBottom: '1rem' }}>
                <label>Handover Security Desk *</label>
                <select
                  className="form-control form-select"
                  value={selectedDesk}
                  onChange={(e) => setSelectedDesk(e.target.value)}
                  style={{ height: '44px' }}
                >
                  {desks.map((d) => (
                    <option key={d.id} value={d.id}>{d.name} ({d.building_or_zone || d.location})</option>
                  ))}
                </select>
              </div>

              <div className="form-group" style={{ marginBottom: '1.25rem' }}>
                <label>Duty Officer Name *</label>
                <input
                  type="text"
                  className="form-control"
                  value={officerName}
                  onChange={(e) => setOfficerName(e.target.value)}
                  style={{ height: '44px' }}
                  required
                />
              </div>

              <button type="submit" className="btn btn-success" style={{ width: '100%', height: '44px' }}>
                <i className="bi bi-check2-circle"></i> Authenticate Passcode &amp; Disburse Escrow
              </button>
            </form>
          </div>

          <div className="form-card" style={{ justifyContent: 'center' }}>
            {handoverResult ? (
              <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 'var(--radius-sm)', padding: '1.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#166534', fontWeight: 800, marginBottom: '0.75rem' }}>
                  <i className="bi bi-check-circle-fill" style={{ fontSize: '1.5rem' }}></i>
                  <span>Handover Complete &amp; Disbursed</span>
                </div>
                <div className="review-box" style={{ background: '#ffffff', marginBottom: '1rem' }}>
                  <div className="review-row"><span>Item:</span><strong>{handoverResult.lost_title}</strong></div>
                  <div className="review-row"><span>Claimant:</span><span>{handoverResult.claimant_name}</span></div>
                  <div className="review-row"><span>Finder:</span><span>{handoverResult.finder_name}</span></div>
                  <div className="review-row"><span>Escrow Payout:</span><strong style={{ color: 'var(--color-emerald)' }}>₹{handoverResult.escrow_amount}</strong></div>
                  <div className="review-row"><span>Desk:</span><span>{handoverResult.desk_name || selectedDesk}</span></div>
                </div>
                <Link to="/archive" className="btn btn-outline btn-sm" style={{ width: '100%' }}>
                  <i className="bi bi-archive"></i> Open Archived Records
                </Link>
              </div>
            ) : (
              <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
                <i className="bi bi-qr-code-scan" style={{ fontSize: '2.5rem', color: 'var(--color-slate-400)' }}></i>
                <h4 style={{ margin: '0.75rem 0 0.25rem 0', fontWeight: 700 }}>Ready for Verification</h4>
                <p className="field-hint">
                  Enter the 6-digit code shown on claimant's live tracking card to securely release escrow and mark property returned.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Rewards Vault */}
      {activeTab === 'escrow' && (
        <div className="admin-table-wrapper" id="admin-escrow-list">
          {escrowRecords.length === 0 ? (
            <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              No escrow transactions recorded.
            </div>
          ) : (
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Escrow ID</th>
                  <th>Lost Item ID</th>
                  <th>Pledged Amount</th>
                  <th>Status</th>
                  <th>Recipient UPI</th>
                  <th>Created Date</th>
                </tr>
              </thead>
              <tbody>
                {escrowRecords.map((rec) => (
                  <tr key={rec.id}>
                    <td><code>{rec.id}</code></td>
                    <td><code>{rec.lost_item_id}</code></td>
                    <td><strong>₹{rec.amount}</strong></td>
                    <td>
                      <span className={`badge ${rec.status === 'RELEASED' || rec.status === 'DISBURSED' ? 'badge-verified' : 'badge-neutral'}`}>
                        {rec.status}
                      </span>
                    </td>
                    <td><code>{rec.recipient_upi || rec.payout_address || 'Pending'}</code></td>
                    <td className="field-hint">{new Date(rec.created_at).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* Tab 5: Partner Desks */}
      {activeTab === 'desks' && (
        <div className="admin-table-wrapper">
          <table className="admin-table">
            <thead>
              <tr>
                <th>Desk ID</th>
                <th>Facility Name</th>
                <th>Zone / Building</th>
                <th>Officer On Duty</th>
                <th>Operating Hours</th>
                <th>Contact</th>
              </tr>
            </thead>
            <tbody>
              {desks.map((d) => (
                <tr key={d.id}>
                  <td><code>{d.id}</code></td>
                  <td><strong>{d.name}</strong></td>
                  <td>{d.building_or_zone}</td>
                  <td>{d.officer_on_duty}</td>
                  <td><span className="badge badge-neutral">{d.operating_hours}</span></td>
                  <td>{d.contact_phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 5. Candidate Match Card Alignment & Inspector Modal */}
      {matchResults && (
        <div style={{ position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.6)', zIndex: 1050, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1rem' }}>
          <div className="form-card" style={{ maxWidth: '840px', width: '100%', maxHeight: '90vh', overflowY: 'auto', padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-light)', paddingBottom: '0.75rem', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.3rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <i className="bi bi-cpu" style={{ color: 'var(--color-primary)' }}></i>
                Match Engine Evaluation for Report #{evaluatingId}
              </h3>
              <button type="button" className="btn-icon" onClick={() => setMatchResults(null)} style={{ border: 'none' }}>
                <i className="bi bi-x-lg"></i>
              </button>
            </div>

            {(!matchResults.evaluations || matchResults.evaluations.length === 0) ? (
              <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <i className="bi bi-info-circle" style={{ fontSize: '2rem', display: 'block', marginBottom: '0.5rem' }}></i>
                No candidate found item matched above the confidence threshold.
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
                {matchResults.evaluations.map((evalItem) => {
                  const scorePct = (evalItem.composite_score * 100).toFixed(1);
                  return (
                    <div key={evalItem.id} style={{ border: '1px solid var(--border-light)', borderRadius: 'var(--radius-md)', padding: '1.25rem', background: '#fafafa' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                        <div>
                          <h4 style={{ fontSize: '1.15rem', fontWeight: 700, margin: '0 0 0.35rem 0' }}>
                            Found Candidate: {evalItem.found_item?.object_name || evalItem.found_title || evalItem.found_item_id}
                          </h4>
                          <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                            <span className="badge badge-verified" style={{ fontSize: '0.82rem' }}>
                              Composite Confidence: {scorePct}%
                            </span>
                            <span className="badge badge-neutral">
                              Status: {evalItem.verification_status || 'PENDING'}
                            </span>
                          </div>
                        </div>

                        <div>
                          {evalItem.handover_passcode ? (
                            <span className="badge badge-verified" style={{ fontSize: '1rem', padding: '0.4rem 0.8rem' }}>
                              Passcode: {evalItem.handover_passcode}
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="btn btn-success btn-sm"
                              onClick={() => generatePasscode(evalItem.id)}
                            >
                              <i className="bi bi-key"></i> Generate 6-Digit Passcode
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Side-by-Side Photo Comparison with 4/3 Aspect Ratio */}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                        <div>
                          <span className="field-hint" style={{ fontWeight: 600 }}>Found Deposit Photo</span>
                          <img
                            src={evalItem.found_item?.primary_photo || "/uploads/placeholder.jpg"}
                            alt="Found item"
                            className="match-photo-preview"
                          />
                        </div>
                        <div>
                          <span className="field-hint" style={{ fontWeight: 600 }}>Verification / Reference Photo</span>
                          <img
                            src={evalItem.found_item?.additional_photos?.[0] || evalItem.found_item?.primary_photo || "/uploads/placeholder.jpg"}
                            alt="Reference"
                            className="match-photo-preview"
                          />
                        </div>
                      </div>

                      {/* 4-Column Responsive Grid for Breakdown Badges */}
                      <div className="match-breakdown-grid" style={{ marginBottom: '1rem' }}>
                        <div className="review-box" style={{ padding: '0.6rem 0.8rem' }}>
                          <span className="field-hint">Text &amp; Brand</span>
                          <strong>{((evalItem.text_score || evalItem.lexical_score || 0) * 100).toFixed(0)}%</strong>
                        </div>
                        <div className="review-box" style={{ padding: '0.6rem 0.8rem' }}>
                          <span className="field-hint">Geo-Proximity</span>
                          <strong>{evalItem.distance_km ? `${evalItem.distance_km} km` : 'Near'}</strong>
                        </div>
                        <div className="review-box" style={{ padding: '0.6rem 0.8rem' }}>
                          <span className="field-hint">Tier-1 Vision</span>
                          <strong>{((evalItem.visual_score || evalItem.vision_score || 0) * 100).toFixed(0)}%</strong>
                        </div>
                        <div className="review-box" style={{ padding: '0.6rem 0.8rem' }}>
                          <span className="field-hint">Time Delta</span>
                          <strong>{evalItem.time_delta_hours ? `${evalItem.time_delta_hours}h` : '< 24h'}</strong>
                        </div>
                      </div>

                      {/* Actions */}
                      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <button
                          type="button"
                          className="btn btn-outline btn-sm"
                          onClick={() => requestPhotoVerification(evalItem.lost_item_id, evalItem.found_item_id)}
                        >
                          <i className="bi bi-camera"></i> Dispatch Photo Verification Probe
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div style={{ marginTop: '1.5rem', textAlign: 'right' }}>
              <button type="button" className="btn btn-outline" onClick={() => setMatchResults(null)}>
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
