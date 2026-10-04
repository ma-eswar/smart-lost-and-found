import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export default function Admin() {
  const [pin, setPin] = useState(localStorage.getItem('admin_pin') || '');
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState('');
  const [activeTab, setActiveTab] = useState('lost');

  const [lostItems, setLostItems] = useState([]);
  const [foundItems, setFoundItems] = useState([]);
  const [escrowRecords, setEscrowRecords] = useState([]);
  const [desks, setDesks] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState({ text: '', type: '' });

  // Handover state
  const [handoverCode, setHandoverCode] = useState('');
  const [selectedDesk, setSelectedDesk] = useState('DESK-LIB-02');
  const [officerName, setOfficerName] = useState('Duty Officer');
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
      setStatusMsg({ text: 'Error loading admin data: ' + err.message, type: 'error' });
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
      setStatusMsg({ text: `Matching evaluated: ${res.evaluations?.length || 0} candidate(s) compared.`, type: 'success' });
      fetchAdminData();
    } catch (err) {
      setStatusMsg({ text: 'Match check failed: ' + err.message, type: 'error' });
    } finally {
      setEvalLoading(false);
    }
  };

  const generatePasscode = async (evaluationId) => {
    try {
      const res = await api.generatePasscode(evaluationId, pin);
      setStatusMsg({
        text: `Handover Passcode Generated: ${res.handover_passcode} (Expires: ${new Date(res.passcode_expires_at).toLocaleTimeString()})`,
        type: 'success'
      });
      if (evaluatingId) {
        const updatedResults = await api.getMatchResults(evaluatingId, pin);
        setMatchResults(updatedResults);
      }
    } catch (err) {
      setStatusMsg({ text: 'Passcode generation failed: ' + err.message, type: 'error' });
    }
  };

  const requestPhotoVerification = async (lostItemId, foundItemId) => {
    try {
      const res = await api.createProbe(lostItemId, foundItemId, 0, pin);
      setStatusMsg({
        text: `Photo Verification Request created (Probe ID: ${res.probe_id}). Finder can upload requested photo via Status portal.`,
        type: 'success'
      });
      if (evaluatingId) {
        const updatedResults = await api.getMatchResults(evaluatingId, pin);
        setMatchResults(updatedResults);
      }
    } catch (err) {
      setStatusMsg({ text: 'Failed to create photo probe: ' + err.message, type: 'error' });
    }
  };

  const handleHandoverSubmit = async (e) => {
    e.preventDefault();
    if (!handoverCode || handoverCode.trim().length !== 6) {
      setStatusMsg({ text: 'Please enter a valid 6-digit pickup code', type: 'error' });
      return;
    }

    try {
      const res = await api.verifyHandoverPasscode(handoverCode.trim(), selectedDesk, officerName, pin);
      setHandoverResult(res);
      setHandoverCode('');
      setStatusMsg({
        text: `Handover successfully verified! Escrow disbursed: Rs. ${res.escrow_amount}. Records archived.`,
        type: 'success'
      });
      fetchAdminData();
    } catch (err) {
      setStatusMsg({ text: 'Handover verification failed: ' + err.message, type: 'error' });
      setHandoverResult(null);
    }
  };

  if (!isAuthenticated) {
    return (
      <div className="container py-5" style={{ maxWidth: '440px' }}>
        <div className="card shadow border-0 p-4">
          <div className="text-center mb-4">
            <div className="bg-primary text-white rounded-circle d-inline-flex p-3 mb-2">
              <i className="bi bi-shield-lock fs-2"></i>
            </div>
            <h3 className="fw-bold">Staff Access Portal</h3>
            <p className="text-muted small">Enter your staff PIN to access the handover terminal & active match manager.</p>
          </div>

          {authError && <div className="alert alert-danger py-2 small mb-3">{authError}</div>}

          <form onSubmit={(e) => { e.preventDefault(); handleLogin(pin); }}>
            <div className="mb-3">
              <label className="form-label fw-bold small">Staff Security PIN</label>
              <input
                type="password"
                className="form-control form-control-lg text-center fw-bold"
                placeholder="Enter PIN (e.g. admin123)"
                value={pin}
                onChange={(e) => setPin(e.target.value)}
                autoFocus
              />
            </div>
            <button type="submit" className="btn btn-primary w-100 py-2 fw-bold" disabled={loading}>
              {loading ? 'Authenticating...' : 'Unlock Staff Terminal'}
            </button>
          </form>
          <div className="text-center mt-3">
            <small className="text-muted">Default PIN: <code>admin123</code></small>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
        <div>
          <h2 className="fw-bold mb-1">
            <i className="bi bi-person-badge text-primary me-2"></i>
            Staff & Handover Terminal
          </h2>
          <p className="text-muted mb-0 small">Desk Operations, Active Match Engine, Escrow Releases, and Archive Management</p>
        </div>
        <div className="d-flex gap-2">
          <Link to="/archive" className="btn btn-outline-secondary btn-sm">
            <i className="bi bi-archive me-1"></i> View Archive
          </Link>
          <button className="btn btn-outline-danger btn-sm" onClick={handleLogout}>
            <i className="bi bi-box-arrow-right me-1"></i> Log Out
          </button>
        </div>
      </div>

      {statusMsg.text && (
        <div className={`alert ${statusMsg.type === 'error' ? 'alert-danger' : 'alert-success'} alert-dismissible fade show mb-4`} role="alert">
          {statusMsg.text}
          <button type="button" className="btn-close" onClick={() => setStatusMsg({ text: '', type: '' })}></button>
        </div>
      )}

      {/* Tabs */}
      <ul className="nav nav-pills mb-4 border-bottom pb-3">
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold ${activeTab === 'lost' ? 'active' : ''}`}
            onClick={() => setActiveTab('lost')}
          >
            <i className="bi bi-search me-1"></i> Active Lost Items ({lostItems.length})
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold ${activeTab === 'found' ? 'active' : ''}`}
            onClick={() => setActiveTab('found')}
          >
            <i className="bi bi-box-seam me-1"></i> Active Found Items ({foundItems.length})
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold ${activeTab === 'terminal' ? 'active' : ''}`}
            onClick={() => setActiveTab('terminal')}
          >
            <i className="bi bi-check-circle me-1"></i> Handover & Pickup Terminal
          </button>
        </li>
        <li className="nav-item">
          <button
            className={`nav-link fw-semibold ${activeTab === 'escrow' ? 'active' : ''}`}
            onClick={() => setActiveTab('escrow')}
          >
            <i className="bi bi-cash-stack me-1"></i> Escrow Vault ({escrowRecords.length})
          </button>
        </li>
      </ul>

      {/* Tab 1: Active Lost Items */}
      {activeTab === 'lost' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
            <h5 className="mb-0 fw-bold">Active Lost Reports</h5>
            <button className="btn btn-sm btn-outline-primary" onClick={() => fetchAdminData()} disabled={loading}>
              <i className="bi bi-arrow-clockwise me-1"></i> Refresh
            </button>
          </div>
          <div className="card-body p-0">
            {lostItems.length === 0 ? (
              <div className="p-4 text-center text-muted">No active lost items reported.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light small">
                    <tr>
                      <th>Report ID</th>
                      <th>Item & Category</th>
                      <th>Location / Landmark</th>
                      <th>Confirmation Details</th>
                      <th>Owner Contact</th>
                      <th>Status</th>
                      <th className="text-end">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lostItems.map(item => (
                      <tr key={item.id}>
                        <td><code>{item.id}</code></td>
                        <td>
                          <div className="fw-bold">{item.title || item.product_name}</div>
                          <small className="text-muted badge bg-light text-dark">{item.category}</small>
                        </td>
                        <td>
                          <small className="d-block">{item.location_name || item.last_seen_location || 'Not specified'}</small>
                          {item.latitude && item.longitude && (
                            <small className="text-muted">({item.latitude.toFixed(4)}, {item.longitude.toFixed(4)})</small>
                          )}
                        </td>
                        <td>
                          {item.secret_points && item.secret_points.length > 0 ? (
                            <div className="small" style={{ maxWidth: '220px' }}>
                              <span className="badge bg-light text-dark mb-1">{item.secret_points.length} Verification Detail(s)</span>
                              <div className="text-truncate" title={item.secret_points.map((p, i) => `${p.question ? p.question + ': ' : ''}${p.point || p}`).join(' | ')}>
                                {item.secret_points[0].point || item.secret_points[0]}
                              </div>
                            </div>
                          ) : (
                            <span className="small text-truncate d-inline-block" style={{ maxWidth: '180px' }} title={item.secret_point}>
                              {item.secret_point || '—'}
                            </span>
                          )}
                        </td>
                        <td>
                          <div>{item.contact_phone}</div>
                          <small className="text-muted">{item.claimant_name}</small>
                        </td>
                        <td>
                          <span className={`badge ${
                            item.status === 'ARCHIVED' ? 'bg-secondary' :
                            item.status === 'MATCHED' ? 'bg-success' : 'bg-warning text-dark'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                        <td className="text-end">
                          <button
                            className="btn btn-sm btn-primary"
                            onClick={() => runMatchCheck(item.id)}
                            disabled={evalLoading}
                          >
                            <i className="bi bi-cpu me-1"></i> Run Match Check
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 2: Active Found Items */}
      {activeTab === 'found' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white py-3 d-flex justify-content-between align-items-center">
            <h5 className="mb-0 fw-bold">Active Found Items In Custody</h5>
            <button className="btn btn-sm btn-outline-primary" onClick={() => fetchAdminData()} disabled={loading}>
              <i className="bi bi-arrow-clockwise me-1"></i> Refresh
            </button>
          </div>
          <div className="card-body p-0">
            {foundItems.length === 0 ? (
              <div className="p-4 text-center text-muted">No active found items in registry.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light small">
                    <tr>
                      <th>Found ID</th>
                      <th>Item & Category</th>
                      <th>Custody Type</th>
                      <th>Found Location</th>
                      <th>Finder Contact</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {foundItems.map(item => (
                      <tr key={item.id}>
                        <td><code>{item.id}</code></td>
                        <td>
                          <div className="fw-bold">{item.title}</div>
                          <small className="text-muted">{item.category}</small>
                        </td>
                        <td>
                          <span className={`badge ${item.custody_type === 'DESK' ? 'bg-info text-dark' : 'bg-warning text-dark'}`}>
                            {item.custody_type === 'DESK' ? 'Physical Desk' : 'Direct Holding'}
                          </span>
                          {item.desk_id && <small className="d-block text-muted">{item.desk_id}</small>}
                        </td>
                        <td>{item.location_name || 'Not specified'}</td>
                        <td>
                          <div>{item.finder_phone || 'Anonymous'}</div>
                          {item.finder_upi && <small className="text-muted">UPI: {item.finder_upi}</small>}
                        </td>
                        <td>
                          <span className={`badge ${
                            item.status === 'ARCHIVED' ? 'bg-secondary' :
                            item.status === 'MATCHED' ? 'bg-success' : 'bg-primary'
                          }`}>
                            {item.status}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Handover Terminal */}
      {activeTab === 'terminal' && (
        <div className="row g-4">
          <div className="col-lg-6">
            <div className="card border-0 shadow-sm p-4">
              <h5 className="fw-bold mb-3">
                <i className="bi bi-key text-primary me-2"></i>
                Verify Handover Passcode
              </h5>
              <p className="text-muted small mb-4">
                When claimant presents their 6-digit verification passcode at the desk, verify it here to release escrow and complete transfer.
              </p>

              <form onSubmit={handleHandoverSubmit}>
                <div className="mb-3">
                  <label className="form-label fw-bold small">6-Digit Pickup Passcode</label>
                  <input
                    type="text"
                    maxLength="6"
                    className="form-control form-control-lg text-center fw-bold fs-3 tracking-wide"
                    placeholder="000000"
                    value={handoverCode}
                    onChange={(e) => setHandoverCode(e.target.value)}
                    required
                  />
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold small">Handover Desk</label>
                  <select
                    className="form-select"
                    value={selectedDesk}
                    onChange={(e) => setSelectedDesk(e.target.value)}
                  >
                    {desks.map(desk => (
                      <option key={desk.id} value={desk.id}>
                        {desk.name} ({desk.location})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="mb-3">
                  <label className="form-label fw-bold small">Duty Officer Name</label>
                  <input
                    type="text"
                    className="form-control"
                    value={officerName}
                    onChange={(e) => setOfficerName(e.target.value)}
                    required
                  />
                </div>

                <button type="submit" className="btn btn-success w-100 py-3 fw-bold">
                  <i className="bi bi-check2-circle me-1"></i> Verify & Hand Over Property
                </button>
              </form>
            </div>
          </div>

          <div className="col-lg-6">
            {handoverResult ? (
              <div className="card border-success shadow-sm p-4 bg-light">
                <div className="d-flex align-items-center text-success mb-3">
                  <i className="bi bi-check-circle-fill fs-2 me-2"></i>
                  <h5 className="fw-bold mb-0">Handover Complete & Archived</h5>
                </div>
                <div className="p-3 bg-white rounded border mb-3">
                  <div className="row g-2 small">
                    <div className="col-6 text-muted">Item Title:</div>
                    <div className="col-6 fw-bold">{handoverResult.lost_title}</div>
                    <div className="col-6 text-muted">Claimant:</div>
                    <div className="col-6 fw-bold">{handoverResult.claimant_name}</div>
                    <div className="col-6 text-muted">Finder:</div>
                    <div className="col-6 fw-bold">{handoverResult.finder_name}</div>
                    <div className="col-6 text-muted">Escrow Payout:</div>
                    <div className="col-6 fw-bold text-success">Rs. {handoverResult.escrow_amount}</div>
                    <div className="col-6 text-muted">Archived At:</div>
                    <div className="col-6">{new Date().toLocaleString()}</div>
                  </div>
                </div>
                <Link to="/archive" className="btn btn-outline-secondary w-100 btn-sm">
                  <i className="bi bi-archive me-1"></i> Open Archived Records
                </Link>
              </div>
            ) : (
              <div className="card border-0 shadow-sm p-4 text-center text-muted">
                <i className="bi bi-qr-code-scan fs-1 mb-3 text-secondary"></i>
                <h6 className="fw-bold">Ready for Pickup Verification</h6>
                <p className="small mb-0">
                  Enter the 6-digit code shown on the claimant's status tracking card to verify ownership and trigger automatic escrow payout.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 4: Escrow Records */}
      {activeTab === 'escrow' && (
        <div className="card border-0 shadow-sm">
          <div className="card-header bg-white py-3">
            <h5 className="mb-0 fw-bold">Escrow Vault Transactions</h5>
          </div>
          <div className="card-body p-0">
            {escrowRecords.length === 0 ? (
              <div className="p-4 text-center text-muted">No escrow transactions recorded.</div>
            ) : (
              <div className="table-responsive">
                <table className="table table-hover align-middle mb-0">
                  <thead className="table-light small">
                    <tr>
                      <th>Escrow ID</th>
                      <th>Lost Item ID</th>
                      <th>Amount (INR)</th>
                      <th>Status</th>
                      <th>Payout UPI</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {escrowRecords.map(rec => (
                      <tr key={rec.id}>
                        <td><code>{rec.id}</code></td>
                        <td><code>{rec.lost_item_id}</code></td>
                        <td className="fw-bold">Rs. {rec.amount}</td>
                        <td>
                          <span className={`badge ${rec.status === 'RELEASED' ? 'bg-success' : 'bg-warning text-dark'}`}>
                            {rec.status}
                          </span>
                        </td>
                        <td>{rec.payout_address || 'Pending'}</td>
                        <td className="small text-muted">{new Date(rec.created_at).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Match Results Modal / Overlay */}
      {matchResults && (
        <div className="modal show d-block" style={{ backgroundColor: 'rgba(0,0,0,0.5)' }} tabIndex="-1">
          <div className="modal-dialog modal-lg modal-dialog-scrollable">
            <div className="modal-content">
              <div className="modal-header bg-primary text-white">
                <h5 className="modal-title fw-bold">
                  <i className="bi bi-cpu me-2"></i>
                  Matching Engine Results: Item #{evaluatingId}
                </h5>
                <button type="button" className="btn-close btn-close-white" onClick={() => setMatchResults(null)}></button>
              </div>
              <div className="modal-body p-4">
                {(!matchResults.evaluations || matchResults.evaluations.length === 0) ? (
                  <div className="text-center py-4 text-muted">
                    <i className="bi bi-info-circle fs-3 d-block mb-2"></i>
                    No potential found item matches scored above the threshold.
                  </div>
                ) : (
                  <div className="d-flex flex-column gap-3">
                    {matchResults.evaluations.map((evalItem) => (
                      <div key={evalItem.id} className="card border shadow-sm p-3">
                        <div className="d-flex justify-content-between align-items-start mb-2">
                          <div>
                            <h6 className="fw-bold mb-1">Found Item: {evalItem.found_title || evalItem.found_item_id}</h6>
                            <span className="badge bg-info text-dark me-2">Match Score: {(evalItem.composite_score * 100).toFixed(1)}%</span>
                            <span className="badge bg-light text-dark">Stage: {evalItem.stage}</span>
                          </div>
                          <div>
                            {evalItem.handover_passcode ? (
                              <span className="badge bg-success fs-6 p-2">Code: {evalItem.handover_passcode}</span>
                            ) : (
                              <button
                                className="btn btn-sm btn-success"
                                onClick={() => generatePasscode(evalItem.id)}
                              >
                                <i className="bi bi-key me-1"></i> Generate 6-Digit Passcode
                              </button>
                            )}
                          </div>
                        </div>

                        {/* Breakdown */}
                        <div className="row g-2 text-muted small my-2 p-2 bg-light rounded">
                          <div className="col-4">Text Similarity: {(evalItem.lexical_score * 100 || 0).toFixed(0)}%</div>
                          <div className="col-4">Location Proximity: {(evalItem.haversine_score * 100 || 0).toFixed(0)}%</div>
                          <div className="col-4">Visual Match: {(evalItem.vision_score * 100 || 0).toFixed(0)}%</div>
                        </div>

                        {/* Actions */}
                        <div className="d-flex gap-2 mt-2">
                          <button
                            className="btn btn-sm btn-outline-primary"
                            onClick={() => requestPhotoVerification(evalItem.lost_item_id, evalItem.found_item_id)}
                          >
                            <i className="bi bi-camera me-1"></i> Request Photo Verification Probe
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setMatchResults(null)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
