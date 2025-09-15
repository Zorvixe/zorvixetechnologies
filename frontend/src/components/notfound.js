import React from 'react';

const NotFound = () => {
  return (
    <section className="d-flex justify-content-center align-items-center min-vh-100">
      <div className="text-center">
        <img 
          src="assets/img/404_error.jpg" 
          className="img-fluid rounded-3"
          style={{ maxWidth: '400px' }}
          alt="Page Not Found"
        />
        <p>Oops! The page you're looking for doesn't exist.</p>
      </div>
    </section>
  );
};

export default NotFound;