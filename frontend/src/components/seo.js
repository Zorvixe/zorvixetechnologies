// src/components/SEOServicePage.jsx
import React, { useState, useEffect } from 'react';

const SEOServicePage = () => {
  const [activeTab, setActiveTab] = useState('tab1');
  
  // Handle tab selection
  const handleTabChange = (tabId) => {
    setActiveTab(tabId);
  };

  // Initialize AOS animations on mount
  useEffect(() => {
    const initializeAOS = () => {
      // Simulate AOS initialization
      const elements = document.querySelectorAll('[data-aos]');
      elements.forEach(el => {
        el.classList.add('aos-init', 'aos-animate');
      });
    };

    initializeAOS();
  }, []);

   useEffect(() => {
        document.title = "SEO Optimization | Zorvixe Technologies";
      }, []);

  return (
    <main className="main">

      {/* Page Title Section */}
      <div className="page-title">
        <div className="heading">
          <div className="container">
            <div className="row d-flex justify-content-center text-center">
              <div className="col-lg-8">
                <h1 className="heading-title" data-aos="fade-up">SEO Optimization</h1>
                <p className="mb-0" data-aos="fade-up" data-aos-delay="100">
                  Boost your search engine rankings and drive consistent organic traffic with our
                  expert SEO solutions. We help your business get found online by the right audience at the
                  right time.
                </p>
              </div>
            </div>
          </div>
        </div>
        <nav className="breadcrumbs">
          <div className="container">
            <ol>
              <li><a href="/">Home</a></li>
              <li className="current">SEO Services</li>
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
                <img 
                  src="/assets/img/seo/seo_1.webp" 
                  alt="SEO Services" 
                  className="img-fluid rounded-4"
                />
                <div className="experience-badge">
                  <span>1+</span>
                  <p>Years of SEO Excellence</p>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="service-main-content">
                <div className="section-header" data-aos="fade-up">
                  <span className="section-subtitle">Rank Higher, Convert Better</span>
                  <h2>Advanced SEO Services for Business Growth</h2>
                </div>
                <p className="lead" data-aos="fade-up" data-aos-delay="100">
                  Achieving top positions on search engines requires more than keywords. We deliver custom SEO
                  strategies designed to enhance visibility, attract targeted traffic, and boost conversion
                  rates.
                </p>
                <p data-aos="fade-up" data-aos-delay="200">
                  Our SEO experts focus on both on-page and off-page optimization, leveraging the latest
                  algorithm updates and industry tools. From audits to content strategy, we've helped
                  countless businesses grow through search.
                </p>

                <ul className="service-benefits" data-aos="fade-up" data-aos-delay="300">
                  <li><i className="bi bi-check2-circle"></i> Comprehensive technical audits</li>
                  <li><i className="bi bi-check2-circle"></i> Keyword research with commercial intent</li>
                  <li><i className="bi bi-check2-circle"></i> High-quality backlink building</li>
                  <li><i className="bi bi-check2-circle"></i> Ongoing performance monitoring</li>
                  <li><i className="bi bi-check2-circle"></i> SEO-optimized content marketing</li>
                </ul>
              </div>
            </div>
          </div>

          {/* Service Tabs */}
          <div className="service-tabs mt-5" data-aos="fade-up">
            <ul className="nav nav-tabs" id="service-details-tabs" role="tablist">
              <li className="nav-item" role="presentation">
                <button 
                  className={`nav-link ${activeTab === 'tab1' ? 'active' : ''}`}
                  onClick={() => handleTabChange('tab1')}
                >
                  <i className="bi bi-speedometer2"></i> Technical SEO
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button 
                  className={`nav-link ${activeTab === 'tab2' ? 'active' : ''}`}
                  onClick={() => handleTabChange('tab2')}
                >
                  <i className="bi bi-pencil-square"></i> Content Optimization
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button 
                  className={`nav-link ${activeTab === 'tab3' ? 'active' : ''}`}
                  onClick={() => handleTabChange('tab3')}
                >
                  <i className="bi bi-link-45deg"></i> Link Building
                </button>
              </li>
              <li className="nav-item" role="presentation">
                <button 
                  className={`nav-link ${activeTab === 'tab4' ? 'active' : ''}`}
                  onClick={() => handleTabChange('tab4')}
                >
                  <i className="bi bi-bar-chart-line"></i> Analytics & Reporting
                </button>
              </li>
            </ul>

            <div className="tab-content" id="service-details-tabs-content">
              {/* Tab 1: Technical SEO */}
              <div 
                className={`tab-pane fade ${activeTab === 'tab1' ? 'show active' : ''}`} 
                id="service-details-tab-1" 
                role="tabpanel"
              >
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img 
                      src="/assets/img/seo/seo_2.webp" 
                      alt="Technical SEO"
                      className="img-fluid rounded-4"
                    />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>Technical SEO Optimization</h3>
                    <p>We ensure your website meets all technical requirements for optimal search engine
                      crawling and indexing. Our audits identify and fix issues that could be hindering
                      your search performance.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-laptop"></i>
                          <h4>Site Architecture</h4>
                          <p>Optimized site structure and internal linking for better crawlability and
                            indexation.</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-lightning-charge"></i>
                          <h4>Page Speed</h4>
                          <p>Comprehensive speed optimization for better user experience and rankings.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab 2: Content Optimization */}
              <div 
                className={`tab-pane fade ${activeTab === 'tab2' ? 'show active' : ''}`} 
                id="service-details-tab-2" 
                role="tabpanel"
              >
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img 
                      src="/assets/img/seo/seo_3.webp" 
                      alt="SEO Content Strategy"
                      className="img-fluid rounded-4"
                    />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>Content Strategy & Optimization</h3>
                    <p>Our content experts create SEO-friendly content that ranks and converts. We focus on
                      user intent and search algorithms to deliver content that performs.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-search"></i>
                          <h4>Keyword Research</h4>
                          <p>In-depth analysis of high-value keywords with commercial intent.</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-file-earmark-text"></i>
                          <h4>Content Creation</h4>
                          <p>Strategic content development that answers user queries and builds authority.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab 3: Link Building */}
              <div 
                className={`tab-pane fade ${activeTab === 'tab3' ? 'show active' : ''}`} 
                id="service-details-tab-3" 
                role="tabpanel"
              >
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img 
                      src="/assets/img/seo/seo_4.webp" 
                      alt="SEO Link Building"
                      className="img-fluid rounded-4"
                    />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>Strategic Link Building</h3>
                    <p>We build high-quality backlinks from authoritative sources to improve your domain
                      authority and search rankings.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-shield-check"></i>
                          <h4>White-Hat Strategies</h4>
                          <p>Ethical link acquisition methods that comply with search engine guidelines.</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-journal-text"></i>
                          <h4>Guest Posting</h4>
                          <p>High-authority guest posts with contextual backlinks to your site.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Tab 4: Analytics & Reporting */}
              <div 
                className={`tab-pane fade ${activeTab === 'tab4' ? 'show active' : ''}`} 
                id="service-details-tab-4" 
                role="tabpanel"
              >
                <div className="row align-items-center">
                  <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                    <img 
                      src="/assets/img/seo/seo_4.webp" 
                      alt="SEO Analytics"
                      className="img-fluid rounded-4"
                    />
                  </div>
                  <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                    <h3>Performance Tracking & Reporting</h3>
                    <p>We provide transparent reporting with actionable insights to demonstrate ROI and
                      guide future strategies.</p>
                    <div className="row gy-4 mt-3">
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-graph-up"></i>
                          <h4>Rank Tracking</h4>
                          <p>Comprehensive monitoring of keyword rankings across search engines.</p>
                        </div>
                      </div>
                      <div className="col-md-6">
                        <div className="feature-item">
                          <i className="bi bi-trophy"></i>
                          <h4>ROI Analysis</h4>
                          <p>Detailed reporting on how SEO impacts your business goals and revenue.</p>
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
            <h3>Ready to climb to the top of Google?</h3>
            <p>Request a free SEO audit and find out how we can elevate your rankings and traffic.</p>
            <a href="/contact_us" className="btn-service">Request SEO Proposal <i className="bi bi-arrow-right"></i></a>
          </div>
        </div>
      </section>
    </main>
  );
};

export default SEOServicePage;