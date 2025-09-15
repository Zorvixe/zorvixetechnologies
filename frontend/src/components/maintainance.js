// src/components/MaintenancePage.jsx
import React, { useEffect } from 'react';

const Maintenance = () => {
  // Set page title on mount
  useEffect(() => {
    document.title = "Maintenance | Zorvixe Technologies";
  }, []);

  return (
    <div className="bg-light min-vh-100">
      <section className="d-flex justify-content-center align-items-center min-vh-100">
        <div className="d-flex flex-column justify-content-center align-items-center col-12 text-center p-3">
          <img 
            src="/miniassets/img/zorvixe_logo_main.png" 
            style={{ width: '150px' }} 
            className="mb-3" 
            alt="Zorvixe Logo"
          />
          <img 
            src="/assets/img/maintainance.jpg" 
            className="img-fluid mb-2 rounded-3"
            style={{ maxWidth: '400px' }}
            alt="Maintenance in progress"
          />
          <h4 className="fw-bold mt-3">We're Down for Maintenance.</h4>
          <p className="text-muted mt-2">
            And we can't wait for you to see it.<br />Please check back soon.
          </p>
        </div>
      </section>
    </div>
  );
};

export default Maintenance;