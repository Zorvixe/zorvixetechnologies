import React, { useState, useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Monitor,
  Megaphone,
  PenTool,
  TrendingUp,
  Cloud,
  Smartphone,
  ChevronDown,
  X,
  Menu
} from "lucide-react";

const Header = () => {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [servicesDropdownOpen, setServicesDropdownOpen] = useState(false);
  const [mobileServicesExpanded, setMobileServicesExpanded] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [clickedServices, setClickedServices] = useState(false); // New state
  const location = useLocation();
  const servicesRef = useRef(null); // Ref for services dropdown

  // Scroll shadow
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Close mobile nav on route change
  useEffect(() => {
    setMobileNavOpen(false);
    setMobileServicesExpanded(false);
    // Also reset services dropdown states
    setServicesDropdownOpen(false);
    setClickedServices(false);
  }, [location.pathname]);

  // Close mobile nav on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (mobileNavOpen && !e.target.closest('.mobile-sidebar') && !e.target.closest('.mobile-nav-toggle')) {
        setMobileNavOpen(false);
      }
    };
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [mobileNavOpen]);

  // Close services dropdown on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (servicesDropdownOpen && servicesRef.current && !servicesRef.current.contains(e.target)) {
        setServicesDropdownOpen(false);
        setClickedServices(false);
      }
    };
    
    document.addEventListener('click', handleClickOutside);
    return () => document.removeEventListener('click', handleClickOutside);
  }, [servicesDropdownOpen]);

  // Prevent body scrolling when mobile nav is open
  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'auto';
    }

    return () => {
      document.body.style.overflow = 'auto';
    };
  }, [mobileNavOpen]);

  const isActive = (path) => location.pathname === path;

  const services = [
    { name: "Web Development", icon: Monitor, href: "/services/web_development", description: "Custom websites and web applications" },
    { name: "Digital Marketing", icon: Megaphone, href: "/services/digitalmarketing", description: "SEO, PPC, and social media marketing" },
    { name: "UIUX Design", icon: PenTool, href: "/services/ui_ux", description: "Engaging UIUX Design brand" },
    { name: "SEO Services", icon: TrendingUp, href: "/services/seo", description: "Improve your search rankings" },
    { name: "Web Hosting", icon: Cloud, href: "/services/web_hosting", description: "Reliable and secure hosting solutions" },
    { name: "Mobile App Solutions", icon: Smartphone, href: "/services/mobile_app_solutions", description: "Mobile apps for iOS and Android" },
  ];

  return (
    <>
      <header id="header" className={`header fixed-top ${scrolled ? 'scrolled' : ''}`}>
        <div className="container position-relative d-flex align-items-center justify-content-between">
          {/* Logo */}
          <Link to="/" className="logo d-flex align-items-center me-auto me-xl-0">
            <img src="/assets/img/zorvixe_logo_main.png" alt="Zorvixe Technologies Logo" />
          </Link>

          {/* Desktop Nav */}
          <nav id="navmenu" className="navmenu d-none d-xl-block">
            <ul>
              <li>
                <Link to="/" className={isActive('/') ? 'active' : ''}>Home</Link>
              </li>
              <li>
                <Link to="/about_us" className={isActive('/about_us') ? 'active' : ''}>About</Link>
              </li>
              <li 
                className="services-dropdown" 
                ref={servicesRef} // Attach ref here
              >
                <Link
                  to="#"
                  className={isActive("#") ? "active" : ""}
                  onMouseEnter={() => {
                    // Only open on hover if not already opened by click
                    if (!clickedServices) {
                      setServicesDropdownOpen(true);
                    }
                  }}
                  onMouseLeave={() => {
                    // Only close on hover if not opened by click
                    if (!clickedServices) {
                      setServicesDropdownOpen(false);
                    }
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    // Toggle dropdown when clicked
                    const newState = !servicesDropdownOpen;
                    setServicesDropdownOpen(newState);
                    setClickedServices(newState);
                  }}
                >
                  Services <ChevronDown size={16} className="ms-1" />
                </Link>
                <div
                  className={`dropdown-menu ${servicesDropdownOpen ? "show" : ""}`}
                  onMouseEnter={() => setServicesDropdownOpen(true)}
                  onMouseLeave={() => {
                    // Only close on hover leave if not opened by click
                    if (!clickedServices) {
                      setServicesDropdownOpen(false);
                    }
                  }}
                >
                  <div className="services-grid">
                    <div>
                      <h3 className="mb-3 text-dark">Our Services</h3>
                      <div className="services-list_navbar">
                        {services.map((service) => {
                          const IconComponent = service.icon;
                          return (
                            <Link
                              key={service.name}
                              to={service.href}
                              className="service-item_navbar"
                              onClick={() => {
                                setServicesDropdownOpen(false);
                                setClickedServices(false);
                              }}
                            >
                              <div className="service-icon">
                                <IconComponent size={20} />
                              </div>
                              <div className="service-info_navbar">
                                <h4>{service.name}</h4>
                                <p>{service.description}</p>
                              </div>
                            </Link>
                          );
                        })}
                      </div>
                    </div>
                    <div className="dropdown-image">
                      <img src="/assets/img/services/header_services.jpg" alt="Zorvixe Technologies Professional Services" />
                    </div>
                  </div>
                </div>
              </li>
              <li>
                <Link to="/contact_us" className={isActive('/contact_us') ? 'active' : ''}>Contact</Link>
              </li>
            </ul>
          </nav>

          {/* Get Started Button */}
          <Link className="btn-getstarted d-xl-inline-block" to="/contact_us">
            Get Started
          </Link>

          {/* Fixed Mobile Nav Toggle */}
          <button
            className="mobile-nav-toggle d-xl-none"
            onClick={(e) => {
              e.stopPropagation();
              setMobileNavOpen(!mobileNavOpen);
            }}
            aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
          >
            <div className="icon-container">
              {mobileNavOpen ? <div className='close-icon-bg'>
                <button
                  className="close-btn close-icon"
                  onClick={() => setMobileNavOpen(false)}
                  aria-label="Close menu"
                >
                  <X size={10} />
                </button>
              </div> : <Menu className='menu-icon' size={24} />}
            </div>
          </button>
        </div>

        {/* Mobile Sidebar */}
        <div className={`mobile-sidebar ${mobileNavOpen ? 'open' : ''}`}>
          <div className="sidebar-header">
            <img src="/assets/img/zorvixe_logo_main.png" alt="Zorvixe Technologies Logo" className="sidebar-logo" />
          </div>

          <div className="sidebar-body">
            <ul className="sidebar-nav">
              <li className="sidebar-nav-item">
                <Link
                  to="/"
                  className={`sidebar-nav-link ${isActive('/') ? 'active' : ''}`}
                  onClick={() => setMobileNavOpen(false)}
                >
                  Home
                </Link>
              </li>
              <li className="sidebar-nav-item">
                <Link
                  to="/about_us"
                  className={`sidebar-nav-link ${isActive('/about_us') ? 'active' : ''}`}
                  onClick={() => setMobileNavOpen(false)}
                >
                  About
                </Link>
              </li>
              <li className="sidebar-nav-item">
                <button
                  className={`sidebar-services-btn ${mobileServicesExpanded ? 'expanded' : ''}`}
                  onClick={() => setMobileServicesExpanded(!mobileServicesExpanded)}
                  aria-expanded={mobileServicesExpanded}
                >
                  Services <ChevronDown size={16} className={`chevron-icon ${mobileServicesExpanded ? 'rotate' : ''}`} />
                </button>

                {/* Services list - now inside the sidebar */}
                <div className={`mobile-services-list ${mobileServicesExpanded ? 'expanded' : ''}`}>
                  {services.map((service) => {
                    const IconComponent = service.icon;
                    return (
                      <Link
                        key={service.name}
                        to={service.href}
                        className="mobile-service-item_navbar"
                        onClick={() => {
                          setMobileServicesExpanded(false);
                          setMobileNavOpen(false);
                        }}
                      >
                        <div className="mobile-service-icon">
                          <IconComponent size={20} />
                        </div>
                        <div className="mobile-service-info_navbar">
                          <h4>{service.name}</h4>
                          <p>{service.description}</p>
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </li>
              <li className="sidebar-nav-item">
                <Link
                  to="/contact_us"
                  className={`sidebar-nav-link ${isActive('/contact_us') ? 'active' : ''}`}
                  onClick={() => setMobileNavOpen(false)}
                >
                  Contact
                </Link>
              </li>
            </ul>

            <Link
              to="/contact_us"
              className="btn-getstarted mobile-getstarted"
              onClick={() => setMobileNavOpen(false)}
            >
              Get Started
            </Link>
          </div>
        </div>

        {/* Mobile Sidebar Overlay */}
        <div
          className={`sidebar-overlay ${mobileNavOpen ? 'open' : ''}`}
          onClick={() => setMobileNavOpen(false)}
        />
      </header>
    </>
  );
};

export default Header;