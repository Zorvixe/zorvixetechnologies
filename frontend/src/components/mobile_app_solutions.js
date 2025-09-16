import React, { useEffect } from 'react';
import { Link } from 'react-router-dom';

const MobileAppSolutions = () => {
  useEffect(() => {
    document.title = "Mobile App Solutions | Zorvixe Technologies";
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
                <h1 className="heading-title">Mobile App Solutions</h1>
                <p className="mb-0">
                  Transform your business with custom mobile applications that engage users and
                  drive growth. We combine innovative technology with user-centric design to deliver apps that
                  perform.
                </p>
              </div>
            </div>
          </div>
        </div>
        <nav className="breadcrumbs">
          <div className="container">
            <ol>
              <li><a href="/">Home</a></li>
              <li className="current">Mobile App Solutions</li>
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
                  src="/assets/img/services/app_development_1.png"
                  alt="Zorvixe Technologies Mobile App Development"
                  className="img-fluid rounded-4"
                />
                <div className="experience-badge">
                  <span>1+</span>
                  <p>Years Building Apps</p>
                </div>
              </div>
            </div>

            <div className="col-lg-6">
              <div className="service-main-content">
                <div className="section-header" data-aos="fade-up">
                  <span className="section-subtitle">Innovative App Development</span>
                  <h2>Comprehensive Mobile App Services</h2>
                </div>
                <p className="lead" data-aos="fade-up" data-aos-delay="100">
                  In today's mobile-first world, having a high-performing app is essential for business
                  success. Our full-cycle app development services create solutions that users love and
                  businesses rely on.
                </p>
                <p data-aos="fade-up" data-aos-delay="200">
                  We leverage cutting-edge technologies and agile methodologies to build custom mobile
                  applications for iOS and Android. From concept to launch and beyond, we've helped startups
                  and enterprises create impactful mobile experiences.
                </p>

                <ul className="service-benefits" data-aos="fade-up" data-aos-delay="300">
                  {[
                    "Native and cross-platform development",
                    "User-centric UI/UX design",
                    "Robust backend integration",
                    "Quality assurance and testing",
                    "Ongoing maintenance and support"
                  ].map((item, index) => (
                    <li key={index}>
                      <i className="bi bi-check2-circle"></i> {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>

          <div className="service-tabs mt-5" data-aos="fade-up">
            <ul className="nav nav-tabs" id="service-details-tabs" role="tablist">
              {[
                { id: 1, icon: "phone", label: "App Development" },
                { id: 2, icon: "palette", label: "UI/UX Design" },
                { id: 3, icon: "gear", label: "App Maintenance" },
                { id: 4, icon: "graph-up", label: "App Marketing" }
              ].map((tab) => (
                <li className="nav-item" key={tab.id} role="presentation">
                  <button
                    className={`nav-link ${tab.id === 1 ? 'active' : ''}`}
                    id={`service-details-tab-${tab.id}-tab`}
                    data-bs-toggle="tab"
                    data-bs-target={`#service-details-tab-${tab.id}`}
                    type="button"
                    role="tab"
                  >
                    <i className={`bi bi-${tab.icon}`}></i> {tab.label}
                  </button>
                </li>
              ))}
            </ul>

            <div className="tab-content" id="service-details-tabs-content">
              {[
                {
                  id: 1,
                  title: "Custom App Development",
                  img: "app_development_2.png",
                  alt: "Zorvixe Technologies App development process",
                  description: "We build high-performance mobile applications tailored to your business needs and user requirements, using the latest technologies and development practices.",
                  features: [
                    { icon: "apple", title: "iOS Development", text: "Native iOS apps built with Swift for optimal performance on Apple devices." },
                    { icon: "android", title: "Android Development", text: "Native Android applications developed with Kotlin for seamless performance." }
                  ]
                },
                {
                  id: 2,
                  title: "UI/UX Design Services",
                  img: "app_development_3.png",
                  alt: "Zorvixe Technologies App UI/UX design",
                  description: "We create intuitive and visually stunning interfaces that enhance user engagement and satisfaction, following the latest design trends and usability principles.",
                  features: [
                    { icon: "layout-text-window", title: "Wireframing", text: "Detailed blueprints that map out your app's structure and user flows." },
                    { icon: "brush", title: "Visual Design", text: "Beautiful, on-brand interfaces that create memorable user experiences." }
                  ]
                },
                {
                  id: 3,
                  title: "App Maintenance & Support",
                  img: "app_development_4.png",
                  alt: "Zorvixe Technologies App maintenance",
                  description: "We provide ongoing maintenance services to keep your app running smoothly, with regular updates, bug fixes, and performance optimizations.",
                  features: [
                    { icon: "bug", title: "Bug Fixes", text: "Prompt resolution of any technical issues that may arise." },
                    { icon: "arrow-up-circle", title: "Updates", text: "Regular updates to ensure compatibility with new OS versions." }
                  ]
                },
                {
                  id: 4,
                  title: "App Store Optimization & Marketing",
                  img: "app_development_5.png",
                  alt: "Zorvixe Technologies App marketing",
                  description: "We help your app get discovered and downloaded through strategic marketing campaigns and app store optimization techniques.",
                  features: [
                    { icon: "search", title: "ASO", text: "Optimizing your app store listing for better visibility and conversions." },
                    { icon: "megaphone", title: "User Acquisition", text: "Targeted campaigns to drive quality installs and engaged users." }
                  ]
                }
              ].map((tab) => (
                <div
                  key={tab.id}
                  className={`tab-pane fade ${tab.id === 1 ? 'show active' : ''}`}
                  id={`service-details-tab-${tab.id}`}
                  role="tabpanel"
                >
                  <div className="row align-items-center">
                    <div className="col-lg-5" data-aos="fade-right" data-aos-delay="100">
                      <img
                        src={`/assets/img/services/${tab.img}`}
                        alt={tab.alt}
                        className="img-fluid rounded-4"
                      />
                    </div>
                    <div className="col-lg-7" data-aos="fade-left" data-aos-delay="200">
                      <h3>{tab.title}</h3>
                      <p>{tab.description}</p>
                      <div className="row gy-4 mt-3">
                        {tab.features.map((feature, index) => (
                          <div className="col-md-6" key={index}>
                            <div className="feature-item">
                              <i className={`bi bi-${feature.icon}`}></i>
                              <h4>{feature.title}</h4>
                              <p>{feature.text}</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="service-cta mt-5 text-center" data-aos="zoom-in">
            <h3>Ready to build your next successful mobile app?</h3>
            <p>Schedule your free consultation and discover how we can bring your app idea to life.</p>
            <Link to="/contact_us" className="btn-service">
              Request Proposal <i className="bi bi-arrow-right"></i>
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
};

export default MobileAppSolutions;