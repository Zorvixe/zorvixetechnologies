import React, { useState, useEffect } from 'react';

const WebHosting = () => {
  const [activeTab, setActiveTab] = useState('tab1');

  const handleTabChange = (tab) => {
    setActiveTab(tab);
  };
  useEffect(() => {
    document.title = "Web Hosting | Zorvixe Technologies";
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
                <h1 className="heading-title">Web Hosting Solutions</h1>
                <p className="mb-0">Reliable, secure, and high-performance hosting for your online presence. We
                  provide enterprise-grade infrastructure with 99.9% uptime to keep your website running
                  smoothly.</p>
              </div>
            </div>
          </div>
        </div>
        <nav className="breadcrumbs">
          <div className="container">
            <ol>
              <li><a href="/">Home</a></li>
              <li className="current">Web Hosting</li>
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
                <img src="/assets/img/services/hosting_1.jpg" alt="Zorvixe Technologies Web Hosting Infrastructure"
                  className="img-fluid rounded-4" />
                <div className="experience-badge">
                  <span>1+</span>
                  <p>Years Hosting Expertise</p>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="service-main-content">
                <div className="section-header" data-aos="fade-up">
                  <span className="section-subtitle">Premium Hosting Services</span>
                  <h2>High-Performance Web Hosting</h2>
                </div>
                <p className="lead" data-aos="fade-up" data-aos-delay="100">
                  Your website deserves the best foundation. Our hosting solutions combine cutting-edge
                  technology with enterprise-grade security to deliver unmatched performance and reliability.
                </p>
                <p data-aos="fade-up" data-aos-delay="200">
                  Whether you need shared hosting for a small site or dedicated servers for high-traffic
                  applications, we've got you covered with 24/7 monitoring, automatic backups, and expert
                  support.
                </p>

                <ul className="service-benefits" data-aos="fade-up" data-aos-delay="300">
                  <li><i className="bi bi-check2-circle"></i> 99.9% uptime guarantee</li>
                  <li><i className="bi bi-check2-circle"></i> SSD-powered servers</li>
                  <li><i className="bi bi-check2-circle"></i> Free SSL certificates</li>
                  <li><i className="bi bi-check2-circle"></i> Daily automated backups</li>
                  <li><i className="bi bi-check2-circle"></i> 24/7 security monitoring</li>
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
                  <i className="bi bi-share"></i> Shared Hosting
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'tab2' ? 'active' : ''}`}
                  onClick={() => handleTabChange('tab2')}
                >
                  <i className="bi bi-hdd-stack"></i> VPS Hosting
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'tab3' ? 'active' : ''}`}
                  onClick={() => handleTabChange('tab3')}
                >
                  <i className="bi bi-server"></i> Dedicated Servers
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button
                  className={`nav-link ${activeTab === 'tab4' ? 'active' : ''}`}
                  onClick={() => handleTabChange('tab4')}
                >
                  <i className="bi bi-cloud"></i> Cloud Hosting
                </button>
              </li>
            </ul>

            <div className="tab-content" id="service-details-tabs-content">
              {/* Shared Hosting Tab */}
              <div className={`tab-pane fade ${activeTab === 'tab1' ? 'show active' : ''}`}>
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img src="/assets/img/services/hosting_2.jpg" alt="Zorvixe Technologies Shared Hosting"
                      className="img-fluid rounded-4" />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>Shared Web Hosting</h3>
                    <p>Perfect for small to medium websites, our shared hosting provides an affordable,
                      fully-managed solution with all the essential features to get your site online
                      quickly.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-lightning"></i>
                          <h4>Fast Performance</h4>
                          <p>SSD storage and optimized servers for quick page loads</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-shield-lock"></i>
                          <h4>Enhanced Security</h4>
                          <p>Free SSL, malware scanning, and DDoS protection</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* VPS Hosting Tab */}
              <div className={`tab-pane fade ${activeTab === 'tab2' ? 'show active' : ''}`}>
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img src="/assets/img/services/hosting_3.jpg" alt="Zorvixe Technologies VPS Hosting"
                      className="img-fluid rounded-4" />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>Virtual Private Servers</h3>
                    <p>Get dedicated resources with the flexibility of cloud technology. Our VPS hosting is
                      ideal for growing websites that need more power and control.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-sliders"></i>
                          <h4>Full Root Access</h4>
                          <p>Complete control to install and configure any software</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-arrow-repeat"></i>
                          <h4>Scalable Resources</h4>
                          <p>Easily upgrade CPU, RAM, and storage as needed</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Dedicated Servers Tab */}
              <div className={`tab-pane fade ${activeTab === 'tab3' ? 'show active' : ''}`}>
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img src="/assets/img/services/hosting_4.jpg" alt="Zorvixe Technologies Dedicated Servers"
                      className="img-fluid rounded-4" />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>Dedicated Server Hosting</h3>
                    <p>Maximum performance and security with your own physical server. Ideal for
                      high-traffic websites, applications, and enterprise solutions.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-cpu"></i>
                          <h4>Exclusive Resources</h4>
                          <p>Entire server dedicated to your applications</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-shield-check"></i>
                          <h4>Enterprise Security</h4>
                          <p>Advanced firewall protection and hardware isolation</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Cloud Hosting Tab */}
              <div className={`tab-pane fade ${activeTab === 'tab4' ? 'show active' : ''}`}>
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img src="/assets/img/services/hosting_5.jpg" alt="Zorvixe Technologies Cloud Hosting"
                      className="img-fluid rounded-4" />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>Cloud Hosting Solutions</h3>
                    <p>Highly scalable cloud infrastructure that automatically adjusts to traffic spikes,
                      ensuring optimal performance during peak periods.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-arrows-angle-expand"></i>
                          <h4>Auto-Scaling</h4>
                          <p>Resources automatically adjust to your traffic needs</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-currency-dollar"></i>
                          <h4>Pay-As-You-Go</h4>
                          <p>Only pay for the resources you actually use</p>
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
            <h3>Ready to find your perfect hosting solution?</h3>
            <p>Get a free hosting consultation and migration service when you sign up today.</p>
            <a href="/contact_us" className="btn-service">View Hosting Plans <i className="bi bi-arrow-right"></i></a>
          </div>
        </div>
      </section>
    </main>
  );
};

export default WebHosting;