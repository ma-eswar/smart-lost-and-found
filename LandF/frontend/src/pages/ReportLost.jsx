import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { useToast } from '../components/Toast';
import { useAuth } from '../components/AuthContext';

const QUICK_QUESTION_TEMPLATES = [
  'What sticker, decal, or emblem is on the item?',
  'What is set as the lock screen wallpaper or casing color?',
  'What accessory or item is inside the case/pocket?',
  'Are there any specific scratches, cracks, or flaws?',
  'What is the last 4 digits of serial or brand tag text?'
];

export default function ReportLost() {
  const navigate = useNavigate();
  const toast = useToast();
  const { setAuthSession } = useAuth();
  const [step, setStep] = useState(1);
  const [loading, setLoading] = useState(false);
  const [geoStatus, setGeoStatus] = useState('');
  const [isAutoFilled, setIsAutoFilled] = useState(false);
  const [submittedItem, setSubmittedItem] = useState(null);

  const [formData, setFormData] = useState({
    product_name: '',
    category: 'Electronics',
    description: '',
    reference_photos: [],
    reward_amount: 0,
    confirmation_points: [''],
    location: '',
    latitude: 12.9725,
    longitude: 77.5958,
    last_seen_time: new Date().toISOString().slice(0, 16),
    owner_name: '',
    owner_phone: '',
    backup_contact: '',
    owner_email: '',
    institutional_id: '',
    residential_address: 'Campus Hostel Block C'
  });

  const handlePhotoUpload = (e) => {
    const files = Array.from(e.target.files);
    if (!files.length) return;
    files.forEach(file => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (reader.result) {
          setFormData(prev => ({
            ...prev,
            reference_photos: [...prev.reference_photos, reader.result].slice(0, 4)
          }));
        }
      };
      reader.readAsDataURL(file);
    });
  };

  const removePhoto = (idx) => {
    setFormData(prev => ({
      ...prev,
      reference_photos: prev.reference_photos.filter((_, i) => i !== idx)
    }));
  };

  // Auto-fill profile details if available in localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem('user') || localStorage.getItem('saved_profile');
      if (stored) {
        const user = JSON.parse(stored);
        if (user.full_name || user.phone || user.email) {
          setFormData(prev => ({
            ...prev,
            owner_name: user.full_name || user.name || prev.owner_name,
            owner_phone: user.phone || prev.owner_phone,
            owner_email: user.email || prev.owner_email,
            institutional_id: user.institutional_id || user.roll_no || prev.institutional_id,
            residential_address: user.address || prev.residential_address
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

  const handlePointChange = (index, value) => {
    setFormData(prev => {
      const updated = [...prev.confirmation_points];
      updated[index] = value;
      return { ...prev, confirmation_points: updated };
    });
  };

  const addPoint = () => {
    if (formData.confirmation_points.length >= 3) {
      toast.info('You can add up to 3 confirmation details.');
      return;
    }
    setFormData(prev => ({
      ...prev,
      confirmation_points: [...prev.confirmation_points, '']
    }));
  };

  const removePoint = (index) => {
    if (formData.confirmation_points.length <= 1) {
      toast.info('At least one confirmation detail is required.');
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
        'Small hairline crack on the right hinge directly next to the power button',
        'Tiny blue GitHub Octocat sticker on the right palm rest edge'
      ],
      location: 'Central Library 2nd Floor, Table 14',
      latitude: 12.9725,
      longitude: 77.5958,
      last_seen_time: new Date().toISOString().slice(0, 16),
      owner_name: 'Aarav Sharma',
      owner_phone: '+91 98765 43210',
      backup_contact: '+91 98765 00000 (Rohan - Roommate)',
      owner_email: 'aarav.sharma@campus.edu',
      institutional_id: '2024CS042',
      residential_address: 'Campus Hostel Block C'
    });
    toast.success('Sample report data loaded. Proceed through steps to review.');
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
        setGeoStatus('Standard campus coordinates retained.');
        toast.info('Could not obtain live GPS. Standard coordinates retained.');
      }
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    const validPoints = formData.confirmation_points
      .map(p => typeof p === 'string' ? p.trim() : (p.point || '').trim())
      .filter(p => p.length > 0)
      .map(p => ({
        question: 'Ownership Confirmation Detail',
        point: p,
        photo_url: null
      }));

    if (validPoints.length === 0) {
      toast.error('Please provide at least one ownership confirmation detail.');
      setLoading(false);
      setStep(2);
      return;
    }

    const payload = {
      product_name: formData.product_name.trim(),
      category: formData.category,
      description: formData.description.trim(),
      reference_photos: formData.reference_photos || [],
      secret_points: validPoints,
      reward_amount: parseFloat(formData.reward_amount || 0),
      reward_currency: 'INR',
      owner_name: formData.owner_name.trim(),
      owner_phone: formData.owner_phone.trim(),
      backup_contact: formData.backup_contact.trim(),
      owner_email: formData.owner_email.trim(),
      residential_address: formData.residential_address.trim() || 'Campus Hostel Block C',
      institutional_id: formData.institutional_id.trim() || 'ID-VERIFIED',
      last_seen_location: formData.location.trim(),
      latitude: formData.latitude,
      longitude: formData.longitude,
      last_seen_time: formData.last_seen_time
    };

    try {
      const res = await api.createLostItem(payload);
      if (res.user && res.auth_token) {
        setAuthSession(res.user, res.auth_token);
      }
      localStorage.setItem('last_user_phone', payload.owner_phone);
      localStorage.setItem('saved_profile', JSON.stringify({
        full_name: payload.owner_name,
        phone: payload.owner_phone,
        email: payload.owner_email,
        institutional_id: payload.institutional_id,
        address: payload.residential_address
      }));
      setSubmittedItem(res);
      toast.success('Lost item report filed! Continuous background matching started.');
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
          <div className="reassurance-icon-wrapper">
            <i className="bi bi-shield-check reassurance-icon"></i>
          </div>
          <span className="badge badge-verified" style={{ margin: '0.5rem auto 1rem auto' }}>
            <i className="bi bi-radar"></i> Active Search in Progress
          </span>
          <h2 style={{ fontSize: '1.75rem', fontWeight: 800, marginBottom: '0.5rem' }}>
            We've Received Your Report
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.98rem', maxWidth: '520px', margin: '0 auto 1.5rem auto' }}>
            Our automated matching engine is actively scanning incoming and existing property deposits. You will receive an immediate alert and SMS when a verified match appears.
          </p>

          <div className="review-box" style={{ textAlign: 'left', margin: '0 auto 1.5rem auto' }}>
            <div className="review-row"><span>Report ID:</span><code>{submittedItem.id}</code></div>
            <div className="review-row"><span>Item:</span><strong>{submittedItem.product_name}</strong></div>
            <div className="review-row"><span>Category:</span><span>{submittedItem.category}</span></div>
            <div className="review-row"><span>Location:</span><span>{submittedItem.last_seen_location}</span></div>
            {submittedItem.reward_amount > 0 && (
              <div className="review-row"><span>Pledged Reward:</span><strong>₹{submittedItem.reward_amount}</strong></div>
            )}
          </div>

          <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => navigate(`/status?q=${encodeURIComponent(submittedItem.owner_phone)}`)}
            >
              <i className="bi bi-speedometer2"></i> Go to My Dashboard
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
              <span className="field-hint">Held securely in escrow until you verify and collect the item at the desk.</span>
            </div>

            <div className="form-group" style={{ marginTop: '0.75rem' }}>
              <label>Product Reference Photos (Optional)</label>
              <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap', marginTop: '0.25rem' }}>
                <label className="btn btn-outline btn-sm" style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '0.4rem' }}>
                  <i className="bi bi-camera-fill"></i> Upload Images (Max 4)
                  <input type="file" accept="image/*" multiple onChange={handlePhotoUpload} style={{ display: 'none' }} />
                </label>
                <span className="field-hint">Upload previous photos, invoice, or packaging to aid visual matching if available.</span>
              </div>
              {formData.reference_photos && formData.reference_photos.length > 0 && (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginTop: '0.75rem' }}>
                  {formData.reference_photos.map((src, idx) => (
                    <div key={idx} style={{ position: 'relative', width: '80px', height: '80px', borderRadius: '6px', overflow: 'hidden', border: '1px solid var(--border-medium)' }}>
                      <img src={src} alt="Reference" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                      <button 
                        type="button" 
                        onClick={() => removePhoto(idx)} 
                        style={{ 
                          position: 'absolute', 
                          top: '2px', 
                          right: '2px', 
                          background: 'rgba(0,0,0,0.65)', 
                          color: '#fff', 
                          border: 'none', 
                          borderRadius: '50%', 
                          width: '20px', 
                          height: '20px', 
                          fontSize: '0.75rem', 
                          cursor: 'pointer', 
                          display: 'flex', 
                          alignItems: 'center', 
                          justifyContent: 'center' 
                        }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="wizard-actions">
              <div></div>
              <button 
                type="button" 
                className="btn btn-primary" 
                onClick={() => {
                  if (!formData.product_name.trim() || !formData.description.trim()) {
                    toast.error('Please provide item name and description');
                  } else {
                    setStep(2);
                  }
                }}
              >
                Next: Ownership Proof <i className="bi bi-arrow-right"></i>
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Ownership Confirmation Details (Up to 3 Inputs) */}
        {step === 2 && (
          <div className="form-card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.5rem' }}>
              <div>
                <h3>Step 2: Special Ownership Confirmation Details</h3>
                <p className="field-hint" style={{ color: 'var(--text-secondary)', marginBottom: '1rem' }}>
                  Provide <strong>1 to 3 secret identifying details</strong> that only you know (e.g., unique scratch, sticker, wallpaper, inside pocket item, serial prefix).
                  <br />
                  <span style={{ color: '#059669', fontWeight: 600 }}>
                    <i className="bi bi-shield-lock"></i> 100% Confidential — never revealed to finders or public.
                  </span>
                </p>
              </div>
              <span className="badge badge-neutral" style={{ fontSize: '0.85rem' }}>
                {formData.confirmation_points.length} / 3 Details
              </span>
            </div>

            {formData.confirmation_points.map((pt, idx) => {
              const val = typeof pt === 'string' ? pt : (pt.point || '');
              return (
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

                  <div className="form-group" style={{ marginBottom: '0' }}>
                    <input 
                      type="text" 
                      className="form-control" 
                      placeholder={
                        idx === 0 
                          ? "e.g. Small hairline scratch on right hinge directly next to power button" 
                          : (idx === 1 
                              ? "e.g. Tiny blue Octocat sticker on right palm rest" 
                              : "e.g. Kingston 32GB USB drive inside side zip pocket")
                      }
                      value={val} 
                      onChange={(e) => handlePointChange(idx, e.target.value)} 
                      required={idx === 0}
                    />
                    <span className="field-hint" style={{ fontSize: '0.78rem', marginTop: '0.35rem' }}>
                      During recovery, the finder or desk will verify this exact spot without knowing what is located there.
                    </span>
                  </div>
                </div>
              );
            })}

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
                  const firstVal = typeof formData.confirmation_points[0] === 'string' 
                    ? formData.confirmation_points[0].trim() 
                    : (formData.confirmation_points[0]?.point || '').trim();
                  if (!firstVal) {
                    toast.error('Please provide at least one ownership confirmation detail.');
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
                  if (!formData.location.trim() || !formData.last_seen_time) {
                    toast.error('Please provide location and estimated time');
                  } else {
                    setStep(4);
                  }
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

            {isAutoFilled && (
              <div className="autofill-banner">
                <i className="bi bi-person-check-fill" style={{ color: 'var(--color-emerald)', fontSize: '1.1rem' }}></i>
                <span>Auto-filled from your saved profile. You can edit these details if needed.</span>
              </div>
            )}

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
                    toast.error('Please complete all contact details');
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
                <span>Ownership Details ({formData.confirmation_points.map(p => typeof p === 'string' ? p : (p.point || '')).filter(p => p.trim().length > 0).length}):</span>
                <div>
                  {formData.confirmation_points
                    .map(p => typeof p === 'string' ? p : (p.point || ''))
                    .filter(p => p.trim().length > 0)
                    .map((p, i) => (
                      <div key={i} style={{ marginBottom: '0.35rem' }}>
                        <span style={{ color: 'var(--text-secondary)', fontSize: '0.82rem' }}>Detail #{i+1}:</span>
                        <div><strong>{p}</strong></div>
                      </div>
                    ))}
                </div>
              </div>

              <div className="review-row"><span>Reward:</span><strong>₹{formData.reward_amount || '0'}</strong></div>
              {formData.reference_photos && formData.reference_photos.length > 0 && (
                <div className="review-row" style={{ alignItems: 'flex-start' }}>
                  <span>Reference Photos ({formData.reference_photos.length}):</span>
                  <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                    {formData.reference_photos.map((src, idx) => (
                      <img key={idx} src={src} alt="Reference" style={{ width: '48px', height: '48px', objectFit: 'cover', borderRadius: '4px', border: '1px solid var(--border-medium)' }} />
                    ))}
                  </div>
                </div>
              )}
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
