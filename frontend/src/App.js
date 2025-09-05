import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom"

// Import your components
import Contact from "./components/contact_us"
import NotFound from "./components/notfound"
import MobileAppSolutions from "./components/mobile_app_solutions"
import Footer from "./components/footer"
import DigitalMarketingService from "./components/digitalmarketing"
import Header from "./components/header"
import TermsAndConditions from "./components/terms_conditions"
import PrivacyPage from "./components/privacy_policy"
import Home from "./components/home"
import AboutUs from "./components/about_us"
import MaintenancePage from "./components/maintainance"
import SEOServicePage from "./components/seo"
import UIUX from "./components/ui_ux"
import WebHosting from "./components/webhosting"
import WebDevelopment from "./components/webdevelopment"
import Maintenance from "./components/maintainance"
import Payment from "./components/payment"
import Onboarding from "./components/Onboarding"
import "./App.css"

function App() {
  // Layout with header and footer
  const MainLayout = () => (
    <div className="App">
      <Header />
      <Outlet /> {/* Renders the matched child route */}
      <Footer />
    </div>
  )

  // Layout without header and footer
  const MinimalLayout = () => (
    <div className="App">
      <Outlet /> {/* Renders the matched child route */}
    </div>
  )

  return (
    <BrowserRouter>
      <Routes>
        {/* Routes with header/footer */}
        <Route element={<MainLayout />}>
          <Route path="/" element={<Home />} />
          <Route path="/about_us" element={<AboutUs />} />
          <Route path="/contact_us" element={<Contact />} />
          <Route path="/services/mobile_app_solutions" element={<MobileAppSolutions />} />
          <Route path="/services/digitalmarketing" element={<DigitalMarketingService />} />
          <Route path="/terms_conditions" element={<TermsAndConditions />} />
          <Route path="/privacy_policy" element={<PrivacyPage />} />
          <Route path="/maintainance" element={<MaintenancePage />} />
          <Route path="/services/seo" element={<SEOServicePage />} />
          <Route path="/services/web_hosting" element={<WebHosting />} />
          <Route path="/services/web_development" element={<WebDevelopment />} />
          <Route path="/services/ui_ux" element={<UIUX />} />
          <Route path="/maintainance" element={<Maintenance />} />
        </Route>

        {/* Routes without header/footer - FIXED ROUTES */}
        <Route element={<MinimalLayout />}>
          <Route path="/payment/:token" element={<Payment />} />
          <Route path="/onboarding/:token" element={<Onboarding />} />
        </Route>

        {/* Standalone route without layout */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
