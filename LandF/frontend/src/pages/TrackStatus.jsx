import React, { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

const DEMO_HINGE_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='%2318181b'/><line x1='240' y1='80' x2='240' y2='220' stroke='%2352525b' stroke-width='6'/><path d='M250 110 L280 125' stroke='%23ef4444' stroke-width='3'/><text x='200' y='50' fill='%23f43f5e' font-weight='bold' text-anchor='middle'>Right Hinge Verification Photo</text></svg>";

export default function TrackStatus() {
  const [searchParams] = useSearchParams();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      executeSearch(q);
    }
  }, [searchParams]);

  const executeSearch = async (val) => {
    if (!val.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const res = await api.lookupStatus(val.trim());
      setData(res);
    } catch (err) {
      setError(err.message || 'No records found');
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
      alert(`Match check completed! Found ${res.candidate_count} candidate(s).`);
      executeSearch(query);
    } catch (err) {
      alert(err.message || 'Match check failed');
    }
  };

  const handleProbeSubmit = async (probeId) => {
    try {
      await api.submitProbeResponse(probeId, DEMO_HINGE_PHOTO, 'Photo taken under clear lighting.');
      alert('Verification photo submitted successfully! Match confirmed.');
      executeSearch(query);
    } catch (err) {
      alert(err.message || 'Probe submission failed');
    }
  };

  return (
    <div className="main-content" style={{ maxWidth: '860px' }}>
      <div style={{ marginBottom: '1.5rem' }}>
        <span className="badge badge-neutral"><i className="bi bi-clock-history"></i> Status Portal</span>
        <h1 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>Track Your Submissions</h1>
        <p className="field-hint" style={{ color: 'var(--text-secondary)' }}>
          Inspect matching progress, answer photo verification requests, and view your 6-digit pickup code.
        </p>
      </div>

      <div className="form-card" style={{ marginBottom: '2rem' }}>
        <form onSubmit={handleSearch} style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <input 
            type="text" 
            className="form-control" 
            style={{ flex: 1, minWidth: '240px' }} 
            placeholder="Enter phone number or report ID" 
            value={query} 
            onChange={(e) => setQuery(e.target.value)} 
            required 
          />
          <button type="submit" className="btn btn-primary" style={{ whiteSpace: 'nowrap' }}>
            <i className="bi bi-search"></i> Search Records
          </button>
        </form>
      </div>

      {loading && <p className="text-muted"><i className="bi bi-hourglass-split"></i> Loading records...</p>}
      
      {error && (
        <div className="form-card" style={{ textAlign: 'center' }}>
          <p style={{ color: 'var(--color-rose)' }}>{error}</p>
        </div>
      )}

      {data && (
        <div>
          {/* Lost items */}
          {data.lost_items && data.lost_items.length > 0 && (
            <div style={{ marginBottom: '2rem' }}>
              <h3 style={{ marginBottom: '1rem' }}><i className="bi bi-search"></i> Your Reported Lost Items ({data.lost_items.length})</h3>
              {data.lost_items.map(item => (
                <div key={item.id} className="form-card" style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                    <div>
                      <span className={`badge ${item.status === 'ARCHIVED' || item.status === 'RESOLVED' ? 'badge-verified' : 'badge-lost'}`}>
                        {item.status}
                      </span>
                      <h4 style={{ marginTop: '0.3rem' }}>{item.product_name}</h4>
                      <span className="field-hint">
                        Report ID: {item.id} • Last Seen: {item.last_seen_location}
                        {item.secret_points_count > 0 && ` • ${item.secret_points_count} Confirmation Detail(s) Saved`}
                      </span>
                    </div>
                    {item.status !== 'ARCHIVED' && (
                      <button type="button" className="btn btn-outline btn-sm" onClick={() => handleRunMatch(item.id)}>
                        <i className="bi bi-arrow-repeat"></i> Check for Matches
                      </button>
                    )}
                  </div>

                  {/* Pickup Passcode */}
                  {item.active_passcode && (
                    <div style={{ background: '#f0fdf4', border: '2px solid #86efac', borderRadius: 'var(--radius-sm)', padding: '1.25rem', textAlign: 'center', marginTop: '1rem' }}>
                      <span className="badge badge-verified"><i className="bi bi-check-circle"></i> Ready for Desk Pickup</span>
                      <div style={{ fontSize: '2.2rem', fontWeight: 800, letterSpacing: '0.3em', margin: '0.5rem 0' }}>
                        {item.active_passcode}
                      </div>
                      <p className="field-hint" style={{ color: '#166534' }}>
                        Present this 6-digit code to the duty officer at the campus security desk to claim your item.
                      </p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Found items */}
          {data.found_items && data.found_items.length > 0 && (
            <div>
              <h3 style={{ marginBottom: '1rem' }}><i className="bi bi-box-seam"></i> Your Found Item Deposits ({data.found_items.length})</h3>
              {data.found_items.map(item => {
                const pendingProbe = item.pending_probes && item.pending_probes.find(p => p.probe_status === 'PENDING_RESPONSE');
                return (
                  <div key={item.id} className="form-card" style={{ marginBottom: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
                      <div>
                        <span className={`badge ${item.status === 'ARCHIVED' || item.status === 'RESOLVED' ? 'badge-verified' : 'badge-found'}`}>
                          {item.status}
                        </span>
                        <h4 style={{ marginTop: '0.3rem' }}>{item.object_name}</h4>
                        <span className="field-hint">Reward UPI: <code>{item.finder_upi_id}</code> • Found At: {item.found_location}</span>
                      </div>
                    </div>

                    {/* Pending Probe Challenge */}
                    {pendingProbe && (
                      <div style={{ background: '#fffbeb', border: '2px solid #fde68a', borderRadius: 'var(--radius-sm)', padding: '1.25rem', marginTop: '1rem' }}>
                        <strong><i className="bi bi-camera"></i> Close-Up Photo Verification Request</strong>
                        <p style={{ fontSize: '0.95rem', margin: '0.4rem 0', fontWeight: 600, color: '#78350f' }}>
                          "{pendingProbe.neutral_prompt}"
                        </p>
                        <p className="field-hint" style={{ color: '#b45309', marginBottom: '0.75rem' }}>
                          Target Zone: <strong>{pendingProbe.target_area}</strong> (Confidential flaw is not revealed).
                        </p>
                        <button type="button" className="btn btn-primary btn-sm" onClick={() => handleProbeSubmit(pendingProbe.id)}>
                          <i className="bi bi-upload"></i> Submit Verification Photo
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
