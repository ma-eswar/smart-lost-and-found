import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';

export default function Archived() {
  const [archivedRecords, setArchivedRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const adminPin = localStorage.getItem('admin_pin') || 'admin123';

  useEffect(() => {
    fetchArchived();
  }, []);

  const fetchArchived = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.getArchivedItems(adminPin);
      setArchivedRecords(data.archived_items || []);
    } catch (err) {
      setError('Failed to load archived records: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const filtered = archivedRecords.filter(item => {
    const term = searchTerm.toLowerCase();
    return (
      (item.lost_title && item.lost_title.toLowerCase().includes(term)) ||
      (item.found_title && item.found_title.toLowerCase().includes(term)) ||
      (item.claimant_name && item.claimant_name.toLowerCase().includes(term)) ||
      (item.finder_name && item.finder_name.toLowerCase().includes(term)) ||
      (item.category && item.category.toLowerCase().includes(term)) ||
      (item.lost_item_id && item.lost_item_id.toLowerCase().includes(term))
    );
  });

  return (
    <div className="container py-4">
      {/* Header */}
      <div className="d-flex justify-content-between align-items-center mb-4 pb-2 border-bottom">
        <div>
          <h2 className="fw-bold mb-1">
            <i className="bi bi-archive text-secondary me-2"></i>
            Archived Records & Resolved Handovers
          </h2>
          <p className="text-muted mb-0 small">
            Permanent, tamper-evident audit history of all successfully returned lost & found items and escrow payouts.
          </p>
        </div>
        <div className="d-flex gap-2">
          <button className="btn btn-outline-primary btn-sm" onClick={fetchArchived} disabled={loading}>
            <i className="bi bi-arrow-clockwise me-1"></i> Refresh
          </button>
          <Link to="/admin" className="btn btn-primary btn-sm">
            <i className="bi bi-person-badge me-1"></i> Staff Portal
          </Link>
        </div>
      </div>

      {error && (
        <div className="alert alert-danger py-2 small mb-4">{error}</div>
      )}

      {/* Search Filter */}
      <div className="card border-0 shadow-sm mb-4 p-3 bg-light">
        <div className="row g-2 align-items-center">
          <div className="col-md-6">
            <div className="input-group">
              <span className="input-group-text bg-white border-end-0">
                <i className="bi bi-search text-muted"></i>
              </span>
              <input
                type="text"
                className="form-control border-start-0"
                placeholder="Search by item title, claimant, finder, or category..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="col-md-6 text-md-end text-muted small">
            Showing <strong>{filtered.length}</strong> of <strong>{archivedRecords.length}</strong> archived items
          </div>
        </div>
      </div>

      {/* Archive List */}
      <div className="card border-0 shadow-sm">
        <div className="card-body p-0">
          {loading ? (
            <div className="text-center py-5">
              <div className="spinner-border text-primary" role="status"></div>
              <p className="text-muted small mt-2">Loading archived handovers...</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-5 text-muted">
              <i className="bi bi-inbox fs-1 d-block mb-3 text-secondary"></i>
              <h5 className="fw-bold">No Archived Records Found</h5>
              <p className="small mb-0">
                {searchTerm ? 'No matches found for your search filter.' : 'When lost items are handed over and verified via 6-digit passcode, they will appear here.'}
              </p>
            </div>
          ) : (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light small">
                  <tr>
                    <th>Item Title & Category</th>
                    <th>Claimant (Owner)</th>
                    <th>Finder Details</th>
                    <th>Handover Desk</th>
                    <th>Reward Payout</th>
                    <th>Archived Timestamp</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((item, idx) => (
                    <tr key={item.lost_item_id || idx}>
                      <td>
                        <div className="fw-bold">{item.lost_title || item.found_title || 'Item #' + (item.lost_item_id || item.found_item_id)}</div>
                        <div className="d-flex gap-1 align-items-center mt-1">
                          <span className="badge bg-light text-dark">{item.category || 'General'}</span>
                          {item.lost_item_id && <small className="text-muted">ID: {item.lost_item_id}</small>}
                        </div>
                      </td>
                      <td>
                        <div className="fw-semibold">{item.claimant_name || 'Verified Owner'}</div>
                        <small className="text-muted">{item.claimant_phone || 'Private'}</small>
                      </td>
                      <td>
                        <div className="fw-semibold">{item.finder_name || 'Anonymous Finder'}</div>
                        {item.finder_upi && <small className="text-muted">UPI: {item.finder_upi}</small>}
                      </td>
                      <td>
                        <span className="badge bg-secondary">
                          <i className="bi bi-geo-alt me-1"></i>
                          {item.desk_id || 'Main Campus Desk'}
                        </span>
                        {item.officer_name && <small className="d-block text-muted">By: {item.officer_name}</small>}
                      </td>
                      <td>
                        {item.escrow_amount ? (
                          <span className="badge bg-success">Rs. {item.escrow_amount} Paid</span>
                        ) : (
                          <span className="text-muted small">None</span>
                        )}
                      </td>
                      <td className="small text-muted">
                        <i className="bi bi-clock-history me-1"></i>
                        {item.archived_at ? new Date(item.archived_at).toLocaleString() : 'Recently'}
                      </td>
                      <td>
                        <span className="badge bg-dark">
                          <i className="bi bi-check2-all me-1"></i> ARCHIVED
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
    </div>
  );
}
