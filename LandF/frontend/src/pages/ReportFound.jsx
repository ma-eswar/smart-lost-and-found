import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { useAuth } from '../components/AuthContext';

const DEFAULT_SAMPLE_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='%23334155'/><text x='200' y='150' fill='%23fff' text-anchor='middle'>Found Item Photo</text></svg>";

export default function ReportFound() {
  const navigate = useNavigate();
  const toast = useToast();
  const { setAuthSession } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [desks, setDesks] = useState([]);
  const [geoStatus, setGeoStatus] = useState('');
  const [custodyMode, setCustodyMode] = useState('desk'); // 'desk' or 'direct'
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [submittedItem, setSubmittedItem] = useState(null);

  const [formData, setFormData] = useState({
    desk_id: 'DESK-LIB-02',
    object_name: '',
    category: 'Electronics',
    description: '',
    primary_photo: DEFAULT_SAMPLE_PHOTO,
    location: '',
    latitude: 12.9726,
    longitude: 77.5959,
    found_time: new Date().toISOString().slice(0, 16),
    finder_name: '',
    finder_phone: '',
    finder_email: '',
    finder_upi_id: '',
    finder_roll_or_id: '2024CS042'
  });

  useEffect(() => {
    api.getDesks().then(data => {
      setDesks(data);
      if (data.length > 0 && !formData.desk_id) {
        setFormData(prev => ({ ...prev, desk_id: data[0].id }));
      }
    }).catch(console.error);

    // Profile auto-fill from localStorage
    try {
      const stored = localStorage.getItem('user') || localStorage.getItem('saved_profile');
      if (stored) {
        const user = JSON.parse(stored);
        if (user.full_name || user.phone || user.email) {
          setFormData(prev => ({
            ...prev,
            finder_name: user.full_name || user.name || prev.finder_name,
            finder_phone: user.phone || prev.finder_phone,
            finder_email: user.email || prev.finder_email,
            finder_roll_or_id: user.institutional_id || user.roll_no || prev.finder_roll_or_id,
            finder_upi_id: user.upi_id || prev.finder_upi_id
          }));
          setIsAutoFilled(true);
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  const handlePhotoUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      setFormData(prev => ({ ...prev, primary_photo: evt.target.result }));
      toast.success('Photo attached successfully.');
    };
    reader.readAsDataURL(file);
  };

  const autofillSample = () => {
    setCustodyMode('desk');
    setFormData({
      desk_id: 'DESK-LIB-02',
      object_name: 'MacBook Pro 14 Laptop in Dark Protective Cover',
      category: 'Electronics',
      description: 'Dark cover Space Gray 14-inch Apple laptop found near study desk.',
      primary_photo: DEFAULT_SAMPLE_PHOTO,
      location: 'Central Library Study Section',
      latitude: 12.9726,
      longitude: 77.5959,
      found_time: new Date().toISOString().slice(0, 16),
      finder_name: 'Rahul Verma',
      finder_phone: '+91 91234 56789',
      finder_email: 'rahul.verma@campus.edu',
      finder_upi_id: 'rahul@okaxis',
      finder_roll_or_id: '2024CS042'
    });
    toast.success('Sample found item data loaded. Proceed through steps to review.');
  };

  const autoDetectLocation = () => {
    if (!navigator.geolocation) {
      toast.error('Geolocation is not supported by your browser.');
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
        } catch {
          setFormData(prev => ({ ...prev, location: `Current Location (${lat.toFixed(4)}, ${lon.toFixed(4)})` }));
        }
        setGeoStatus('Location mapped automatically.');
        toast.success('Location updated to your current position.');
      },
      () => {
        setGeoStatus('Standard coordinates retained.');
        toast.info('Could not obtain live GPS. Standard coordinates retained.');
      }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const isDesk = custodyMode === 'desk';
    const payload = {
      desk_id: isDesk ? formData.desk_id : null,
      object_name: formData.object_name.trim(),
      category: formData.category,
      description: formData.description.trim(),
      primary_photo: formData.primary_photo,
      additional_photos: [],
      found_location: formData.location.trim(),
      latitude: formData.latitude,
      longitude: formData.longitude,
      found_time: formData.found_time,
      pickup_availability: isDesk ? 'Deposited at Desk' : 'Available on Call',
      finder_name: formData.finder_name.trim(),
      finder_phone: formData.finder_phone.trim(),
      finder_email: formData.finder_email.trim(),
      finder_upi_id: formData.finder_upi_id.trim(),
      finder_roll_or_id: formData.finder_roll_or_id.trim()
    };

    try {
      const res = isDesk 
        ? await api.createDeskFoundItem(payload)
        : await api.createDirectFoundItem(payload);
      
      if (res.user && res.auth_token) {
        setAuthSession(res.user, res.auth_token);
      }
      localStorage.setItem('last_user_phone', payload.finder_phone);
      setSubmittedItem(res);
      toast.success('Found property registered! Continuous reverse matching initiated.');
    } catch (err) {
      toast.error(err);
    } finally {
      setLoading(false);
    }
  };

  // Reassurance Post-Submit Screen ("Peace of Mind")
  if (submittedItem) {
    return (
      <div className="main-content" style={{ maxWidth: '680px' }}>
        <div className="form-card reassurance-card">
          <div className="reassurance-icon-wrapper" style={{ background: '#ecfdf5', borderColor: '#a7f3d0' }}>
            <i className="bi bi-box-seam reassurance-icon" style={{ color: 'var(--color-emerald)' }}></i>
          </div>
          <span className="badge badge-verified" style={{ margin: '0.5rem auto 1rem auto' }}>
            <i className="bi bi-check-circle"></i> Intake Successfully Logged
          </span>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            Thank You for Doing the Right Thing!
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', maxWidth: '520px', margin: '0 auto 1.5rem auto' }}>
            Your deposit is recorded. If an escrow cash reward was pledged by the owner, it will transfer directly to your UPI (<code>{submittedItem.finder_upi_id}</code>) upon verified physical handover.
          </p>

          <div className="review-box" style={{ textAlign: 'left', margin: '0 auto 1.5rem auto' }}>
            <div className="review-row"><span>Deposit ID:</span><code>{submittedItem.id}</code></div>
            <div className="review-row"><span>Item:</span><strong>{submittedItem.object_name}</strong></div>
            <div className="review-row"><span>Custody Mode:</span><span>{submittedItem.submission_type}</span></div>
            <div className="review-row"><span>Reward Account:</span><span><code>{submittedItem.finder_upi_id}</code></span></div>
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/status?q=${encodeURIComponent(submittedItem.finder_phone)}`)}
            >
              <i className="bi bi-speedometer2"></i> View in Tracking Dashboard
            </button>
            <button
              type="button"
              className="btn btn-outline"
              onClick={() => {
                setSubmittedItem(null);
                setStep(1);
              }}
            >
              <i className="bi bi-plus-circle"></i> Report Another Item
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="main-content" style={{ maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <span className="badge badge-found"><i className="bi bi-box-seam"></i> Found Property</span>
          <h1 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>Report a Found Item</h1>
        </div>
        <button type="button" className="btn btn-outline btn-sm" onClick={autofillSample}>
          <i className="bi bi-magic"></i> Autofill Sample: Found MacBook
        </button>
      </div>

      {/* Stepper Indicator */}
      <div className="wizard-progress">
        <div className="wizard-progress-bar">
          <div className="wizard-progress-fill" style={{ width: `${((step - 1) / 4) * 100}%` }}></div>
        </div>
        {[
          { num: 1, label: 'Item & Photo' },
          { num: 2, label: 'Custody Option' },
          { num: 3, label: 'Location & Time' },
          { num: 4, label: 'Finder Details' },
          { num: 5, label: 'Review & Submit' }
        ].map(n => (
          <div key={n.num} className={`wizard-step-node ${step === n.num ? 'active' : (step > n.num ? 'completed' : '')}`}>
            <div className="wizard-node-circle">{step > n.num ? '✓' : n.num}</div>
            <span className="wizard-node-label">{n.label}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1: Item Details & Primary Photo */}
        {step === 1 && (
          <div className="form-card">
            <h3>Step 1: Item Information &amp; Photo</h3>
            <div className="form-row">
              <div className="form-group flex-2">
                <label>Item Name / Description *</label>
                <input 
                  type="text" 
                  name="object_name" 
                  className="form-control" 
                  placeholder="e.g. MacBook Pro 14 Laptop in Dark Protective Cover" 
                  value={formData.object_name} 
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
                placeholder="Describe visible condition, exterior brand, color, where it was resting..." 
                value={formData.description} 
                onChange={handleChange} 
                required 
              />
            </div>

            <div className="form-group">
              <label>Primary Overview Photo *</label>
              <input type="file" accept="image/*" className="form-control" onChange={handlePhotoUpload} />
              {formData.primary_photo && (
                <div style={{ marginTop: '0.75rem', textAlign: 'center' }}>
                  <img 
                    src={formData.primary_photo} 
                    alt="Found item preview" 
                    style={{ maxHeight: '180px', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-light)' }} 
                  />
                </div>
              )}
            </div>

            <div className="wizard-actions">
              <div></div>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  if (!formData.object_name.trim() || !formData.description.trim()) {
                    toast.error('Please enter item name and description');
                  } else {
                    setStep(2);
                  }
                }}
              >
                Next: Custody Option <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Custody Option */}
        {step === 2 && (
          <div className="form-card">
            <h3>Step 2: Physical Custody Method</h3>
            <p className="field-hint">Choose where the item will be held during owner matching and handover.</p>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', margin: '1rem 0' }}>
              <div 
                className={`form-card ${custodyMode === 'desk' ? 'selected-card' : ''}`}
                style={{ cursor: 'pointer', border: custodyMode === 'desk' ? '2px solid var(--color-primary)' : '1px solid var(--border-light)' }}
                onClick={() => setCustodyMode('desk')}
              >
                <div style={{ fontSize: '1.8rem', color: 'var(--color-primary)' }}><i className="bi bi-building-check"></i></div>
                <h4 style={{ margin: '0.5rem 0 0.25rem 0' }}>Official Security Desk</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Safely deposit the item at a 24/7 campus security desk. Duty officer coordinates physical return.
                </p>
              </div>

              <div 
                className={`form-card ${custodyMode === 'direct' ? 'selected-card' : ''}`}
                style={{ cursor: 'pointer', border: custodyMode === 'direct' ? '2px solid var(--color-primary)' : '1px solid var(--border-light)' }}
                onClick={() => setCustodyMode('direct')}
              >
                <div style={{ fontSize: '1.8rem', color: '#059669' }}><i className="bi bi-person-badge"></i></div>
                <h4 style={{ margin: '0.5rem 0 0.25rem 0' }}>Keep in My Custody</h4>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  Retain the item with you. You will meet the owner at an official desk only once match is confirmed.
                </p>
              </div>
            </div>

            {custodyMode === 'desk' && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Select Partner Security Desk *</label>
                <select name="desk_id" className="form-control" value={formData.desk_id} onChange={handleChange} required>
                  {desks.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.building_or_zone})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="wizard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button type="button" className="btn btn-primary" onClick={() => setStep(3)}>
                Next: Location &amp; Time <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Location & Time */}
        {step === 3 && (
          <div className="form-card">
            <h3>Step 3: Where &amp; When Did You Find It?</h3>
            <div className="form-group">
              <label>Found Location / Landmark *</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  name="location" 
                  className="form-control" 
                  style={{ flex: 1, minWidth: '240px' }} 
                  placeholder="e.g. Central Library Study Section Table 12" 
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
              <label>Date &amp; Time Found *</label>
              <input 
                type="datetime-local" 
                name="found_time" 
                className="form-control" 
                value={formData.found_time} 
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
                  if (!formData.location.trim()) {
                    toast.error('Please provide the found location');
                  } else {
                    setStep(4);
                  }
                }}
              >
                Next: Finder Details <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Finder Details & Reward UPI */}
        {step === 4 && (
          <div className="form-card">
            <h3>Step 4: Finder Information &amp; UPI Reward</h3>
            
            {isAutoFilled && (
              <div className="autofill-banner">
                <i className="bi bi-person-check-fill" style={{ color: 'var(--color-emerald)', fontSize: '1.1rem' }}></i>
                <span>Auto-filled from your saved profile. You can edit these details if needed.</span>
              </div>
            )}

            <div className="form-row">
              <div className="form-group flex-1">
                <label>Your Full Name *</label>
                <input 
                  type="text" 
                  name="finder_name" 
                  className="form-control" 
                  placeholder="Rahul Verma" 
                  value={formData.finder_name} 
                  onChange={handleChange} 
                  required 
                />
              </div>
              <div className="form-group flex-1">
                <label>Phone Number *</label>
                <input 
                  type="tel" 
                  name="finder_phone" 
                  className="form-control" 
                  placeholder="+91 91234 56789" 
                  value={formData.finder_phone} 
                  onChange={handleChange} 
                  required 
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group flex-1">
                <label>Email Address *</label>
                <input 
                  type="email" 
                  name="finder_email" 
                  className="form-control" 
                  placeholder="rahul.verma@campus.edu" 
                  value={formData.finder_email} 
                  onChange={handleChange} 
                  required 
                />
              </div>
              <div className="form-group flex-1">
                <label>Campus Roll / Govt ID</label>
                <input 
                  type="text" 
                  name="finder_roll_or_id" 
                  className="form-control" 
                  placeholder="2024CS042" 
                  value={formData.finder_roll_or_id} 
                  onChange={handleChange} 
                />
              </div>
            </div>

            <div className="form-group" style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', padding: '1rem', borderRadius: 'var(--radius-sm)' }}>
              <label style={{ color: '#166534' }}>UPI ID for Escrow Cash Reward Payout *</label>
              <input 
                type="text" 
                name="finder_upi_id" 
                className="form-control" 
                placeholder="e.g. rahul@okaxis, 9876543210@paytm" 
                value={formData.finder_upi_id} 
                onChange={handleChange} 
                required 
              />
              <span className="field-hint" style={{ color: '#15803d' }}>
                If the owner pledged a reward, funds transfer directly to this UPI upon verified physical return.
              </span>
            </div>

            <div className="wizard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStep(3)}>
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  if (!formData.finder_name || !formData.finder_phone || !formData.finder_upi_id) {
                    toast.error('Please provide finder name, phone, and UPI ID');
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
            <h3>Step 5: Confirm Deposit Details</h3>
            <div className="review-box">
              <div className="review-row"><span>Item:</span><strong>{formData.object_name}</strong></div>
              <div className="review-row"><span>Category:</span><strong>{formData.category}</strong></div>
              <div className="review-row"><span>Custody:</span><span>{custodyMode === 'desk' ? 'Official Security Desk' : 'Direct Finder Custody'}</span></div>
              <div className="review-row"><span>Location:</span><span>{formData.location}</span></div>
              <div className="review-row"><span>Finder:</span><span>{formData.finder_name} ({formData.finder_phone})</span></div>
              <div className="review-row"><span>Reward UPI:</span><code>{formData.finder_upi_id}</code></div>
            </div>

            <div className="wizard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStep(4)}>
                <i className="bi bi-arrow-left"></i> Edit Details
              </button>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                {loading ? <><i className="bi bi-hourglass-split"></i> Submitting...</> : <><i className="bi bi-check2-circle"></i> Complete Found Item Registration</>}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
