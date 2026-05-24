import React, { useEffect } from 'react';

const Projects = () => {
    
    // Add page title and scroll to top on load
    useEffect(() => {
        window.scrollTo(0, 0);
        document.title = "Our Projects | Zorvixe Technologies";
    }, []);

    const projectsData = [
        {
            id: 1,
            clientName: "Aarogya",
            category: "Web Development",
            description: "A comprehensive healthcare portal designed to provide seamless access to medical resources and patient management.",
            review: "Zorvixe Technologies completely transformed our online presence. Their web development team delivered a stunning and user-friendly website that perfectly aligns with our brand vision!",
            color: "#0056b3",
            websiteLink: "https://aarogyabox.co.in/"
        },
        {
            id: 2,
            clientName: "Vastrudayam",
            category: "Web Development & Digital Marketing",
            description: "Targeted digital marketing campaigns that increased brand awareness and drove significant customer engagement.",
            review: "The digital marketing strategies provided by Zorvixe Technologies have significantly boosted our customer engagement and overall business growth. Highly recommended!",
            color: "#d97706",
            websiteLink: "https://vastrudayam.com/"
        },
        {
            id: 3,
            clientName: "One Solutions",
        
            category: "Tech Infrastructure",
            description: "Robust tech infrastructure planning and execution, enabling scalable growth for B2B services.",
            review: "We are extremely satisfied with the innovative tech solutions and seamless support from Zorvixe. They truly understand our business needs and deliver exceptional results.",
            color: "#0056b3",
            websiteLink: "https://onesolutionsekam.in/"
        },
        {
            id: 4,
            clientName: "Demo Tents",
     
            category: "UI/UX & Web Design",
            description: "An elegant e-commerce and catalog platform designed to showcase premium outdoor equipment and tents.",
            review: "Working with Zorvixe Technologies was a game-changer. Their web design perfectly showcases our products, and their marketing has driven fantastic results for us.",
            color: "#d97706",
            websiteLink: "https://demotents.com/"
        },
        // {
        //     id: 5,
        //     clientName: "She Needs",
       
        //     category: "E-Commerce Development",
        //     description: "A secure, fast, and feature-rich online shopping platform built specifically for modern retail needs.",
        //     review: "The e-commerce platform Zorvixe built for us is incredible. It's fast, secure, and has significantly improved our customers' shopping experience.",
        //     color: "#0056b3",
        //     websiteLink: "https://sheneedsjewellery.in/"
        // },
        {
            id: 6,
            clientName: "Shambala Coffee Works",
            category: "Digital Strategy",
            description: "End-to-end digital strategy implementation that successfully expanded online retail sales.",
            review: "We are thrilled with the digital strategy provided by Zorvixe. They helped us expand our reach and grow our online coffee sales tremendously.",
            color: "#d97706",
            websiteLink: "https://shambalaammacoffeeworks.com/"
        },
        {
            id: 7,
            clientName: "DV Shortlinks",
            category: "Custom Web Application",
            description: "A highly scalable custom web application designed for efficient link management and analytics tracking.",
            review: "The custom web application developed by Zorvixe Technologies is robust and highly scalable. Their technical expertise is truly unmatched.",
            color: "#0056b3",
            websiteLink: "https://dvshortylinks.com/"
        }
    ];

    return (
        <div className="projects-page pt-5 mt-5">
            {/* Hero Section */}
            <section className="section bg-light py-5">
                <div className="container text-center mt-1" data-aos="fade-up">
                    <div className="d-inline-block mb-3">
                        <span className="badge rounded-pill px-3 py-2 fw-semibold" style={{ backgroundColor: '#e0e7ff', color: '#4f46e5', letterSpacing: '1px', textTransform: 'uppercase', fontSize: '12px' }}>
                            Portfolio
                        </span>
                    </div>
                    <h1 className="display-4 fw-bold mb-4" style={{ color: '#1e293b' }}>
                        Our <span style={{ background: 'linear-gradient(135deg, #0056b3, #5d57f4)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>Client</span> Projects
                    </h1>
                    <p className="lead mx-auto" style={{ maxWidth: '700px', color: '#475569', fontSize: '1.1rem', lineHeight: '1.7' }}>
                        Explore some of our recent work. We partner with forward-thinking brands to build powerful digital experiences, 
                        scalable web applications, and result-driven marketing strategies.
                    </p>
                    <div className="mx-auto mt-4 mb-2" style={{ width: '60px', height: '4px', background: 'linear-gradient(90deg, #0056b3, #d97706)', borderRadius: '2px' }}></div>
                </div>
            </section>

            {/* Projects Grid */}
            <section className="section py-5">
                <div className="container">
                    <div className="row g-4">
                        {projectsData.map((project, index) => (
                            <div className="col-lg-6" key={project.id} data-aos="fade-up" data-aos-delay={`${(index % 2) * 100}`}>
                                <a href={project.websiteLink} target="_blank" rel="noopener noreferrer" className="project-card d-block h-100 shadow-sm rounded-4 overflow-hidden text-decoration-none" style={{ border: `1px solid #e2e8f0`, borderTop: `5px solid ${project.color}`, transition: 'transform 0.3s ease, box-shadow 0.3s ease', background: '#fff', color: 'inherit' }}>
                                    <div className="row g-0 h-100">
                                        <div className="col-md-5 p-0" style={{ backgroundColor: '#f8fafc', borderRight: '1px solid #e2e8f0', position: 'relative', overflow: 'hidden', minHeight: '300px' }}>
                                            <iframe 
                                                src={project.websiteLink} 
                                                title={project.clientName} 
                                                style={{ 
                                                    width: '400%', 
                                                    height: '400%', 
                                                    transform: 'scale(0.25)', 
                                                    transformOrigin: 'top left', 
                                                    border: 'none', 
                                                    pointerEvents: 'none',
                                                    position: 'absolute',
                                                    top: 0,
                                                    left: 0,
                                                    backgroundColor: '#fff'
                                                }} 
                                                tabIndex="-1"
                                                scrolling="no" 
                                                loading="lazy"
                                            />
                                        </div>
                                        <div className="col-md-7">
                                            <div className="card-body p-4 d-flex flex-column h-100">
                                                <div className="mb-2">
                                                    <span className="badge rounded-pill mb-2" style={{ backgroundColor: `${project.color}15`, color: project.color, fontWeight: '600', padding: '0.5em 1em' }}>{project.category}</span>
                                                    <h3 className="card-title fw-bold fs-4 mb-1" style={{ color: '#1e293b' }}>{project.clientName}</h3>
                                                </div>
                                                <p className="card-text text-secondary mb-4" style={{ fontSize: '15px' }}>{project.description}</p>
                                                
                                                <div className="mt-auto review-box p-3 rounded-3" style={{ backgroundColor: '#f1f5f9', borderLeft: `3px solid ${project.color}` }}>
                                                    <div className="stars mb-2" style={{ color: '#ffb900', fontSize: '14px' }}>
                                                        <i className="bi bi-star-fill me-1"></i>
                                                        <i className="bi bi-star-fill me-1"></i>
                                                        <i className="bi bi-star-fill me-1"></i>
                                                        <i className="bi bi-star-fill me-1"></i>
                                                        <i className="bi bi-star-fill"></i>
                                                    </div>
                                                    <p className="fst-italic mb-0" style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5' }}>"{project.review}"</p>
                                                </div>
                                                <div className="mt-3 text-end">
                                                    <span className="fw-bold" style={{ color: project.color, fontSize: '14px' }}>
                                                        Visit Website <i className="bi bi-box-arrow-up-right ms-1"></i>
                                                    </span>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </a>
                            </div>
                        ))}
                    </div>
                </div>
            </section>

            {/* CTA Section */}
            <section className="py-5" style={{ background: 'linear-gradient(135deg, #5d57f4, #8b5cf6)', position: 'relative', overflow: 'hidden' }}>
                <div className="container text-center position-relative z-1" data-aos="zoom-in">
                    <h2 className="display-5 fw-bold mb-3" style={{ color: '#ffffff' }}>Ready to start your next project?</h2>
                    <p className="lead mb-4" style={{ color: 'rgba(255, 255, 255, 0.9)' }}>Let's work together to create something amazing for your business.</p>
                    <a href="/contact_us" className="btn btn-light btn-lg px-5 py-3 fw-bold rounded-pill shadow-sm hover-elevate" style={{ color: '#5d57f4', transition: 'all 0.3s ease' }}>
                        Get in Touch <i className="bi bi-arrow-right ms-2"></i>
                    </a>
                </div>
            </section>

            {/* Inline CSS for hover effects */}
            <style dangerouslySetInnerHTML={{__html: `
                .project-card:hover {
                    transform: translateY(-5px);
                    box-shadow: 0 12px 30px rgba(0,0,0,0.12) !important;
                }
                .hover-elevate:hover {
                    transform: translateY(-3px);
                    box-shadow: 0 10px 20px rgba(0,0,0,0.2) !important;
                }
            `}} />
        </div>
    );
};

export default Projects;
