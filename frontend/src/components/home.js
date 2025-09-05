import React, { useState, useEffect } from 'react';
const Home = () => {

    useEffect(() => {
        document.title = "Home | Zorvixe Technologies";
    }, []);

    const redirectToContact = () => {
        window.location.href = "contact_us";
    };

    const [activeIndex, setActiveIndex] = useState(0);

    const toggleFAQ = (index) => {
        setActiveIndex(activeIndex === index ? null : index);
    };

    const faqItems = [
        {
            question: "What makes ZORVIXE different from other web development agencies?",
            answer: "We combine cutting-edge technology with deep business insight to create solutions that actually drive growth. Unlike agencies that just build websites, we focus on creating digital assets that help small businesses compete and thrive in today's market."
        },
        {
            question: "How long does it typically take to build a custom website?",
            answer: "Most standard business websites take 4-6 weeks from initial consultation to launch. More complex projects like e-commerce sites or web applications may take 8-12 weeks. We move quickly without sacrificing quality, and we'll provide a clear timeline after understanding your specific needs."
        },
        {
            question: "Do you provide ongoing support after my website launches?",
            answer: "Absolutely! We offer several support packages to keep your site secure, updated, and performing at its best. Our team is always available for updates, troubleshooting, or helping you add new features as your business grows."
        },
        {
            question: "What's included in your digital marketing services?",
            answer: "Our digital marketing packages typically include SEO optimization, content strategy, social media management, email marketing, and paid advertising campaigns. We customize each strategy based on your business goals, target audience, and budget to deliver measurable results."
        }
    ];

    const redirectToContactPage = () => {
        window.location.href = "contact_us";
    };


    return (
        <div>
            <section id="hero" className="hero section">
                <div className="container" data-aos="fade-up" data-aos-delay="100">
                    <div className="row align-items-center mb-5">
                        <div className="col-lg-6 mb-4 mb-lg-0">
                            <div className="badge-wrapper mb-3">
                                <div className="d-inline-flex align-items-center rounded-pill border border-accent-light">
                                    <div className="icon-circle me-2">
                                        <i className="bi bi-bell"></i>
                                    </div>
                                    <span className="badge-text me-3">ZORVIXE TECHNOLOGIES</span>
                                </div>
                            </div>
                            <h1 className="hero-title mb-4">Transform Your Vision into <span
                                className="rounded-3 digital-name text-light" style={{ backgroundColor: "#5d57f4" }}>Digital</span>
                                Reality</h1>

                            <p className="hero-description mb-4">
                                Elevate your business with cutting-edge web development, innovative design, and strategic
                                digital solutions that drive growth and success.
                            </p>

                            <div className="cta-wrapper">
                                <a href="#contact" className="btn btn-primary">Discover More</a>
                            </div>
                        </div>

                        <div className="col-lg-6">
                            <div className="hero-image">
                                <img src="assets/img/illustration/illustration-16.webp" alt="Business Growth" className="img-fluid"
                                    loading="lazy" />
                            </div>
                        </div>
                    </div>

                    <div className="row feature-boxes">
                        <div className="col-lg-4 mb-4 mb-lg-0" data-aos="fade-up" data-aos-delay="200">
                            <div className="feature-box">
                                <div className="feature-icon me-sm-4 mb-3 mb-sm-0">
                                    <i className="bi bi-gear"></i>
                                </div>
                                <div className="feature-content">
                                    <h3 className="feature-title">Rapid Deployment</h3>
                                    <p className="feature-text">We deliver fast, without cutting corners. From idea to launch,
                                        ZORVIXE ensures your website or campaign goes live quickly — so you can start growing
                                        sooner.</p>
                                </div>
                            </div>
                        </div>

                        <div className="col-lg-4 mb-4 mb-lg-0" data-aos="fade-up" data-aos-delay="300">
                            <div className="feature-box">
                                <div className="feature-icon me-sm-4 mb-3 mb-sm-0">
                                    <i className="bi bi-window"></i>
                                </div>
                                <div className="feature-content">
                                    <h3 className="feature-title">Advanced Security</h3>
                                    <p className="feature-text">Your digital presence is safe with us. We implement the latest
                                        security practices to protect your website and data from threats, giving you and your
                                        clients peace of mind.
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="col-lg-4" data-aos="fade-up" data-aos-delay="400">
                            <div className="feature-box">
                                <div className="feature-icon me-sm-4 mb-3 mb-sm-0">
                                    <i className="bi bi-headset"></i>
                                </div>
                                <div className="feature-content">
                                    <h3 className="feature-title">Dedicated Support</h3>
                                    <p className="feature-text">We're with you every step of the way. Our team offers reliable,
                                        ongoing support to keep your website and campaigns running smoothly — anytime you need
                                        us.</p>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section id="about" className="about section">
                <div className="container">
                    <div className="row gy-4">
                        <div className="col-lg-6 content" data-aos="fade-up" data-aos-delay="100">
                            <p className="who-we-are">Who We Are</p>
                            <h3>Unleashing Potential with Creative Strategy</h3>
                            <p className="fst-italic">
                                At ZORVIXE, we're not just developers or marketers — we're digital growth partners. Our mission
                                is to help small businesses rise through innovative websites and results-driven marketing.
                            </p>
                            <ul>
                                <li><i className="bi bi-check-circle"></i> <span>💡 Driven by purpose</span></li>
                                <li><i className="bi bi-check-circle"></i> <span>⚙️ Built on tech & trust</span></li>
                                <li><i className="bi bi-check-circle"></i> <span>🚀 Focused on your growth</span></li>
                            </ul>
                            <a href="/about_us" className="read-more"><span>Read More</span><i className="bi bi-arrow-right"></i></a>
                        </div>

                        <div className="col-lg-6 about-images" data-aos="fade-up" data-aos-delay="200">
                            <div className="row gy-4">
                                <div className="col-lg-6">
                                    <img src="assets/img/about/about-portrait-1.webp" className="img-fluid" alt="" />
                                </div>
                                <div className="col-lg-6">
                                    <div className="row gy-4">
                                        <div className="col-lg-12">
                                            <img src="assets/img/about/about-8.webp" className="img-fluid" alt="" />
                                        </div>
                                        <div className="col-lg-12">
                                            <img src="assets/img/about/about-12.webp" className="img-fluid" alt="" />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section id="how-we-work" className="how-we-work section">
                <div className="container section-title" data-aos="fade-up">
                    <h2>How We Work</h2>
                    <p>Clear goals. Smart strategy. Fast execution — with you involved at every step.</p>
                </div>

                <div className="container" data-aos="fade-up" data-aos-delay="100">
                    <div className="steps-5">
                        <div className="process-container">
                            <div className="process-item" data-aos="fade-up" data-aos-delay="200">
                                <div className="content">
                                    <span className="step-number">01</span>
                                    <div className="card-body">
                                        <div className="step-icon">
                                            <i className="bi bi-pencil-square"></i>
                                        </div>
                                        <div className="step-content">
                                            <h3>Project Planning</h3>
                                            <p>We start with a clear plan — outlining goals, timelines, and deliverables to
                                                ensure every project runs smoothly from start to finish.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="process-item" data-aos="fade-up" data-aos-delay="300">
                                <div className="content">
                                    <span className="step-number">02</span>
                                    <div className="card-body">
                                        <div className="step-icon">
                                            <i className="bi bi-gear"></i>
                                        </div>
                                        <div className="step-content">
                                            <h3>Development Phase</h3>
                                            <p>We turn ideas into reality with clean code, smart design, and smooth
                                                functionality — all built to perform.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="process-item" data-aos="fade-up" data-aos-delay="400">
                                <div className="content">
                                    <span className="step-number">03</span>
                                    <div className="card-body">
                                        <div className="step-icon">
                                            <i className="bi bi-search"></i>
                                        </div>
                                        <div className="step-content">
                                            <h3>Testing &amp; QA</h3>
                                            <p>We thoroughly test your product to catch bugs and ensure it works smoothly across
                                                all devices, delivering a reliable and high-quality user experience.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>

                            <div className="process-item" data-aos="fade-up" data-aos-delay="500">
                                <div className="content">
                                    <span className="step-number">04</span>
                                    <div className="card-body">
                                        <div className="step-icon">
                                            <i className="bi bi-rocket-takeoff"></i>
                                        </div>
                                        <div className="step-content">
                                            <h3>Launch &amp; Support</h3>
                                            <p>We handle a smooth product launch and provide ongoing support to ensure your
                                                system stays up-to-date, secure, and performing at its best.</p>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section><section id="services" className="services section">
                <div className="container section-title" data-aos="fade-up">
                    <h2>Services</h2>
                    <p>We offer tailored solutions designed to meet your unique business needs, delivering quality and value
                        every step of the way.</p>
                </div>

                <div className="container" data-aos="fade-up" data-aos-delay="100">
                    <div className="row justify-content-center g-5">
                        <div className="col-md-6" data-aos="fade-right" data-aos-delay="100">
                            <div className="service-item">
                                <div className="service-icon">
                                    <i className="bi bi-code-slash"></i>
                                </div>
                                <div className="service-content">
                                    <h3>Custom Web Development</h3>
                                    <p>We build tailor-made websites and web applications that perfectly fit your business
                                        goals. From sleek designs to robust functionality, our solutions are crafted to provide
                                        an engaging and seamless user experience.</p>
                                    <a href="/services/web_development" className="service-link">
                                        <span>Learn More</span>
                                        <i className="bi bi-arrow-right"></i>
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="col-md-6" data-aos="fade-left" data-aos-delay="100">
                            <div className="service-item">
                                <div className="service-icon">
                                    <i className="bi bi-phone-fill"></i>
                                </div>
                                <div className="service-content">
                                    <h3>Mobile App Solutions</h3>
                                    <p>We create intuitive and powerful mobile apps designed to engage your users and drive
                                        business growth across all major platforms.</p>
                                    <a href="/services/mobile_app_solutions" className="service-link">
                                        <span>Learn More</span>
                                        <i className="bi bi-arrow-right"></i>
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="col-md-6" data-aos="fade-right" data-aos-delay="200">
                            <div className="service-item">
                                <div className="service-icon">
                                    <i className="bi bi-palette2"></i>
                                </div>
                                <div className="service-content">
                                    <h3>UI/UX Design</h3>
                                    <p>We create intuitive, attractive interfaces that engage users and provide smooth
                                        experiences. Our user-focused designs balance beauty and functionality to support your
                                        brand and meet user needs from start to finish.</p>
                                    <a href="/services/ui_ux" className="service-link">
                                        <span>Learn More</span>
                                        <i className="bi bi-arrow-right"></i>
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="col-md-6" data-aos="fade-left" data-aos-delay="200">
                            <div className="service-item">
                                <div className="service-icon">
                                    <i className="bi bi-bar-chart-line"></i>
                                </div>
                                <div className="service-content">
                                    <h3>Digital Marketing</h3>
                                    <p>We develop targeted digital marketing strategies that boost your online presence, engage
                                        your audience, and drive measurable results across multiple channels.</p>
                                    <a href="/services/digitalmarketing" className="service-link">
                                        <span>Learn More</span>
                                        <i className="bi bi-arrow-right"></i>
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="col-md-6" data-aos="fade-right" data-aos-delay="300">
                            <div className="service-item">
                                <div className="service-icon">
                                    <i className="bi bi-cloud-check"></i>
                                </div>
                                <div className="service-content">
                                    <h3>Web Hosting</h3>
                                    <p>Reliable, secure web hosting that ensures your site runs smoothly , without
                                        interruptions.</p>
                                    <a href="/services/web_hosting" className="service-link">
                                        <span>Learn More</span>
                                        <i className="bi bi-arrow-right"></i>
                                    </a>
                                </div>
                            </div>
                        </div>

                        <div className="col-md-6" data-aos="fade-left" data-aos-delay="300">
                            <div className="service-item">
                                <div className="service-icon">
                                    <i className="bi bi-graph-up"></i>
                                </div>
                                <div className="service-content">
                                    <h3>SEO Services</h3>
                                    <p>Boost your rankings with proven SEO techniques that improve visibility and attract
                                        quality traffic.</p>
                                    <a href="/services/seo" className="service-link">
                                        <span>Learn More</span>
                                        <i className="bi bi-arrow-right"></i>
                                    </a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section> <section id="services-alt" className="services-alt section">
                <div className="container" data-aos="fade-up" data-aos-delay="100">
                    <div className="row">
                        <div className="col-lg-6" data-aos="fade-up" data-aos-delay="100">
                            <div className="content-block">
                                <h6 className="subtitle">Our zorvixe services</h6>
                                <h2 className="title">Our customers excel in technology management</h2>
                                <p className="description">
                                    We empower our clients to lead in technology management by delivering innovative solutions
                                    and expert support. Our approach ensures they stay ahead of the curve, optimize operations,
                                    and achieve lasting success.
                                </p>
                                <div className="button-wrapper">
                                    <a className="btn" href="#services"><span>Explore All Services</span></a>
                                </div>
                            </div>
                        </div>
                        <div className="col-lg-6">
                            <div className="services-list">
                                <div className="service-item d-flex align-items-center" data-aos="fade-up" data-aos-delay="200">
                                    <div className="service-icon">
                                        <i className="bi bi-code-square"></i>
                                    </div>
                                    <div className="service-content">
                                        <h4><a href="/services/web_development">Software Engineering</a></h4>
                                        <p>Building reliable software tailored to your needs.</p>
                                    </div>
                                </div>

                                <div className="service-item d-flex align-items-center" data-aos="fade-up" data-aos-delay="300">
                                    <div className="service-icon">
                                        <i className="bi bi-graph-up"></i>
                                    </div>
                                    <div className="service-content">
                                        <h4><a href="/services/digitalmarketing">Business Analytics</a></h4>
                                        <p>Turning data into smart business insights.</p>
                                    </div>
                                </div>

                                <div className="service-item d-flex align-items-center" data-aos="fade-up" data-aos-delay="400">
                                    <div className="service-icon">
                                        <i className="bi bi-phone"></i>
                                    </div>
                                    <div className="service-content">
                                        <h4><a href="/services/mobile_app_solutions">Mobile Solutions</a></h4>
                                        <p>Delivering powerful apps for mobile success.</p>
                                    </div>
                                </div>

                                <div className="service-item d-flex align-items-center" data-aos="fade-up" data-aos-delay="500">
                                    <div className="service-icon">
                                        <i className="bi bi-gear"></i>
                                    </div>
                                    <div className="service-content">
                                        <h4><a href="/services/ui_ux">Tech Infrastructure</a></h4>
                                        <p>Building strong foundations for your technology.</p>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section><section id="call-to-action-2" className="call-to-action-2 section light-background">
                <div className="container" data-aos="fade-up" data-aos-delay="100">
                    <div className="row g-5 align-items-center">
                        <div className="col-lg-6" data-aos="fade-right" data-aos-delay="200">
                            <div className="cta-image-wrapper">
                                <img src="assets/img/cta/cta-4.webp" alt="Call to Action" className="img-fluid rounded-4" />
                                <div className="cta-pattern"></div>
                            </div>
                        </div>

                        <div className="col-lg-6" data-aos="fade-left" data-aos-delay="300">
                            <div className="cta-content">
                                <h2>Transform Your Vision Into Reality Today</h2>
                                <p className="lead">We bring your ideas to life with expert solutions tailored to your goals. From
                                    concept to launch, we ensure every step drives success.</p>

                                <div className="cta-features">
                                    <div className="feature-item" data-aos="zoom-in" data-aos-delay="400">
                                        <i className="bi bi-check-circle-fill"></i>
                                        <span>Innovative strategies that work</span>
                                    </div>
                                    <div className="feature-item" data-aos="zoom-in" data-aos-delay="450">
                                        <i className="bi bi-check-circle-fill"></i>
                                        <span>Dedicated to your growth</span>
                                    </div>
                                    <div className="feature-item" data-aos="zoom-in" data-aos-delay="500">
                                        <i className="bi bi-check-circle-fill"></i>
                                        <span>Delivering quality and value</span>
                                    </div>
                                </div>

                                <div className="cta-action mt-5">
                                    <a href="/contact_us" className="btn btn-primary btn-lg me-3">Get Started</a>
                                    <a href="/contact_us" className="btn btn-outline-primary btn-lg">Learn More</a>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section><section className="floating-section" style={{ position: 'relative', padding: '4rem 2rem', backgroundColor: '#f8f9fa' }}>
                <div className="floating-icons">
                    <div className="floating-icon animate-bounce"
                        style={{ top: '20%', left: '10%', animationDelay: '0s', animationDuration: '3s' }}>
                        <i className="bi bi-globe text-blue-500"></i>
                    </div>
                    <div className="floating-icon animate-bounce"
                        style={{ top: '40%', left: '5%', animationDelay: '1s', animationDuration: '4s' }}>
                        <i className="bi bi-phone text-green-500"></i>
                    </div>
                    <div className="floating-icon animate-bounce"
                        style={{ top: '60%', left: '12%', animationDelay: '2s', animationDuration: '3.5s' }}>
                        <i className="bi bi-code-slash text-purple-500"></i>
                    </div>

                    <div className="floating-icon animate-bounce"
                        style={{ top: '25%', right: '8%', animationDelay: '0.5s', animationDuration: '3.2s' }}>
                        <i className="bi bi-palette text-pink-500"></i>
                    </div>
                    <div className="floating-icon animate-bounce"
                        style={{ top: '45%', right: '15%', animationDelay: '1.5s', animationDuration: '3.8s' }}>
                        <i className="bi bi-bar-chart text-orange-500"></i>
                    </div>
                    <div className="floating-icon animate-bounce"
                        style={{ top: '65%', right: '5%', animationDelay: '2.5s', animationDuration: '3.3s' }}>
                        <i className="bi bi-shield-check text-red-500"></i>
                    </div>

                    <div className="floating-icon animate-bounce"
                        style={{ top: '35%', left: '25%', animationDelay: '3s', animationDuration: '4.2s' }}>
                        <i className="bi bi-bullseye text-indigo-500"></i>
                    </div>
                    <div className="floating-icon animate-bounce"
                        style={{ top: '55%', right: '25%', animationDelay: '3.5s', animationDuration: '3.7s' }}>
                        <i className="bi bi-people text-teal-500"></i>
                    </div>
                </div>

                <div className="text-center"
                    style={{ height: '500px', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
                    <h4 className="hero-title"><strong>Revolutionize Your Business with <br />Advanced Digital Solutions</strong></h4>
                    <p className="hero-description">Unlock growth with zorvixe top-notch website development, <br />digital marketing
                        services tailored for your success.</p>

                    <button className="btn" style={{ backgroundColor: '#5d57f4' }} onClick={redirectToContact}>
                        <span className="text-light">Enquire Now</span>
                    </button>
                </div>
            </section>

            <section id="faq" className="faq section">
                <div className="container" data-aos="fade-up" data-aos-delay="100">
                    <div className="row gy-5">
                        <div className="col-lg-6" data-aos="zoom-out" data-aos-delay="200">
                            <div className="faq-contact-card">
                                <div className="card-icon">
                                    <i className="bi bi-question-circle"></i>
                                </div>
                                <div className="card-content">
                                    <h3>Still Have Questions?</h3>
                                    <p>We're here to help! Reach out anytime via email, live chat, or phone — your support team is ready to assist.</p>
                                    <div className="contact-options">
                                        <a href="contact_us" className="contact-option">
                                            <i className="bi bi-envelope"></i>
                                            <span>Email Support</span>
                                        </a>
                                        <a href="contact_us" className="contact-option">
                                            <i className="bi bi-chat-dots"></i>
                                            <span>Live Chat</span>
                                        </a>
                                        <a href="contact_us" className="contact-option">
                                            <i className="bi bi-telephone"></i>
                                            <span>Call Us</span>
                                        </a>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <div className="col-lg-6" data-aos="fade-up" data-aos-delay="300">
                            <div className="faq-accordion">
                                {faqItems.map((item, index) => (
                                    <div
                                        key={index}
                                        className={`faq-item ${activeIndex === index ? 'faq-active' : ''}`}
                                        onClick={() => toggleFAQ(index)}
                                    >
                                        <div className="faq-header">
                                            <h3>{item.question}</h3>
                                            <i className={`bi bi-chevron-${activeIndex === index ? 'up' : 'down'} faq-toggle`}></i>
                                        </div>
                                        {activeIndex === index && (
                                            <div className="faq-content">
                                                <p>{item.answer}</p>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </section>

            <section id="contact" className="contact section">
                <div className="container section-title" data-aos="fade-up">
                    <h2>Contact</h2>
                    <p>Have a project in mind? Let's connect and bring it to life. We're here to answer your questions and get started.</p>
                </div>

                <div className="container" data-aos="fade-up" data-aos-delay="100">
                    <div className="row gy-4 mb-5">
                        <div className="col-lg-4" data-aos="fade-up" data-aos-delay="100">
                            <div className="info-card">
                                <div className="icon-box">
                                    <i className="bi bi-geo-alt"></i>
                                </div>
                                <h3>Our Address</h3>
                                <p>Kurnool Andhra Pradesh, Hyderabad, Banglore</p>
                            </div>
                        </div>

                        <div className="col-lg-4" data-aos="fade-up" data-aos-delay="200">
                            <div className="info-card">
                                <div className="icon-box">
                                    <i className="bi bi-telephone"></i>
                                </div>
                                <h3>Contact Number</h3>
                                <p>Mobile: +91 8328590444 / 7993971574<br />
                                    Email: zorvixe@gmail.com</p>
                            </div>
                        </div>

                        <div className="col-lg-4" data-aos="fade-up" data-aos-delay="300">
                            <div className="info-card">
                                <div className="icon-box">
                                    <i className="bi bi-clock"></i>
                                </div>
                                <h3>Opening Hour</h3>
                                <p>Monday - Friday: 9:00 - 18:00<br />
                                    Saturday & Sunday: Closed</p>
                            </div>
                        </div>
                    </div>

                    <div className="row">
                        <div className="col-lg-12">
                            <div className="form-wrapper" data-aos="fade-up" data-aos-delay="400">
                                <div className="contact-form-redirect">
                                    <div className="row">
                                        <div className="col-md-6 form-group">
                                            <div className="input-group">
                                                <span className="input-group-text"><i className="bi bi-person"></i></span>
                                                <input type="text" className="form-control" placeholder="Your name*" minLength="3"
                                                    maxLength="50" readOnly onClick={redirectToContactPage} />
                                            </div>
                                        </div>

                                        <div className="col-md-6 form-group">
                                            <div className="input-group">
                                                <span className="input-group-text"><i className="bi bi-envelope"></i></span>
                                                <input type="text" className="form-control" placeholder="Email address*"
                                                    maxLength="50" minLength="10" readOnly onClick={redirectToContactPage} />
                                            </div>
                                        </div>
                                    </div>

                                    <div className="row mt-3">
                                        <div className="col-md-6 form-group">
                                            <div className="input-group">
                                                <span className="input-group-text"><i className="bi bi-phone"></i></span>
                                                <input type="text" className="form-control" placeholder="Phone number*"
                                                    minLength="10" maxLength="10" readOnly onClick={redirectToContactPage} />
                                            </div>
                                            <small id="phoneError" className="text-danger" style={{ display: 'none' }}>Phone number must
                                                start with 6-9</small>
                                        </div>

                                        <div className="col-md-6 form-group">
                                            <div className="input-group">
                                                <span className="input-group-text"><i className="bi bi-list"></i></span>
                                                <select className="form-control" disabled onClick={redirectToContactPage}>
                                                    <option value="">Select service*</option>
                                                    <option value="Service 1">Consulting</option>
                                                    <option value="Service 2">Development</option>
                                                    <option value="Service 3">Marketing</option>
                                                    <option value="Service 4">Support</option>
                                                </select>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="form-group mt-3">
                                        <div className="input-group">
                                            <span className="input-group-text"><i className="bi bi-chat-dots"></i></span>
                                            <textarea className="form-control" rows="6" placeholder="Write a message*"
                                                minLength="10" maxLength="200" readOnly
                                                onClick={redirectToContactPage}></textarea>
                                        </div>
                                    </div>

                                    <div className="text-center" style={{ marginTop: '20px' }}>
                                        <button type="button" onClick={redirectToContactPage}>Submit Message</button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </section>
        </div>
    );
};

export default Home;