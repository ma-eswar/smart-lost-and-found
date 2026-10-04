import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const DEFAULT_SAMPLE_PHOTO = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='400' height='300'><rect width='400' height='300' fill='%23334155'/><text x='200' y='150' fill='%23fff' text-anchor='middle'>Found MacBook</text></svg>";

export default function ReportFound() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [desks, setDesks] = useState([]);
  const [geoStatus, setGeoStatus] = useState('');
  const [custodyMode, setCustodyMode] = useState('desk'); // 'desk' or 'direct'

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
    alert('Sample matching found report loaded! Click through steps to review and submit.');
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
        setGeoStatus('Standard coordinates retained.');
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
      alert(`Found item registered! ID: ${res.id}\nRedirecting to tracking dashboard.`);
      navigate(`/status?q=${encodeURIComponent(payload.finder_phone)}`);
    } catch (err) {
      alert(err.message || 'Submission failed');
      setLoading(false);
    }
  };

  return (
    <div className="main-content" style={{ maxWidth: '800px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '0.75rem' }}>
        <div>
          <span className="badge badge-found"><i className="bi bi-box-seam"></i> Found Property</span>
          <h1 style={{ fontSize: '1.8rem', marginTop: '0.25rem' }}>Report a Found Item</h1>
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
          { num: 1, label: 'Custody Mode' },
          { num: 2, label: 'Item Details' },
          { num: 3, label: 'Location' },
          { num: 4, label: 'Finder & Reward' },
          { num: 5, label: 'Review & Submit' }
        ].map(n => (
          <div key={n.num} className={`wizard-step-node ${step === n.num ? 'active' : (step > n.num ? 'completed' : '')}`}>
            <div className="wizard-node-circle">{step > n.num ? '✓' : n.num}</div>
            <span className="wizard-node-label">{n.label}</span>
          </div>
        ))}
      </div>

      <form onSubmit={handleSubmit}>
        {/* Step 1: Custody Mode */}
        {step === 1 && (
          <div className="form-card">
            <h3>Step 1: Where is the Item Right Now?</h3>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
              <div 
                className="form-card" 
                style={{ cursor: 'pointer', border: custodyMode === 'desk' ? '2px solid #18181b' : '1px solid var(--border-light)' }} 
                onClick={() => setCustodyMode('desk')}
              >
                <strong><i className="bi bi-building"></i> Path A: Deposited at Security Desk</strong>
                <p className="field-hint">You dropped it off with a duty officer at an official campus desk.</p>
              </div>
              <div 
                className="form-card" 
                style={{ cursor: 'pointer', border: custodyMode === 'direct' ? '2px solid #18181b' : '1px solid var(--border-light)' }} 
                onClick={() => setCustodyMode('direct')}
              >
                <strong><i className="bi bi-person-check"></i> Path B: Keeping with Myself</strong>
                <p className="field-hint">You have the item in your possession until true owner verifies.</p>
              </div>
            </div>

            {custodyMode === 'desk' && (
              <div className="form-group" style={{ marginTop: '1rem' }}>
                <label>Select Campus Custody Desk *</label>
                <select name="desk_id" className="form-control" value={formData.desk_id} onChange={handleChange}>
                  {desks.map(d => (
                    <option key={d.id} value={d.id}>{d.name} ({d.building_or_zone})</option>
                  ))}
                </select>
              </div>
            )}

            <div className="wizard-actions">
              <div></div>
              <button type="button" className="btn btn-primary" onClick={() => setStep(2)}>
                Next: Item Details <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Item Details & Photo */}
        {step === 2 && (
          <div className="form-card">
            <h3>Step 2: Item Information &amp; Photo</h3>
            <div className="form-row">
              <div className="form-group flex-2">
                <label>Item Name *</label>
                <input 
                  type="text" 
                  name="object_name" 
                  className="form-control" 
                  placeholder="e.g. MacBook Pro 14 Laptop in Dark Cover" 
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
              <label>Visible Description *</label>
              <textarea 
                name="description" 
                className="form-control" 
                rows="3" 
                placeholder="Describe visible exterior traits..." 
                value={formData.description} 
                onChange={handleChange} 
                required 
              />
            </div>
            <div className="form-group">
              <label>Photo of the Item</label>
              <input type="file" accept="image/*" className="form-control" onChange={handlePhotoUpload} />
              {formData.primary_photo && (
                <div style={{ marginTop: '0.5rem' }}>
                  <img src={formData.primary_photo} alt="Preview" style={{ maxHeight: '100px', borderRadius: '4px', border: '1px solid var(--border-light)' }} />
                </div>
              )}
            </div>
            <div className="wizard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  if (!formData.object_name || !formData.description) alert('Please complete required fields');
                  else setStep(3);
                }}
              >
                Next: Location <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Location Found */}
        {step === 3 && (
          <div className="form-card">
            <h3>Step 3: Where Did You Find It?</h3>
            <div className="form-group">
              <label>Found Location / Landmark *</label>
              <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                <input 
                  type="text" 
                  name="location" 
                  className="form-control" 
                  style={{ flex: 1, minWidth: '240px' }} 
                  placeholder="e.g. Central Library Study Section" 
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
              <label>Found Date &amp; Time *</label>
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
                  if (!formData.location || !formData.found_time) alert('Please provide location and time');
                  else setStep(4);
                }}
              >
                Next: Finder &amp; Reward <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 4: Finder Details & Reward UPI */}
        {step === 4 && (
          <div className="form-card">
            <h3>Step 4: Your Contact &amp; Reward Info</h3>
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
                <label>Contact Phone Number *</label>
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
                <label>Your UPI ID for Reward *</label>
                <input 
                  type="text" 
                  name="finder_upi_id" 
                  className="form-control" 
                  placeholder="rahul@okaxis" 
                  value={formData.finder_upi_id} 
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
                  if (!formData.finder_name || !formData.finder_phone || !formData.finder_upi_id) {
                    alert('Please complete contact & reward info');
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
            <h3>Step 5: Review &amp; Submit</h3>
            <div className="review-box">
              <div className="review-row"><span>Custody Mode:</span><strong>{custodyMode === 'desk' ? 'Campus Security Desk' : 'Personal Custody'}</strong></div>
              <div className="review-row"><span>Item Name:</span><strong>{formData.object_name}</strong></div>
              <div className="review-row"><span>Category:</span><strong>{formData.category}</strong></div>
              <div className="review-row"><span>Found Location:</span><strong>{formData.location}</strong></div>
              <div className="review-row"><span>Finder Name:</span><strong>{formData.finder_name}</strong></div>
              <div className="review-row"><span>Reward UPI:</span><code>{formData.finder_upi_id}</code></div>
            </div>
            <div className="wizard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStep(4)}>
                <i className="bi bi-arrow-left"></i> Edit Details
              </button>
              <button type="submit" className="btn btn-primary btn-lg" disabled={loading}>
                {loading ? <><i className="bi bi-hourglass-split"></i> Submitting...</> : <><i className="bi bi-check2-circle"></i> Confirm &amp; Submit Found Report</>}
              </button>
            </div>
          </div>
        )}
      </form>
    </div>
  );
}
