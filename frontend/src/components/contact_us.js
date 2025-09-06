import React, { useState, useRef, useEffect } from 'react';
import { Modal, Button } from 'react-bootstrap';

const API_BASE_URL = process.env.API_BACKEND_URL || "http://localhost:5001"


const Contact = () => {
  // Form state
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    subject: '',
    message: ''
  });

  const [errors, setErrors] = useState({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [formError, setFormError] = useState('');

  const phoneInputRef = useRef(null);

  // Handle input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));

    // Clear specific error when field changes
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  useEffect(() => {
    document.title = "Contact Us | Zorvixe Technologies";
  }, []);

  // Validate name field (only letters and spaces)
  const validateName = (e) => {
    const key = e.key;
    if (!/^[a-zA-Z\s]$/.test(key) &&
      key !== 'Backspace' &&
      key !== 'Delete' &&
      key !== 'Tab' &&
      key !== 'ArrowLeft' &&
      key !== 'ArrowRight') {
      e.preventDefault();
    }
  };

  // Phone validation on key press
  const validatePhone = (e) => {
    const key = e.key;
    const value = e.target.value;

    // Allow control keys
    if (
      key === 'Backspace' ||
      key === 'Delete' ||
      key === 'Tab' ||
      key === 'ArrowLeft' ||
      key === 'ArrowRight'
    ) {
      return;
    }

    // Prevent non-numeric input
    if (!/^[0-9]$/.test(key)) {
      e.preventDefault();
      return;
    }

    // First digit validation
    if (value.length === 0 && !/[6-9]/.test(key)) {
      e.preventDefault();
      setErrors(prev => ({ ...prev, phone: 'Phone number must start with 6-9' }));
    }
  };

  // Clear phone error when typing
  const handlePhoneInput = () => {
    if (errors.phone) {
      setErrors(prev => ({ ...prev, phone: '' }));
    }
  };

  // Validate the entire form
  const validateForm = () => {
    const newErrors = {};

    if (!formData.name.trim()) {
      newErrors.name = 'Name is required';
    } else if (formData.name.trim().length < 3) {
      newErrors.name = 'Name must be at least 3 characters';
    }

    if (!formData.email) {
      newErrors.email = 'Email is required';
    } else if (!/^[^@]+@[^@]+\.[a-zA-Z]{2,6}$/.test(formData.email)) {
      newErrors.email = 'Invalid email format';
    }

    if (!formData.phone) {
      newErrors.phone = 'Phone number is required';
    } else if (formData.phone.length < 10) {
      newErrors.phone = 'Phone number must be 10 digits';
    } else if (!/^[6-9]/.test(formData.phone)) {
      newErrors.phone = 'Phone number must start with 6-9';
    }

    if (!formData.subject) {
      newErrors.subject = 'Please select a service';
    }

    if (!formData.message.trim()) {
      newErrors.message = 'Message is required';
    } else if (formData.message.trim().length < 10) {
      newErrors.message = 'Message must be at least 10 characters';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!validateForm()) return;

    setIsSubmitting(true);

    try {
      const response = await fetch(`${API_BASE_URL}/api/contact/submit`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (!response.ok) {
        // Handle server validation errors
        if (data.errors) {
          setErrors(data.errors);
        } else {
          throw new Error(data.message || 'Failed to submit form');
        }
        return;
      }

      // Clear form
      setFormData({
        name: '',
        email: '',
        phone: '',
        subject: '',
        message: ''
      });

      // Show success modal
      setShowModal(true);
    } catch (error) {
      setFormError(error.message || 'There was an error sending your message. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section id="contact" className="contact section hero">
      {/* Section Title */}
      <div className="container section-title" data-aos="fade-up">
        <h2>Contact</h2>
        <p>
          Have a project in mind? Let's connect and bring it to life. We're here to answer your questions and get started.
        </p>
      </div>

      <div className="container" data-aos="fade-up" data-aos-delay="100">
        <div className="row gy-4 mb-5">
          {/* Address Card */}
          <div className="col-lg-4" data-aos="fade-up" data-aos-delay="100">
            <div className="info-card">
              <div className="icon-box">
                <i className="bi bi-geo-alt"></i>
              </div>
              <h3>Our Address</h3>
              <p>Kurnool Andhra Pradesh, Hyderabad, Banglore</p>
            </div>
          </div>

          {/* Contact Card */}
          <div className="col-lg-4" data-aos="fade-up" data-aos-delay="200">
            <div className="info-card">
              <div className="icon-box">
                <i className="bi bi-telephone"></i>
              </div>
              <h3>Contact Number</h3>
              <p>Mobile: +91 8328590444 / 7993971574<br />

                Email: zorvixe@gmail.com
              </p>
            </div>
          </div>

          {/* Hours Card */}
          <div className="col-lg-4" data-aos="fade-up" data-aos-delay="300">
            <div className="info-card">
              <div className="icon-box">
                <i className="bi bi-clock"></i>
              </div>
              <h3>Opening Hour</h3>
              <p>
                Monday - Friday: 9:00 - 18:00<br />
                Saturday & Sunday: Closed
              </p>
            </div>
          </div>
        </div>

        {/* Contact Form */}
        <div className="row">
          <div className="col-lg-12">
            <div className="form-wrapper" data-aos="fade-up" data-aos-delay="400">
              <form onSubmit={handleSubmit} id="contactForm">
                <div className="row">
                  {/* Name Field */}
                  <div className="col-md-6 form-group mb-3">
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="bi bi-person"></i>
                      </span>
                      <input
                        type="text"
                        name="name"
                        className={`form-control ${errors.name ? 'is-invalid' : ''}`}
                        placeholder="Your name*"
                        value={formData.name}
                        onChange={handleChange}
                        onKeyDown={validateName}
                      />
                    </div>
                    {errors.name && <div className="error mt-1">{errors.name}</div>}
                  </div>

                  {/* Email Field */}
                  <div className="col-md-6 form-group mb-3">
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="bi bi-envelope"></i>
                      </span>
                      <input
                        type="email"
                        className={`form-control ${errors.email ? 'is-invalid' : ''}`}
                        name="email"
                        placeholder="Email address*"
                        value={formData.email}
                        onChange={handleChange}
                      />
                    </div>
                    {errors.email && <div className="error mt-1">{errors.email}</div>}
                  </div>
                </div>

                <div className="row mt-3">
                  {/* Phone Field */}
                  <div className="col-md-6 form-group mb-3">
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="bi bi-phone"></i>
                      </span>
                      <input
                        type="text"
                        className={`form-control ${errors.phone ? 'is-invalid' : ''}`}
                        name="phone"
                        placeholder="Phone number*"
                        value={formData.phone}
                        onChange={handleChange}
                        onKeyDown={validatePhone}
                        onInput={handlePhoneInput}
                        ref={phoneInputRef}
                        maxLength={10}
                      />
                    </div>
                    {errors.phone && <div className="error mt-1">{errors.phone}</div>}
                  </div>

                  {/* Service Field */}
                  <div className="col-md-6 form-group mb-3">
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="bi bi-list"></i>
                      </span>
                      <select
                        name="subject"
                        className={`form-select ${errors.subject ? 'is-invalid' : ''}`}
                        value={formData.subject}
                        onChange={handleChange}
                      >
                        <option value="">Select service*</option>
                        <option value="Consulting">Consulting</option>
                        <option value="Development">Development</option>
                        <option value="Marketing">Marketing</option>
                        <option value="Support">Support</option>
                      </select>
                    </div>
                    {errors.subject && <div className="error mt-1">{errors.subject}</div>}
                  </div>
                </div>

                {/* Message Field */}
                <div className="form-group mt-3 mb-3">
                  <div className="input-group">
                    <span className="input-group-text">
                      <i className="bi bi-chat-dots"></i>
                    </span>
                    <textarea
                      className={`form-control ${errors.message ? 'is-invalid' : ''}`}
                      name="message"
                      rows="6"
                      placeholder="Write a message*"
                      value={formData.message}
                      onChange={handleChange}
                    ></textarea>
                  </div>
                  {errors.message && <div className="error mt-1">{errors.message}</div>}
                </div>

                {/* Form error message */}
                {formError && (
                  <div className="my-3">
                    <div className="error-message alert alert-danger">{formError}</div>
                  </div>
                )}

                {/* Submit Button */}
                <div className="text-center mt-4">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={isSubmitting}
                  >
                    {isSubmitting ? (
                      <>
                        <span className="spinner-border spinner-border-sm me-2" role="status" aria-hidden="true"></span>
                        Sending...
                      </>
                    ) : (
                      "Submit Message"
                    )}
                  </button>
                </div>
              </form>

              {/* Location Map */}
              <div className="col-12 mt-5">
                <div className="container-fluid px-0">
                  <h4 className="text-dark fw-bold mb-3 text-center">Location Map</h4>
                  <iframe
                    src="https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d3839.0827534094838!2d78.05315767379028!3d15.799589946602671!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x3bb5dd5e557536a7%3A0xbe34c8ed86df7365!2sSLV%20Builders%20%26%20Developers%20Kurnool%20City!5e0!3m2!1sen!2sin!4v1749577215363!5m2!1sen!2sin"
                    width="100%"
                    height="400"
                    style={{ border: 0 }}
                    allowFullScreen=""
                    loading="lazy"
                    title="Zorvixe"
                  ></iframe>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Success Modal */}
      <Modal show={showModal} onHide={() => setShowModal(false)} centered>
        <Modal.Header closeButton>
          <Modal.Title><img className='contact_zorvixe_logo' src='/miniassets/img/zorvixe_logo_main.png' alt='contact_zorvixe_logo' /></Modal.Title>
        </Modal.Header>
        <Modal.Body className="text-center p-1">
          <div className="mb-4">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="64"
              height="64"
              fill="#28a745"
              className="bi bi-check-circle-fill"
              viewBox="0 0 16 16"
            >
              <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zm-3.97-3.03a.75.75 0 0 0-1.08.022L7.477 9.417 5.384 7.323a.75.75 0 0 0-1.06 1.06L6.97 11.03a.75.75 0 0 0 1.079-.02l3.992-4.99a.75.75 0 0 0-.01-1.05z" />
            </svg>
          </div>
          <h3 className="mb-3">Thank You!</h3>
          <p>Your message has been sent successfully.</p>
          <p className="fw-bold">Our Team will Contact you Soon.</p>
        </Modal.Body>
        <Modal.Footer className="justify-content-center">
          <Button variant="success" onClick={() => setShowModal(false)}>
            Close
          </Button>
        </Modal.Footer>
      </Modal>
    </section>
  );
};

export default Contact;