import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

export default function ReportLost() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');

  const [formData, setFormData] = useState({
    product_name: '',
    category: 'Electronics',
    description: '',
    reward_amount: 0,
    secret_point: '',
    location: '',
    latitude: 12.9725,
    longitude: 77.5958,
    last_seen_time: new Date().toISOString().slice(0, 16),
    owner_name: '',
    owner_phone: '',
    backup_contact: '',
    owner_email: '',
    institutional_id: ''
  });

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const autofillSample = () => {
    setFormData({
      product_name: 'Apple MacBook Pro 14 M2 Space Gray',
      category: 'Electronics',
      description: 'Space Gray 14-inch MacBook Pro M2 with matte display and dark case.',
      reward_amount: 2000,
      secret_point: 'Small hairline crack on the right hinge directly next to the power button',
      location: 'Central Library 2nd Floor, Table 14',
      latitude: 12.9725,
      longitude: 77.5958,
      last_seen_time: new Date().toISOString().slice(0, 16),
      owner_name: 'Aarav Sharma',
      owner_phone: '+91 98765 43210',
      backup_contact: '+91 98765 00000 (Rohan - Roommate)',
      owner_email: 'aarav.sharma@campus.edu',
      institutional_id: '2024CS042'
    });
    alert('Sample matching report loaded! Click through the steps to review and submit.');
  };

  const autoDetectLocation = () => {
    if (!navigator.geolocation) {
      alert('Geolocation is not supported by your browser.');
      return;
    }
    setGeoStatus('Detecting current position...');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        setFormData(prev => ({ ...prev, latitude: lat, longitude: lon }));

        try {
          const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`);
          const data = await res.json();
          if (data && data.display_name) {
            const locName = data.display_name.split(',').slice(0, 3).join(', ');
            setFormData(prev => ({ ...prev, location: locName }));
          }
        } catch (e) {
          setFormData(prev => ({ ...prev, location: `Current Location (${lat.toFixed(4)}, ${lon.toFixed(4)})` }));
        }
        setGeoStatus('Location mapped automatically.');
      },
      () => {
        setGeoStatus('Standard campus coordinates retained.');
      }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const payload = {
      product_name: formData.product_name.trim(),
      category: formData.category,
      description: formData.description.trim(),
      reference_photos: [],
      secret_points: [{ point: formData.secret_point.trim(), photo_url: null }],
      reward_amount: parseFloat(formData.reward_amount || 0),
      reward_currency: 'INR',
      owner_name: formData.owner_name.trim(),
      owner_phone: formData.owner_phone.trim(),
      backup_contact: formData.backup_contact.trim(),
      owner_email: formData.owner_email.trim(),
      residential_address: 'Campus Hostel Block C',
      institutional_id: formData.institutional_id.trim() || 'ID-VERIFIED',
      last_seen_location: formData.location.trim(),
      latitude: formData.latitude,
      longitude: formData.longitude,
      last_seen_time: formData.last_seen_time
    };

    try {
      const res = await api.createLostItem(payload);
      alert(`Report Submitted! ID: ${res.id}\nRedirecting to your tracking dashboard.`);
      navigate(`/status?q=${encodeURIComponent(payload.owner_phone)}`);
    } catch (err) {
      alert(err.message || 'Failed to submit report');
      setLoading(false);
    }
  };

  return (
    <div className="main-content" style={{ maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <span className="badge badge-lost"><i className="bi bi-file-earmark-text"></i> Lost Property</span>
          <h1 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>Report a Missing Item</h1>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={autofillSample}>
          <i className="bi bi-magic"></i> Autofill Sample: MacBook Pro 14
        </button>
      </div>

      {/* Stepper Indicator */}
      <div className="wizard-progress">
        <div className="wizard-progress-bar">
          <div className="wizard-progress-fill" style={{ width: `${((step - 1) / 4) * 100}%` }}></div>
        </div>
        {[
          { num: 1, label: 'Item Details' },
          { num: 2, label: 'Secret Mark' },
          { num: 3, label: 'Location & Time' },
          { num: 4, label: 'Contact Info' },
          { num: 5, label: 'Review & Submit' }
        ].map(n => (
          <div key={n.num} className={`wizard-step-node ${step === n.num ? 'active' : (step > n.num ? 'completed' : '')}`}>
            <div className="wizard-node-circle">{step > n.num ? '✓' : n.num}</div>
            <span className="wizard-node-label">{n.label}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1: Item Details */}
        {step === 1 && (
          <div className="form-card">
            <h3>Step 1: Item Information</h3>
            <div className="form-row">
              <div className="form-group flex-2">
                <label>Item Name &amp; Model *</label>
                <input 
                  type="text" 
                  name="product_name" 
                  className="form-control" 
                  placeholder="e.g. Apple MacBook Pro 14 M2 Space Gray" 
                  value={formData.product_name} 
                  onChange={handleChange} 
                  required 
                />
              </div>
              <div className="form-group flex-1">
                <label>Category *</label>
                <select name="category" className="form-control" value={formData.category} onChange={handleChange} required>
                  <option value="Electronics">Electronics</option>
                  <option value="Smartphones & Tablets">Smartphones &amp; Tablets</option>
                  <option value="Wallets & Cards">Wallets &amp; Cards</option>
                  <option value="Keys & Accessories">Keys &amp; Accessories</option>
                  <option value="Bags & Backpacks">Bags &amp; Backpacks</option>
                  <option value="Other">Other</option>
                </select>
              </div>
            </div>
            <div className="form-group">
              <label>General Description *</label>
              <textarea 
                name="description" 
                className="form-control" 
                rows="3" 
                placeholder="Describe color, casing, surface stickers, condition..." 
                value={formData.description} 
                onChange={handleChange} 
                required 
              />
            </div>
            <div className="form-group">
              <label>Optional Cash Reward for Finder (INR ₹)</label>
              <input 
                type="number" 
                name="reward_amount" 
                className="form-control" 
                min="0" 
                value={formData.reward_amount} 
                onChange={handleChange} 
              />
              <span className="field-hint">Held securely until you verify and collect the item at the desk.</span>
            </div>
            <div className="wizard-actions">
              <div></div>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  if (!formData.product_name || !formData.description) alert('Please complete the required fields');
                  else setStep(2);
                }}
              >
                Next: Secret Mark <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Secret Identification Mark */}
        {step === 2 && (
          <div className="form-card">
            <h3>Step 2: Confidential Secret Mark</h3>
            <p className="field-hint" style={{ color: 'var(--text-secondary)' }}>
              Mention a hidden flaw, scratch, or marking that only the true owner would know. When an item is found, the system asks the finder to photograph that area without revealing what mark is there.
            </p>
            <div className="form-group">
              <label>Secret Identification Feature *</label>
              <input 
                type="text" 
                name="secret_point" 
                className="form-control" 
                placeholder="e.g. Small hairline crack on right hinge directly next to the power button" 
                value={formData.secret_point} 
                onChange={handleChange} 
                required 
              />
            </div>
            <div className="wizard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  if (!formData.secret_point) alert('Please describe one secret mark');
                  else setStep(3);
                }}
              >
                Next: Location &amp; Time <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Location & Time */}
        {step === 3 && (
          <div className="form-card">
            <h3>Step 3: Where &amp; When Did You Lose It?</h3>
            <div className="form-group">
              <label>Last Seen Place / Landmark *</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  name="location" 
                  className="form-control" 
                  style={{ flex: 1, minWidth: '240px' }} 
                  placeholder="e.g. Central Library 2nd Floor, Table 14" 
                  value={formData.location} 
                  onChange={handleChange} 
                  required 
                />
                <button type="button" className="btn btn-outline" style={{ whiteSpace: 'nowrap' }} onClick={autoDetectLocation}>
                  <i className="bi bi-crosshair"></i> Detect My Current Location
                </button>
              </div>
              {geoStatus && <span className="field-hint" style={{ color: 'var(--color-emerald)' }}>{geoStatus}</span>}
            </div>
            <div className="form-group">
              <label>Date &amp; Time Lost *</label>
              <input 
                type="datetime-local" 
                name="last_seen_time" 
                className="form-control" 
                value={formData.last_seen_time} 
                onChange={handleChange} 
                required 
              />
            </div>
            <div className="wizard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStep(2)}>
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  if (!formData.location || !formData.last_seen_time) alert('Please provide location and estimated time');
                  else setStep(4);
                }}
              >
                Next: Contact Info <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Contact Information */}
        {step === 4 && (
          <div className="form-card">
            <h3>Step 4: Contact Information</h3>
            <div className="form-row">
              <div className="form-group flex-1">
                <label>Full Legal Name *</label>
                <input 
                  type="text" 
                  name="owner_name" 
                  className="form-control" 
                  placeholder="Aarav Sharma" 
                  value={formData.owner_name} 
                  onChange={handleChange} 
                  required 
                />
              </div>
              <div className="form-group flex-1">
                <label>Primary Phone Number *</label>
                <input 
                  type="tel" 
                  name="owner_phone" 
                  className="form-control" 
                  placeholder="+91 98765 43210" 
                  value={formData.owner_phone} 
                  onChange={handleChange} 
                  required 
                />
              </div>
            </div>
            <div className="form-group" style={{ background: '#fffbeb', border: '1px solid #fde68a', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
              <label style={{ color: '#92400e' }}>Alternative Contact (Friend/Roommate Phone) *</label>
              <input 
                type="text" 
                name="backup_contact" 
                className="form-control" 
                placeholder="+91 98765 00000 (Rohan - Roommate)" 
                value={formData.backup_contact} 
                onChange={handleChange} 
                required 
              />
              <span className="field-hint" style={{ color: '#b45309' }}>Essential if your lost item is your primary phone.</span>
            </div>
            <div className="form-row">
              <div className="form-group flex-1">
                <label>Email Address *</label>
                <input 
                  type="email" 
                  name="owner_email" 
                  className="form-control" 
                  placeholder="aarav.sharma@campus.edu" 
                  value={formData.owner_email} 
                  onChange={handleChange} 
                  required 
                />
              </div>
              <div className="form-group flex-1">
                <label>College Roll / Govt ID *</label>
                <input 
                  type="text" 
                  name="institutional_id" 
                  className="form-control" 
                  placeholder="2024CS042" 
                  value={formData.institutional_id} 
                  onChange={handleChange} 
                  required 
                />
              </div>
            </div>
            <div className="wizard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStep(3)}>
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  if (!formData.owner_name || !formData.owner_phone || !formData.backup_contact || !formData.owner_email) {
                    alert('Please complete all contact details');
                  } else {
                    setStep(5);
                  }
                }}
              >
                Review Details <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 5: Review & Submit */}
        {step === 5 && (
          <div className="form-card">
            <h3>Step 5: Check Details &amp; Submit</h3>
            <p className="field-hint">Please verify that all information is accurate before submitting your report.</p>
            <div className="review-box">
              <div className="review-row"><span>Item Name:</span><strong>{formData.product_name}</strong></div>
              <div className="review-row"><span>Category:</span><strong>{formData.category}</strong></div>
              <div className="review-row"><span>Description:</span><span>{formData.description}</span></div>
              <div className="review-row"><span>Secret Mark:</span><span>{formData.secret_point}</span></div>
              <div className="review-row"><span>Reward:</span><strong>₹{formData.reward_amount || '0'}</strong></div>
              <div className="review-row"><span>Location:</span><strong>{formData.location}</strong></div>
              <div className="review-row"><span>Date &amp; Time:</span><span>{formData.last_seen_time}</span></div>
              <div className="review-row"><span>Owner:</span><strong>{formData.owner_name} ({formData.owner_phone})</strong></div>
              <div className="review-row"><span>Alternative Contact:</span><span>{formData.backup_contact}</span></div>
            </div>
            <div className="wizard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStep(4)}>
                <i className="bi bi-arrow-left"></i> Edit Details
              </button>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                {loading ? <><i className="bi bi-hourglass-split"></i> Submitting...</> : <><i className="bi bi-check2-circle"></i> Confirm &amp; Submit Report</>}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
