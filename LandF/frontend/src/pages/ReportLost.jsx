import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';

const QUICK_QUESTION_TEMPLATES = [
  'What sticker, decal, or emblem is on the item?',
  'What is set as the lock screen wallpaper or casing color?',
  'What accessory or item is inside the case/pocket?',
  'Are there any specific scratches, cracks, or flaws?',
  'What is the last 4 digits of serial or brand tag text?'
];

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
    confirmation_points: [
      {
        question: 'What unique sticker, scratch, or marking is on the item?',
        point: ''
      }
    ],
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

  // Handlers for dynamic confirmation points (up to 3)
  const handlePointChange = (index, field, value) => {
    setFormData(prev => {
      const updated = [...prev.confirmation_points];
      updated[index] = { ...updated[index], [field]: value };
      return { ...prev, confirmation_points: updated };
    });
  };

  const addPoint = () => {
    if (formData.confirmation_points.length >= 3) {
      alert('You can add up to 3 confirmation details / questions.');
      return;
    }
    setFormData(prev => ({
      ...prev,
      confirmation_points: [
        ...prev.confirmation_points,
        { question: '', point: '' }
      ]
    }));
  };

  const removePoint = (index) => {
    if (formData.confirmation_points.length <= 1) {
      alert('At least one confirmation detail is required.');
      return;
    }
    setFormData(prev => ({
      ...prev,
      confirmation_points: prev.confirmation_points.filter((_, i) => i !== index)
    }));
  };

  const autofillSample = () => {
    setFormData({
      product_name: 'Apple MacBook Pro 14 M2 Space Gray',
      category: 'Electronics',
      description: 'Space Gray 14-inch MacBook Pro M2 with matte display and dark case.',
      reward_amount: 2000,
      confirmation_points: [
        {
          question: 'What physical mark or flaw is on the hinge/casing?',
          point: 'Small hairline crack on the right hinge directly next to the power button'
        },
        {
          question: 'What is set on the keyboard palm rest area?',
          point: 'A tiny blue GitHub Octocat sticker near the right bottom edge'
        }
      ],
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

    const validPoints = formData.confirmation_points
      .filter(p => p.point.trim().length > 0)
      .map(p => ({
        question: p.question.trim() || 'Confirmation Detail',
        point: p.point.trim(),
        photo_url: null
      }));

    if (validPoints.length === 0) {
      alert('Please provide at least one ownership confirmation detail / answer.');
      setLoading(false);
      setStep(2);
      return;
    }

    const payload = {
      product_name: formData.product_name.trim(),
      category: formData.category,
      description: formData.description.trim(),
      reference_photos: [],
      secret_points: validPoints,
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
          { num: 2, label: 'Ownership Proof' },
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
                placeholder="Describe color, casing, brand, visible specifications..." 
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
                Next: Ownership Proof <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Special Ownership Confirmation Details (Up to 3 Questions) */}
        {step === 2 && (
          <div className="form-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3>Step 2: Special Ownership Confirmation Details</h3>
                <p className="field-hint" style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Provide <strong>1 to 3 special identifying details or confirmation questions</strong> that only the genuine owner would know (e.g. unique scratch, stickers, lock screen wallpaper, internal pocket contents).
                  <br />
                  <span style={{ color: '#059669', fontWeight: 500 }}>
                    <i className="bi bi-shield-lock"></i> Kept 100% confidential — never revealed to the public or finders.
                  </span>
                </p>
              </div>
              <span className="badge badge-neutral" style={{ fontSize: '0.85rem' }}>
                {formData.confirmation_points.length} / 3 Details Added
              </span>
            </div>

            {formData.confirmation_points.map((pt, idx) => (
              <div 
                key={idx} 
                style={{ 
                  background: 'var(--color-slate-50, #f8fafc)', 
                  border: '1px solid var(--color-slate-200, #e2e8f0)', 
                  borderRadius: 'var(--radius-sm, 8px)', 
                  padding: '1.25rem', 
                  marginBottom: '1rem' 
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                  <strong style={{ fontSize: '0.95rem' }}>
                    <i className="bi bi-patch-check-fill" style={{ color: 'var(--color-primary)' }}></i> Confirmation Detail #{idx + 1} {idx === 0 ? '(Required)' : '(Optional)'}
                  </strong>
                  {formData.confirmation_points.length > 1 && (
                    <button 
                      type="button" 
                      className="btn btn-outline btn-sm" 
                      style={{ color: '#dc2626', borderColor: '#fca5a5' }} 
                      onClick={() => removePoint(idx)}
                    >
                      <i className="bi bi-trash"></i> Remove
                    </button>
                  )}
                </div>

                <div className="form-group" style={{ marginBottom: '0.75rem' }}>
                  <label style={{ fontSize: '0.88rem' }}>Verification Question / Feature Title</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. What sticker is on the laptop, or what is in the side pocket?" 
                    value={pt.question} 
                    onChange={(e) => handlePointChange(idx, 'question', e.target.value)} 
                  />
                  
                  {/* Preset Template Chips */}
                  <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.4rem' }}>
                    {QUICK_QUESTION_TEMPLATES.map((tpl, tplIdx) => (
                      <button
                        key={tplIdx}
                        type="button"
                        className="badge"
                        style={{ 
                          background: '#e0f2fe', 
                          color: '#0369a1', 
                          border: '1px solid #bae6fd', 
                          cursor: 'pointer', 
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.75rem',
                          fontWeight: 500
                        }}
                        onClick={() => handlePointChange(idx, 'question', tpl)}
                      >
                        + {tpl.split(' ').slice(0, 4).join(' ')}...
                      </button>
                    ))}
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: '0' }}>
                  <label style={{ fontSize: '0.88rem' }}>Confidential Detail / Answer *</label>
                  <input 
                    type="text" 
                    className="form-control" 
                    placeholder="e.g. Small hairline crack on right hinge directly next to power button" 
                    value={pt.point} 
                    onChange={(e) => handlePointChange(idx, 'point', e.target.value)} 
                    required={idx === 0}
                  />
                  <span className="field-hint" style={{ fontSize: '0.78rem' }}>
                    The finder will be asked to verify or photograph this specific area without being told what is there.
                  </span>
                </div>
              </div>
            ))}

            {formData.confirmation_points.length < 3 && (
              <button 
                type="button" 
                className="btn btn-outline" 
                style={{ width: '100%', marginBottom: '1.25rem', borderStyle: 'dashed' }} 
                onClick={addPoint}
              >
                <i className="bi bi-plus-circle"></i> Add Another Confirmation Detail (Max 3)
              </button>
            )}

            <div className="wizard-actions">
              <button type="button" className="btn btn-outline" onClick={() => setStep(1)}>
                <i className="bi bi-arrow-left"></i> Back
              </button>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  if (!formData.confirmation_points[0].point.trim()) {
                    alert('Please provide at least one ownership confirmation detail.');
                  } else {
                    setStep(3);
                  }
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
              
              <div className="review-row" style={{ alignItems: 'flex-start' }}>
                <span>Ownership Confirmation ({formData.confirmation_points.filter(p => p.point).length}):</span>
                <div>
                  {formData.confirmation_points.filter(p => p.point).map((p, i) => (
                    <div key={i} style={{ marginBottom: '0.35rem' }}>
                      <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Q{i+1}: {p.question || 'Identifying Feature'}</span>
                      <div><strong>{p.point}</strong></div>
                    </div>
                  ))}
                </div>
              </div>

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
