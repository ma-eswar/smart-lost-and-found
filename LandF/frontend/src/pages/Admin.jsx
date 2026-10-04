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
  const [pendingApprovals, setPendingApprovals] = useState([]);
  const [loading, setLoading] = useState(false);
  const [decidingId, setDecidingId] = useState(null);

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

  const fetchAdminData = async (currentPin) => {
    const activePin = currentPin || pin || localStorage.getItem('admin_pin') || 'admin123';
    setLoading(true);
    try {
      const [lost, found, escrow, deskList, approvals] = await Promise.all([
        api.getAdminLostItems(activePin),
        api.getAdminFoundItems(activePin),
        api.getAdminEscrowRecords(activePin),
        api.getDesks(),
        api.getPendingApprovals(activePin).catch(() => [])
      ]);
      setLostItems(lost);
      setFoundItems(found);
      setEscrowRecords(escrow);
      setDesks(deskList);
      setPendingApprovals(approvals || []);
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleDecideApproval = async (evalId, decision) => {
    setDecidingId(evalId);
    const activePin = pin || localStorage.getItem('admin_pin') || 'admin123';
    try {
      const res = await api.decideApproval(evalId, decision, '', activePin);
      if (decision === 'APPROVED') {
        toast.success(`Handover Authorized! 6-digit passcode: ${res.passcode} issued to owner.`);
      } else {
        toast.info(`Match verification marked as ${decision}.`);
      }
      fetchAdminData(activePin);
    } catch (err) {
      toast.error(err);
    } finally {
      setDecidingId(null);
    }
  };

  const runMatchCheck = async (lostItemId) => {
    setEvaluatingId(lostItemId);
    setEvalLoading(true);
    setMatchResults(null);
    const activePin = pin || localStorage.getItem('admin_pin') || 'admin123';
    try {
      const res = await api.evaluateMatches(lostItemId, activePin);
      const candidateList = res.candidates || res.evaluations || [];
      setMatchResults({ ...res, evaluations: candidateList });
      toast.success(`Matching evaluated: ${candidateList.length} candidate(s) compared.`);
      fetchAdminData(activePin);
    } catch (err) {
      toast.error(err);
    } finally {
      setEvalLoading(false);
    }
  };

  const generatePasscode = async (evaluationId) => {
    const activePin = pin || localStorage.getItem('admin_pin') || 'admin123';
    try {
      const res = await api.generatePasscode(evaluationId, activePin);
      toast.success(`Handover Passcode Generated: ${res.handover_passcode}`);
      if (evaluatingId) {
        const updatedResults = await api.getMatchResults(evaluatingId, activePin);
        const candidateList = updatedResults.candidates || updatedResults.evaluations || [];
        setMatchResults({ ...updatedResults, evaluations: candidateList });
      }
      fetchAdminData(activePin);
    } catch (err) {
      toast.error(err);
    }
  };

  const requestPhotoVerification = async (lostItemId, foundItemId) => {
    const activePin = pin || localStorage.getItem('admin_pin') || 'admin123';
    try {
      const res = await api.createProbe(lostItemId, foundItemId, 0, activePin);
      toast.success(`Photo Verification Request created (Probe ID: ${res.probe_id}).`);
      if (evaluatingId) {
        const updatedResults = await api.getMatchResults(evaluatingId, activePin);
        const candidateList = updatedResults.candidates || updatedResults.evaluations || [];
        setMatchResults({ ...updatedResults, evaluations: candidateList });
      }
      fetchAdminData(activePin);
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

    const activePin = pin || localStorage.getItem('admin_pin') || 'admin123';
    try {
      const res = await api.verifyHandoverPasscode(handoverCode.trim(), selectedDesk, officerName, activePin);
      setHandoverResult(res);
      setHandoverCode('');
      fetchAdminData(activePin);
    } catch (err) {
      toast.error(err);
      setHandoverResult(null);
    }
  };

  const handleClearDemoData = async () => {
    if (!window.confirm('Are you sure you want to remove all demo users and mock state records from the database?')) {
      return;
    }
    const activePin = pin || localStorage.getItem('admin_pin') || 'admin123';
    try {
      setLoading(true);
      await api.clearDemoData(activePin);
      toast.success('All demo users and mock states have been removed from database.');
      await fetchAdminData(activePin);
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSeedDemoData = async () => {
    const activePin = pin || localStorage.getItem('admin_pin') || 'admin123';
    try {
      setLoading(true);
      const res = await api.seedDemo(activePin);
      toast.success(res.message || 'Rich demo dataset loaded successfully.');
      await fetchAdminData(activePin);
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
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
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={() => fetchAdminData()} disabled={loading}>
            <i className="bi bi-arrow-clockwise"></i> Refresh
          </button>
          <button type="button" className="btn btn-outline btn-sm" style={{ color: '#0284c7', borderColor: '#bae6fd' }} onClick={handleSeedDemoData} disabled={loading} title="Populate rich multi-category demo dataset (MacBook, Wallet, Headphones, Backpack)">
            <i className="bi bi-database-add"></i> Seed Rich Demo Data
          </button>
          <button type="button" className="btn btn-outline btn-sm" style={{ color: '#d97706', borderColor: '#fde68a' }} onClick={handleClearDemoData} disabled={loading} title="Remove demo mock records and demo users">
            <i className="bi bi-trash3"></i> Clear Demo Data
          </button>
          <Link to="/archive" className="btn btn-outline btn-sm">
            <i className="bi bi-archive"></i> Archives
          </Link>
          <button type="button" className="btn btn-outline btn-sm" style={{ color: 'var(--color-rose)', borderColor: '#fecaca' }} onClick={handleLogout}>
            <i className="bi bi-box-arrow-right"></i> Log Out
          </button>
        </div>
      </div>

      {/* 2. 6 Admin Tabs */}
      <div className="admin-tab-bar">
        <button
          type="button"
          className={`admin-tab-btn ${activeTab === 'approvals' ? 'active' : ''}`}
          onClick={() => setActiveTab('approvals')}
          style={{
            background: activeTab === 'approvals' ? undefined : (pendingApprovals.filter(a => a.admin_decision !== 'APPROVED').length > 0 ? '#fef3c7' : undefined),
            color: activeTab === 'approvals' ? undefined : (pendingApprovals.filter(a => a.admin_decision !== 'APPROVED').length > 0 ? '#92400e' : undefined),
            fontWeight: 700
          }}
        >
          <i className="bi bi-patch-check-fill"></i> Final Approvals ({pendingApprovals.filter(a => a.admin_decision !== 'APPROVED').length})
        </button>
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

      {/* Tab 0: Final Handover Approvals (Admin Verification Sign-Off) */}
      {activeTab === 'approvals' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div className="form-card" style={{ background: 'linear-gradient(to right, #f8fafc, #eff6ff)', border: '1px solid #bfdbfe', padding: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: '42px', height: '42px', borderRadius: '50%', background: 'var(--color-primary)', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '1.3rem' }}>
                <i className="bi bi-shield-check"></i>
              </div>
              <div>
                <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 800 }}>Admin Final Verification Sign-Off</h3>
                <p style={{ margin: '0.15rem 0 0 0', fontSize: '0.84rem', color: 'var(--text-secondary)' }}>
                  Review comprehensive dossiers of claimant and founder identities, secret owner proofs, and AI Agent vision verification work before authorizing physical release.
                </p>
              </div>
            </div>
          </div>

          {pendingApprovals.length === 0 ? (
            <div className="form-card text-center" style={{ padding: '3rem 1rem' }}>
              <i className="bi bi-patch-check" style={{ fontSize: '2.5rem', color: 'var(--color-slate-400)' }}></i>
              <h4 style={{ marginTop: '0.75rem', fontWeight: 700 }}>No Pending Approvals</h4>
              <p className="text-muted small">All candidate matches are currently signed off or in search progress.</p>
            </div>
          ) : (
            pendingApprovals.map((appr) => {
              const isApproved = appr.admin_decision === 'APPROVED';
              const isRejected = appr.admin_decision === 'REJECTED';
              const probe = appr.probe;
              const hasPhoto = probe && probe.finder_response_photo;

              return (
                <div
                  key={appr.evaluation_id}
                  className="form-card listing-card"
                  style={{
                    border: isApproved ? '2px solid #86efac' : isRejected ? '1.5px solid #fca5a5' : '1.5px solid #fcd34d',
                    background: isApproved ? '#fafffa' : '#ffffff',
                    padding: '1.5rem'
                  }}
                >
                  {/* Top Summary Banner */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', paddingBottom: '1rem', borderBottom: '1px solid #e2e8f0', marginBottom: '1.25rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                        <span className={`badge ${isApproved ? 'badge-verified' : isRejected ? 'badge-lost' : 'badge-neutral'}`} style={{ fontSize: '0.82rem' }}>
                          <i className={`bi ${isApproved ? 'bi-check-circle-fill' : isRejected ? 'bi-x-circle-fill' : 'bi-hourglass-split'}`}></i>
                          {isApproved ? 'Admin Approved & Authorized' : isRejected ? 'Rejected by Admin' : 'Pending Admin Sign-Off'}
                        </span>
                        <span className="badge badge-verified" style={{ fontSize: '0.82rem' }}>
                          <i className="bi bi-cpu"></i> Match Confidence: {Math.round(appr.scores.composite_score * 100)}%
                        </span>
                      </div>
                      <h3 style={{ fontSize: '1.35rem', margin: '0.4rem 0 0.15rem 0', fontWeight: 800 }}>
                        {appr.lost_item.product_name} <span style={{ color: '#94a3b8' }}>⟷</span> {appr.found_item.object_name}
                      </h3>
                      <span className="field-hint">
                        Evaluation ID: <code>{appr.evaluation_id}</code> • Lost Report: <code>{appr.lost_item.id}</code> • Deposit: <code>{appr.found_item.id}</code>
                      </span>
                    </div>

                    <div>
                      {isApproved ? (
                        <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '0.5rem 0.85rem', textAlign: 'right' }}>
                          <span style={{ fontSize: '0.75rem', color: '#065f46', textTransform: 'uppercase', fontWeight: 700, display: 'block' }}>Release Passcode</span>
                          <strong style={{ fontSize: '1.2rem', color: '#047857', letterSpacing: '0.1em' }}>{appr.active_passcode || '123456'}</strong>
                        </div>
                      ) : (
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                          <button
                            type="button"
                            className="btn btn-success btn-sm"
                            onClick={() => handleDecideApproval(appr.evaluation_id, 'APPROVED')}
                            disabled={decidingId === appr.evaluation_id}
                            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontWeight: 700 }}
                          >
                            <i className="bi bi-check-circle-fill"></i> Approve &amp; Release Passcode
                          </button>
                          <button
                            type="button"
                            className="btn btn-outline btn-sm"
                            onClick={() => handleDecideApproval(appr.evaluation_id, 'REJECTED')}
                            disabled={decidingId === appr.evaluation_id}
                            style={{ color: 'var(--color-rose)', borderColor: '#fca5a5' }}
                          >
                            <i className="bi bi-x-circle"></i> Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 3-Column Dossier Grid */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '1.25rem' }}>
                    {/* Column 1: Owner / Claimant Dossier */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#1e293b', fontWeight: 800, marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                        <i className="bi bi-person-fill" style={{ color: 'var(--color-primary)' }}></i>
                        <span>1. Claimant (Owner) Dossier</span>
                      </div>

                      <div style={{ fontSize: '0.86rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', color: '#334155' }}>
                        <div><strong>Claimant Name:</strong> {appr.lost_item.owner_name}</div>
                        <div><strong>Phone:</strong> {appr.lost_item.owner_phone}</div>
                        <div><strong>Email:</strong> {appr.lost_item.owner_email}</div>
                        <div><strong>Address:</strong> {appr.lost_item.residential_address}</div>
                        <div><strong>Govt ID Last 4:</strong> <code>XXXX-XXXX-{appr.lost_item.govt_id_last4}</code></div>
                        <div><strong>Last Seen:</strong> {appr.lost_item.last_seen_location}</div>
                        {appr.lost_item.reward_amount > 0 && (
                          <div><strong>Pledged Reward:</strong> <span style={{ color: '#059669', fontWeight: 700 }}>₹{appr.lost_item.reward_amount}</span></div>
                        )}
                      </div>

                      {/* Owner Confidential Proof Box */}
                      <div style={{ marginTop: '0.85rem', background: '#fffbeb', border: '1px solid #fef08a', borderRadius: '6px', padding: '0.75rem' }}>
                        <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#92400e', textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', marginBottom: '0.25rem' }}>
                          <i className="bi bi-shield-lock-fill"></i> Confidential Owner Proof:
                        </span>
                        {appr.lost_item.secret_points && appr.lost_item.secret_points.length > 0 ? (
                          appr.lost_item.secret_points.map((sp, idx) => (
                            <div key={idx} style={{ fontSize: '0.84rem', color: '#78350f', fontWeight: 600, marginTop: '0.2rem' }}>
                              • "{typeof sp === 'string' ? sp : (sp.point || JSON.stringify(sp))}"
                            </div>
                          ))
                        ) : (
                          <div style={{ fontSize: '0.82rem', color: '#92400e' }}>
                            • "{appr.probe?.secret_point_text || 'Physical flaw / mark specified during intake'}"
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Column 2: Founder / Finder Dossier */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#1e293b', fontWeight: 800, marginBottom: '0.75rem', fontSize: '0.95rem' }}>
                        <i className="bi bi-box-seam-fill" style={{ color: 'var(--color-emerald)' }}></i>
                        <span>2. Founder (Finder) Dossier</span>
                      </div>

                      <div style={{ fontSize: '0.86rem', display: 'flex', flexDirection: 'column', gap: '0.35rem', color: '#334155' }}>
                        <div><strong>Finder Name:</strong> {appr.found_item.finder_name}</div>
                        <div><strong>Phone:</strong> {appr.found_item.finder_phone}</div>
                        <div><strong>Email:</strong> {appr.found_item.finder_email}</div>
                        <div><strong>Found At:</strong> {appr.found_item.found_location}</div>
                        <div><strong>Custody Mode:</strong> <span className="badge badge-neutral" style={{ fontSize: '0.7rem' }}>{appr.found_item.submission_type}</span></div>
                        <div style={{ marginTop: '0.25rem' }}>
                          <strong>Escrow Payout UPI:</strong> <code>{appr.found_item.finder_upi_id}</code>
                        </div>
                      </div>

                      {/* Primary Deposit Photo */}
                      {appr.found_item.primary_photo && (
                        <div style={{ marginTop: '0.85rem' }}>
                          <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase', display: 'block', marginBottom: '0.25rem' }}>
                            Intake Deposit Photo:
                          </span>
                          <img
                            src={appr.found_item.primary_photo}
                            alt="Found deposit"
                            style={{ maxHeight: '100px', width: '100%', objectFit: 'contain', background: '#0f172a', borderRadius: '6px', border: '1px solid #cbd5e1' }}
                          />
                        </div>
                      )}
                    </div>

                    {/* Column 3: AI Agent Forensic Verification Work */}
                    <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: '8px', padding: '1.1rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', color: '#1e293b', fontWeight: 800, fontSize: '0.95rem' }}>
                          <i className="bi bi-robot" style={{ color: 'var(--color-primary)' }}></i>
                          <span>3. AI Agent Inspection</span>
                        </div>
                        {probe && (
                          <span className={`badge ${probe.probe_status === 'VERIFIED' ? 'badge-verified' : 'badge-neutral'}`} style={{ fontSize: '0.72rem' }}>
                            {probe.probe_status}
                          </span>
                        )}
                      </div>

                      {probe ? (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.85rem' }}>
                          <div>
                            <strong style={{ color: '#1e293b' }}>Target Inspection Zone:</strong>
                            <div style={{ color: '#d97706', fontWeight: 700 }}>
                              <i className="bi bi-crosshair"></i> {probe.target_area}
                            </div>
                          </div>

                          <div style={{ background: '#ffffff', padding: '0.5rem', borderRadius: '4px', border: '1px solid #e2e8f0', color: '#475569', fontSize: '0.8rem', fontStyle: 'italic' }}>
                            "{probe.neutral_prompt}"
                          </div>

                          {/* Finder's Uploaded Verification Photo */}
                          {hasPhoto ? (
                            <div>
                              <strong style={{ fontSize: '0.78rem', color: '#334155', display: 'block', marginBottom: '0.2rem' }}>
                                Finder's Submitted Verification Photo:
                              </strong>
                              <img
                                src={probe.finder_response_photo}
                                alt="Finder verification probe"
                                style={{ maxHeight: '110px', width: '100%', objectFit: 'contain', background: '#09090b', borderRadius: '6px', border: '1px solid #94a3b8' }}
                              />
                              {probe.finder_notes && (
                                <div style={{ fontSize: '0.78rem', color: '#475569', marginTop: '0.25rem' }}>
                                  <strong>Finder Notes:</strong> "{probe.finder_notes}"
                                </div>
                              )}
                            </div>
                          ) : (
                            <div style={{ padding: '0.5rem', background: '#fffbeb', border: '1px solid #fef08a', borderRadius: '4px', color: '#92400e', fontSize: '0.78rem' }}>
                              <i className="bi bi-hourglass-split"></i> Awaiting verification image from finder.
                            </div>
                          )}

                          {/* AI Reasoning Text */}
                          {probe.agent_analysis_reasoning && (
                            <div style={{ background: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '6px', padding: '0.6rem', marginTop: '0.25rem' }}>
                              <span style={{ fontSize: '0.72rem', fontWeight: 800, color: '#065f46', textTransform: 'uppercase', display: 'block', marginBottom: '0.15rem' }}>
                                AI Forensic Reasoning ({Math.round((probe.agent_verification_score || 0.95) * 100)}%):
                              </span>
                              <p style={{ margin: 0, fontSize: '0.79rem', color: '#047857', lineHeight: 1.35 }}>
                                {probe.agent_analysis_reasoning}
                              </p>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ color: '#64748b', fontSize: '0.84rem', padding: '1rem 0' }}>
                          No blind challenge probe generated yet.
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

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
