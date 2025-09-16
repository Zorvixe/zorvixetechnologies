import React, { useEffect } from 'react';
import { Tab, Nav} from 'react-bootstrap';

const DigitalMarketingService = () => {


  useEffect(() => {
    window.scrollTo(0, 0);
    if (window.AOS) {
      window.AOS.init({ duration: 800 });
    }
  }, []);


  useEffect(() => {
    document.title = "Digital Marketing | Zorvixe Technologies ";
  }, []);

  return (
    <main className="main">
      {/* Page Title */}
      <div className="page-title">
        <div className="heading">
          <div className="container">
            <div className="row d-flex justify-content-center text-center">
              <div className="col-lg-8">
                <h1 className="heading-title">Digital Marketing</h1>
                <p className="mb-0">
                  Transform your online presence with data-driven digital marketing strategies.
                  We combine cutting-edge technology with proven marketing techniques to deliver
                  measurable results that grow your business.
                </p>
              </div>
            </div>
          </div>
        </div>

        <nav className="breadcrumbs">
          <div className="container">
            <ol>
              <li><a href="/">Home</a></li>
              <li className="current">Digital Marketing</li>
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
                  src="/assets/img/services/digital_marketing_section_image.jpg"
                  alt="Zorvixe Technologies Digital Marketing"
                  className="img-fluid rounded-4"
                />
                <div className="experience-badge">
                  <span>1+</span>
                  <p>Years Driving Results</p>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="service-main-content">
                <div className="section-header" data-aos="fade-up">
                  <span className="section-subtitle">Performance-Driven Marketing</span>
                  <h2>Comprehensive Digital Marketing Solutions</h2>
                </div>
                <p className="lead" data-aos="fade-up" data-aos-delay="100">
                  In today's competitive digital landscape, you need more than just visibility - you need
                  strategic marketing that converts. Our full-service digital marketing agency delivers
                  targeted campaigns that align with your business objectives.
                </p>
                <p data-aos="fade-up" data-aos-delay="200">
                  We leverage the latest marketing technologies and analytics to create customized strategies
                  that drive qualified traffic, increase conversions, and maximize your return on investment.
                  From SEO to paid media, we've helped hundreds of businesses achieve sustainable growth.
                </p>

                <ul className="service-benefits" data-aos="fade-up" data-aos-delay="300">
                  {[
                    "Data-backed strategies tailored to your KPIs",
                    "Multi-channel approach for maximum reach",
                    "Transparent reporting with actionable insights",
                    "Continuous optimization based on performance",
                    "Dedicated account management"
                  ].map((item, index) => (
                    <li key={index}>
                      <i className="bi bi-check2-circle"></i> {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          {/* Service Tabs */}
          <div className="service-tabs mt-5" data-aos="fade-up">
            <Tab.Container defaultActiveKey="seo">
              <Nav variant="tabs" className="nav-tabs" id="service-details-tabs">
                {[
                  { id: "seo", icon: "bi-search", label: "SEO Services" },
                  { id: "advertising", icon: "bi-megaphone", label: "Paid Advertising" },
                  { id: "social", icon: "bi-people", label: "Social Media Marketing" },
                  { id: "conversion", icon: "bi-envelope", label: "Conversion Optimization" }
                ].map(tab => (
                  <Nav.Item key={tab.id}>
                    <Nav.Link eventKey={tab.id}>
                      <i className={`bi ${tab.icon}`}></i> {tab.label}
                    </Nav.Link>
                  </Nav.Item>
                ))}
              </Nav>

              <Tab.Content className="tab-content" id="service-details-tabs-content">
                {/* SEO Services Tab */}
                <Tab.Pane eventKey="seo">
                  <div className="row align-items-center">
                    <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                      <img
                        src="/assets/img/services/digital_marketing_seo.jpg"
                        alt="Zorvixe Technologies SEO optimization process"
                        className="img-fluid rounded-4"
                      />
                    </div>
                    <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                      <h3>Search Engine Optimization</h3>
                      <p>
                        Our comprehensive SEO services improve your organic visibility and drive sustainable
                        traffic growth. We implement white-hat techniques that align with search engine
                        guidelines to deliver long-term results.
                      </p>
                      <div className="row gy-4 mt-3">
                        {[
                          {
                            icon: "bi-graph-up-arrow",
                            title: "Technical SEO Audit",
                            description: "We identify and fix technical issues that may be hindering your search performance, from site speed to mobile optimization."
                          },
                          {
                            icon: "bi-link",
                            title: "Content Strategy",
                            description: "Data-driven content creation that answers user intent and establishes your authority in your industry."
                          }
                        ].map((feature, idx) => (
                          <div key={idx} className="col-md-6">
                            <div className="feature-item">
                              <i className={`bi ${feature.icon}`}></i>
                              <h4>{feature.title}</h4>
                              <p>{feature.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Tab.Pane>

                {/* Paid Advertising Tab */}
                <Tab.Pane eventKey="advertising">
                  <div className="row align-items-center">
                    <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                      <img
                        src="/assets/img/services/digital_marketing_ppc.jpg"
                        alt="Zorvixe Technologies Digital advertising dashboard"
                        className="img-fluid rounded-4"
                      />
                    </div>
                    <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                      <h3>Paid Media & Performance Marketing</h3>
                      <p>
                        Our paid media experts create and manage high-converting campaigns across search,
                        social, and display networks to deliver immediate results while optimizing for ROI.
                      </p>
                      <div className="row gy-4 mt-3">
                        {[
                          {
                            icon: "bi-google",
                            title: "PPC Management",
                            description: "Strategic bid management and continuous optimization of your Google Ads, Microsoft Advertising, and other PPC campaigns."
                          },
                          {
                            icon: "bi-bar-chart",
                            title: "Programmatic Advertising",
                            description: "AI-powered ad buying that targets your ideal customers across thousands of sites with precision."
                          }
                        ].map((feature, idx) => (
                          <div key={idx} className="col-md-6">
                            <div className="feature-item">
                              <i className={`bi ${feature.icon}`}></i>
                              <h4>{feature.title}</h4>
                              <p>{feature.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Tab.Pane>

                {/* Social Media Marketing Tab */}
                <Tab.Pane eventKey="social">
                  <div className="row align-items-center">
                    <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                      <img
                        src="/assets/img/services/digital_marketing_social_media.webp"
                        alt="Zorvixe Technologies Social media marketing strategy"
                        className="img-fluid rounded-4"
                      />
                    </div>
                    <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                      <h3>Social Media Marketing</h3>
                      <p>
                        We develop platform-specific strategies that build authentic engagement, grow your
                        following, and drive conversions through social channels.
                      </p>
                      <div className="row gy-4 mt-3">
                        {[
                          {
                            icon: "bi-layout-text-window",
                            title: "Content Strategy",
                            description: "Platform-optimized content calendars designed to increase engagement and brand awareness."
                          },
                          {
                            icon: "bi-calendar-check",
                            title: "Paid Social Advertising",
                            description: "Hyper-targeted social ads that reach your ideal customers with precision and measurable ROI."
                          }
                        ].map((feature, idx) => (
                          <div key={idx} className="col-md-6">
                            <div className="feature-item">
                              <i className={`bi ${feature.icon}`}></i>
                              <h4>{feature.title}</h4>
                              <p>{feature.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Tab.Pane>

                {/* Conversion Optimization Tab */}
                <Tab.Pane eventKey="conversion">
                  <div className="row align-items-center">
                    <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                      <img
                        src="/assets/img/services/digital_marketing_email.jpg"
                        alt="Zorvixe Technologies Conversion rate optimization process"
                        className="img-fluid rounded-4"
                      />
                    </div>
                    <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                      <h3>Conversion Rate Optimization</h3>
                      <p>
                        We turn your existing traffic into more leads and sales through data-driven
                        optimization of your user experience and conversion paths.
                      </p>
                      <div className="row gy-4 mt-3">
                        {[
                          {
                            icon: "bi-envelope-check",
                            title: "A/B Testing",
                            description: "Scientific testing of page elements to determine what drives the highest conversion rates."
                          },
                          {
                            icon: "bi-pie-chart",
                            title: "User Journey Analysis",
                            description: "Heatmaps and session recordings that reveal how visitors interact with your site and where they drop off."
                          }
                        ].map((feature, idx) => (
                          <div key={idx} className="col-md-6">
                            <div className="feature-item">
                              <i className={`bi ${feature.icon}`}></i>
                              <h4>{feature.title}</h4>
                              <p>{feature.description}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </Tab.Pane>
              </Tab.Content>
            </Tab.Container>
          </div>

          {/* CTA Section */}
          <div className="service-cta mt-5 text-center" data-aos="zoom-in">
            <h3>Ready to accelerate your digital growth?</h3>
            <p>Schedule your free marketing audit and discover how we can help you achieve your business goals.</p>
            <a href="/contact_us" className="btn-service">
              Request Proposal <i className="bi bi-arrow-right"></i>
            </a>
          </div>
        </div>
      </section>
    </main>
  );
};

export default DigitalMarketingService;