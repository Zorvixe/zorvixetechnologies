import React, { useState, useEffect } from 'react';

const WebDevelopment = () => {
  const [activeTab, setActiveTab] = useState('tab1');

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };

  useEffect(() => {
    document.title = "Web Development | Zorvixe Technologies";
  }, []);

  useEffect(() => {
    window.scrollTo(0, 0);
    if (window.AOS) {
      window.AOS.init({ duration: 800 });
    }
  }, []);

  return (
    <main className="main">
      {/* Page Title */}
      <div className="page-title">
        <div className="heading">
          <div className="container">
            <div className="row d-flex justify-content-center text-center">
              <div className="col-lg-8">
                <h1 className="heading-title">Web Development</h1>
                <p className="mb-0">Building digital experiences that drive results. Our expert team crafts custom
                  web solutions tailored to your business needs and goals.</p>
              </div>
            </div>
          </div>
        </div>
        <nav className="breadcrumbs">
          <div className="container">
            <ol>
              <li><a href="/">Home</a></li>
              <li className="current">Web Development</li>
            </ol>
          </div>
        </nav>
      </div>

      {/* Service Details Section */}
      <section id="service-details" className="service-details section">
        <div className="container" data-aos="fade-up" data-aos-delay="100">
          <div className="row gy-5">
            <div className="col-lg-6">
              <div className="service-main-image" data-aos="zoom-in" data-aos-delay="200">
                <img src="/assets/img/services/services-4.webp" alt="Zorvixe Technologies Web Development Team"
                  className="img-fluid rounded-4" />
                <div className="experience-badge">
                  <span>1+</span>
                  <p>Years Experience</p>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="service-main-content">
                <div className="section-header" data-aos="fade-up">
                  <span className="section-subtitle">Our Expertise</span>
                  <h2>Custom Web Development Solutions</h2>
                </div>
                <p className="lead" data-aos="fade-up" data-aos-delay="100">
                  We create responsive, high-performance websites and web applications that deliver
                  exceptional user experiences and drive business growth.
                </p>
                <p data-aos="fade-up" data-aos-delay="200">
                  Our full-stack development team specializes in building custom solutions using modern
                  technologies. From simple brochure websites to complex web applications, we deliver scalable
                  solutions that grow with your business.
                </p>

                <ul className="service-benefits" data-aos="fade-up" data-aos-delay="300">
                  <li><i className="bi bi-check2-circle"></i> Custom-built solutions tailored to your requirements</li>
                  <li><i className="bi bi-check2-circle"></i> Mobile-first responsive design approach</li>
                  <li><i className="bi bi-check2-circle"></i> Optimized for performance and search engines</li>
                  <li><i className="bi bi-check2-circle"></i> Secure, scalable architecture with future growth in mind</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Tabs Section */}
          <div className="service-tabs mt-5" data-aos="fade-up">
            <ul className="nav nav-tabs" id="service-details-tabs" role="tablist">
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'tab1' ? 'active' : ''}`}
                  onClick={() => handleTabChange('tab1')}
                >
                  <i className="bi bi-layout-text-sidebar"></i> Frontend Development
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'tab2' ? 'active' : ''}`}
                  onClick={() => handleTabChange('tab2')}
                >
                  <i className="bi bi-server"></i> Backend Development
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'tab3' ? 'active' : ''}`}
                  onClick={() => handleTabChange('tab3')}
                >
                  <i className="bi bi-cart"></i> E-commerce Solutions
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'tab4' ? 'active' : ''}`}
                  onClick={() => handleTabChange('tab4')}
                >
                  <i className="bi bi-phone"></i> Mobile Integration
                </button>
              </li>
            </ul>

            <div className="tab-content" id="service-details-tabs-content">
              {/* Frontend Development Tab */}
              <div className={`tab-pane fade ${activeTab === 'tab1' ? 'show active' : ''}`}>
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img src="/assets/img/services/services-5.webp" alt="Zorvixe Technologies Frontend Development"
                      className="img-fluid rounded-4" />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>Modern Frontend Development</h3>
                    <p>We create beautiful, interactive user interfaces using the latest frontend
                      technologies including React, Vue.js, and Angular. Our pixel-perfect implementations
                      ensure your website looks stunning on all devices.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-layout-wtf"></i>
                          <h4>Responsive Design</h4>
                          <p>Mobile-first approach that ensures your site looks perfect on phones,
                            tablets, and desktops.</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-lightning-charge"></i>
                          <h4>Performance Optimization</h4>
                          <p>Fast-loading pages with optimized assets and efficient code to improve
                            user experience and SEO.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Backend Development Tab */}
              <div className={`tab-pane fade ${activeTab === 'tab2' ? 'show active' : ''}`}>
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img src="/assets/img/services/services-6.webp" alt="Zorvixe Technologies Backend Development"
                      className="img-fluid rounded-4" />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>Robust Backend Systems</h3>
                    <p>Our backend development services create the powerful engines that drive your web
                      applications. We build secure, scalable APIs and server-side logic using Node.js,
                      Python, PHP, and other modern technologies.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-database"></i>
                          <h4>Database Architecture</h4>
                          <p>Optimized database design for performance and scalability with SQL and
                            NoSQL solutions.</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-shield-lock"></i>
                          <h4>API Development</h4>
                          <p>Secure RESTful and GraphQL APIs that power your applications and enable
                            integrations.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* E-commerce Solutions Tab */}
              <div className={`tab-pane fade ${activeTab === 'tab3' ? 'show active' : ''}`}>
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img src="/assets/img/services/services-7.webp" alt="Zorvixe Technologies E-commerce Solutions"
                      className="img-fluid rounded-4" />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>E-commerce Development</h3>
                    <p>Complete e-commerce solutions built with platforms like Shopify, WooCommerce, or
                      custom solutions. We create online stores that convert visitors into customers with
                      intuitive navigation and seamless checkout experiences.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-credit-card"></i>
                          <h4>Payment Integration</h4>
                          <p>Secure payment gateways including Stripe, PayPal, and other global
                            payment processors.</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-graph-up"></i>
                          <h4>Conversion Optimization</h4>
                          <p>Data-driven design to maximize conversions and average order value.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Mobile Integration Tab */}
              <div className={`tab-pane fade ${activeTab === 'tab4' ? 'show active' : ''}`}>
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img src="/assets/img/services/services-8.webp" alt="Zorvixe Technologies Mobile Integration"
                      className="img-fluid rounded-4" />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>Mobile Web Integration</h3>
                    <p>With mobile traffic dominating web usage, we ensure your website delivers an
                      exceptional mobile experience through responsive design, PWA capabilities, and
                      mobile-specific optimizations.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-phone"></i>
                          <h4>Progressive Web Apps</h4>
                          <p>App-like experiences that work offline and can be installed on home
                            screens.</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-speedometer2"></i>
                          <h4>Mobile Optimization</h4>
                          <p>Lightweight implementations that load quickly even on slower mobile
                            networks.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* CTA Section */}
          <div className="service-cta mt-5 text-center" data-aos="zoom-in">
            <h3>Ready to build your perfect web solution?</h3>
            <p>Contact our development team today for a free consultation and project estimate.</p>
            <a href="/contact_us" className="btn-service">Start Your Project <i className="bi bi-arrow-right"></i></a>
          </div>
        </div>
      </section>
    </main>
  );
};

export default WebDevelopment;