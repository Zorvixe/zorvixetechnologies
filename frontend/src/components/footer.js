import { Link } from 'react-router-dom';

const Footer = () => {
  const currentYear = new Date().getFullYear();

  return (
    <footer id="footer" className="footer light-background">
      <div className="container footer-top">
        <div className="row gy-4">
          {/* Company Info */}
          <div className="col-lg-4 col-md-6 footer-about">
            <Link to="/" className="logo d-flex align-items-center">
              <img src="/assets/img/zorvixe_logo_main.png" alt="Zorvixe Technologies Logo" />
              <span>.</span>
            </Link>
            <div className="footer-contact pt-1">
              <p>
                ZORVIXE TECHNNOLOGIES – Your trusted partner for digital solutions. We empower businesses with
                cutting-edge technology to enhance efficiency, growth, and online presence.
              </p>
            </div>
          </div>

          {/* Useful Links */}
          <div className="col-lg-2 col-md-3 footer-links">
            <h4>Useful Links</h4>
            <ul>
              <li><a href="/">Home</a></li>
              <li><a href="/about_us">About us</a></li>
              <li><a href="#services">Services</a></li>
              <li><Link to="/terms_conditions">Terms of service</Link></li>
              <li><Link to="/privacy_policy">Privacy policy</Link></li>
            </ul>
          </div>

          {/* Services Links */}
          <div className="col-lg-2 col-md-3 footer-links">
            <h4>Our Services</h4>
            <ul>
              <li><Link to="/services/ui_ux">Web Design</Link></li>
              <li><Link to="/services/web_development">Web Development</Link></li>
              <li><Link to="/services/web_development">Product Management</Link></li>
              <li><Link to="/services/digitalmarketing">Marketing</Link></li>
              <li><Link to="/services/ui_ux">Graphic Design</Link></li>
            </ul>
          </div>

          {/* Contact Info */}
          <div className="col-lg-4 col-md-6 footer-about">
            <h4>Address</h4>
            <div className="footer-contact">
              <p>Kurnool Andhra Pradesh, Hyderabad, Banglore</p>
              <p className="mt-3"><strong>Phone:</strong> <span>+91 8328590444 / 7993971574</span></p>
              <p><strong>Email:</strong> <span>zorvixetechnologies@gmail.com</span></p>
            </div>
            <div className="social-links d-flex mt-4">
              <a href="https://x.com/zorvixe_tech" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-twitter-x"></i>
              </a>
              <a href="https://www.facebook.com/profile.php?id=61577972005358" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-facebook"></i>
              </a>
              <a href="https://www.instagram.com/zorvixe_technologies/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-instagram"></i>
              </a>
              <a href="https://www.linkedin.com/company/107967394/" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-linkedin"></i>
              </a>
               <a href="https://whatsapp.com/channel/0029VbApYIiElagpz0IKPm11" target="_blank" rel="noopener noreferrer">
                <i className="bi bi-whatsapp"></i>
              </a>
            </div>
          </div>
        </div>
      </div>

      {/* Copyright */}
      <div className="container copyright text-center mt-4">
        <p>
          <span>Copyright &copy; {currentYear}</span>
          <strong className="px-1 sitename">ZORVIXE TECHNNOLOGIES</strong>
          <span>All Rights Reserved</span>
        </p>
      </div>

      {/* Scroll Top Button */}
      <button
        id="scroll-top"
        className="scroll-top d-flex align-items-center justify-content-center"
        aria-label="Scroll to top"
        onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
      >
        <i className="bi bi-arrow-up-short"></i>
      </button>

    </footer>
  );
};

export default Footer;