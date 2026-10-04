import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';

export default function Archived() {
  const toast = useToast();
  const [archivedRecords, setArchivedRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');

  const adminPin = localStorage.getItem('admin_pin') || 'admin123';

  useEffect(() => {
    fetchArchived();
  }, []);

  const fetchArchived = async () => {
    setLoading(true);
    try {
      const data = await api.getArchivedItems(adminPin);
      setArchivedRecords(data.archived_items || []);
    } catch (err) {
      toast.error(err);
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
    <div className="main-content" style={{ maxWidth: '1140px' }}>
      {/* Header */}
      <div className="admin-header-bar">
        <div>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <i className="bi bi-archive" style={{ color: 'var(--text-secondary)' }}></i>
            Archived Records &amp; Resolved Handovers
          </h2>
          <span className="field-hint" style={{ color: 'var(--text-secondary)' }}>
            Permanent audit history of all verified returned property and escrow payouts.
          </span>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <button type="button" className="btn btn-outline btn-sm" onClick={fetchArchived} disabled={loading}>
            <i className="bi bi-arrow-clockwise"></i> Refresh
          </button>
          <Link to="/admin" className="btn btn-primary btn-sm">
            <i className="bi bi-person-badge"></i> Staff Portal
          </Link>
        </div>
      </div>

      {/* Search Filter */}
      <div className="form-card" style={{ marginBottom: '1.5rem', padding: '1.25rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
          <div style={{ flex: 1, minWidth: '260px' }}>
            <input
              type="text"
              className="form-control"
              placeholder="Search by item title, claimant, finder, or category..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <span className="field-hint">
            Showing <strong>{filtered.length}</strong> of <strong>{archivedRecords.length}</strong> records
          </span>
        </div>
      </div>

      {/* Archive Table */}
      <div className="admin-table-wrapper">
        {loading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="bi bi-hourglass-split" style={{ fontSize: '1.8rem', display: 'block', marginBottom: '0.5rem' }}></i>
            Loading archived handovers...
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--text-muted)' }}>
            <i className="bi bi-inbox" style={{ fontSize: '2.5rem', display: 'block', marginBottom: '0.5rem', color: 'var(--color-slate-400)' }}></i>
            <h4 style={{ margin: '0.5rem 0 0.25rem 0' }}>No Archived Records Found</h4>
            <p className="field-hint">
              {searchTerm ? 'No matches found for your filter.' : 'When property is verified and collected with 6-digit passcodes, records will appear here.'}
            </p>
          </div>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Item Title &amp; Category</th>
                <th>Claimant (Owner)</th>
                <th>Finder Details</th>
                <th>Handover Desk</th>
                <th>Reward Payout</th>
                <th>Archived Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((item, idx) => (
                <tr key={item.lost_item_id || idx}>
                  <td>
                    <strong>{item.lost_title || item.found_title || 'Item #' + (item.lost_item_id || item.found_item_id)}</strong>
                    <span className="badge badge-neutral" style={{ display: 'block', width: 'fit-content', marginTop: '0.2rem', fontSize: '0.72rem' }}>
                      {item.category || 'General'}
                    </span>
                  </td>
                  <td>
                    <div>{item.claimant_name || 'Verified Owner'}</div>
                    <span className="field-hint">{item.claimant_phone || 'Private'}</span>
                  </td>
                  <td>
                    <div>{item.finder_name || 'Anonymous Finder'}</div>
                    {item.finder_upi && <code style={{ fontSize: '0.75rem' }}>UPI: {item.finder_upi}</code>}
                  </td>
                  <td>
                    <span className="badge badge-neutral">
                      <i className="bi bi-geo-alt"></i> {item.desk_id || 'Campus Desk'}
                    </span>
                    {item.officer_name && <span className="field-hint" style={{ display: 'block' }}>By: {item.officer_name}</span>}
                  </td>
                  <td>
                    {item.escrow_amount ? (
                      <span className="badge badge-verified">₹{item.escrow_amount} Paid</span>
                    ) : (
                      <span className="field-hint">None</span>
                    )}
                  </td>
                  <td className="field-hint">
                    {item.archived_at ? new Date(item.archived_at).toLocaleString() : 'Recently'}
                  </td>
                  <td>
                    <span className="badge badge-neutral">
                      <i className="bi bi-check2-all"></i> RESOLVED
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
