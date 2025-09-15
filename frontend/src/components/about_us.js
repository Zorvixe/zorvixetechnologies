"use client"

import { useState, useEffect } from "react"
import { motion, AnimatePresence } from "framer-motion"
import { Users, Target, Eye, Quote, ArrowRight, Sparkles } from "lucide-react"
import { useNavigate } from 'react-router-dom';

const AboutPage = () => {
  const [activeTab, setActiveTab] = useState("who-we-are")
  const [mounted, setMounted] = useState(false)
  useEffect(() => {
    document.title = "About Us | Zorvixe Technologies";
  }, []);
  useEffect(() => {
    setMounted(true)
  }, [])
  const navigate = useNavigate();


  const tabs = [
    {
      id: "who-we-are",
      icon: Users,
      title: "Who We Are",
      content:
        "Zorvixe is a dynamic technology-driven company specializing in website development, digital marketing, and branding solutions, helping businesses establish a powerful online presence and achieve measurable success.",
      image: "/assets/img/about/whoweare-bg.jpg",
      gradient: "linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)",
      bgClass: "bg-primary",
    },
    {
      id: "mission",
      icon: Target,
      title: "Mission",
      content:
        "We strive to deliver cutting-edge website development and result-driven digital marketing solutions, ensuring businesses achieve online excellence, engage their audience effectively, and stay ahead in an ever-evolving digital landscape.",
      image: "/assets/img/about/mission-bg.jpg",
      gradient: "linear-gradient(135deg, #10b981 0%, #0d9488 100%)",
      bgClass: "bg-success",
    },
    {
      id: "vision",
      icon: Eye,
      title: "Vision",
      content:
        "To be a leading digital solutions provider, empowering businesses with innovative website development and marketing strategies that drive growth, enhance brand identity, and create a lasting impact in the digital world.",
      image: "/assets/img/about/vision-bg.jpg",
      gradient: "linear-gradient(135deg, #f97316 0%, #dc2626 100%)",
      bgClass: "bg-warning",
    },
  ]

  const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: 0.2,
      },
    },
  }

  const itemVariants = {
    hidden: { opacity: 0, y: 30 },
    visible: {
      opacity: 1,
      y: 0,
      transition: {
        duration: 0.6,
        ease: "easeOut",
      },
    },
  }

  if (!mounted) return null

  return (
    <>
      <div className="min-h-100 bg-light">
        {/* Hero Section */}
        <section className="hero-gradient text-white position-relative overflow-hidden">
          {/* Background Pattern */}
          <div className="pattern-bg position-absolute w-100 h-100" style={{ opacity: 0.3 }}></div>

          {/* Floating Elements */}
          <div
            className="position-absolute floating-element"
            style={{
              top: "80px",
              left: "40px",
              width: "80px",
              height: "80px",
              background: "rgba(59, 130, 246, 0.2)",
              borderRadius: "50%",
              filter: "blur(20px)",
            }}
          ></div>
          <div
            className="position-absolute floating-element"
            style={{
              top: "160px",
              right: "80px",
              width: "120px",
              height: "120px",
              background: "rgba(139, 92, 246, 0.2)",
              borderRadius: "50%",
              filter: "blur(20px)",
            }}
          ></div>
          <div
            className="position-absolute floating-element"
            style={{
              bottom: "80px",
              left: "25%",
              width: "60px",
              height: "60px",
              background: "rgba(99, 102, 241, 0.2)",
              borderRadius: "50%",
              filter: "blur(20px)",
            }}
          ></div>

          <div className="container py-5" style={{ paddingTop: "120px", paddingBottom: "120px" }}>
            <motion.div variants={containerVariants} initial="hidden" animate="visible" className="text-center">
              <motion.div variants={itemVariants} className="mb-4">
                <div className="d-inline-flex align-items-center gap-2 glass-effect rounded-pill px-4 py-2 mb-4">
                  <Sparkles className="text-warning" size={16} />
                  <span className="small fw-medium">Digital Innovation Leaders</span>
                </div>
              </motion.div>

              <motion.h1
                variants={itemVariants}
                className="display-1 fw-bold mb-4 lh-1 text-light"
              >
                <span className="text-white">Zorvixe</span>
                <br />
                <span className="text-light display-2">
                  Transforming Ideas
                </span>
              </motion.h1>

              <motion.p
                variants={itemVariants}
                className="lead fs-4 mb-5 mx-auto text-light"
                style={{ maxWidth: "800px", lineHeight: "1.6" }}
              >
                Empowering businesses with expert website development, digital marketing, and creative branding
                solutions for unprecedented growth.
              </motion.p>

              <motion.div variants={itemVariants} className="mb-5">
                <button className="btn btn-blue btn-lg px-5 py-3 rounded-pill fs-5 d-inline-flex align-items-center gap-2">
                  Discover Our Story
                  <ArrowRight size={20} />
                </button>
              </motion.div>

              <motion.div variants={itemVariants} className="position-relative">
                <div className="position-relative rounded-4 overflow-hidden shadow-lg border border-light border-opacity-25">
                  <img
                    src="/assets/img/about/aboutus1.jpg"
                    alt="Zorvixe Team"
                    className="img-fluid w-100"
                    style={{ height: "500px", objectFit: "cover" }}
                  />
                  <div
                    className="position-absolute top-0 start-0 w-100 h-100"
                    style={{ background: "linear-gradient(to top, rgba(0,0,0,0.2), transparent)" }}
                  ></div>
                </div>

                {/* Decorative Elements */}
                <div
                  className="position-absolute bg-warning rounded-circle"
                  style={{
                    top: "-16px",
                    left: "-16px",
                    width: "32px",
                    height: "32px",
                    animation: "bounce 2s infinite",
                  }}
                ></div>
                <div
                  className="position-absolute bg-info rounded-circle"
                  style={{
                    bottom: "-16px",
                    right: "-16px",
                    width: "24px",
                    height: "24px",
                    animation: "bounce 2s infinite",
                    animationDelay: "1s",
                  }}
                ></div>
              </motion.div>
            </motion.div>
          </div>

          {/* Bottom Wave */}
          <div className="position-absolute bottom-0 start-0 w-100">
            <svg
              viewBox="0 0 1200 120"
              preserveAspectRatio="none"
              className="w-100"
              style={{ height: "60px", fill: "#f8f9fa" }}
            >
              <path d="M0,0V46.29c47.79,22.2,103.59,32.17,158,28,70.36-5.37,136.33-33.31,206.8-37.5C438.64,32.43,512.34,53.67,583,72.05c69.27,18,138.3,24.88,209.4,13.08,36.15-6,69.85-17.84,104.45-29.34C989.49,25,1113-14.29,1200,52.47V0Z"></path>
            </svg>
          </div>
        </section>

        {/* Tab Section */}
        <section className="py-5" style={{ paddingTop: "120px", paddingBottom: "120px" }}>
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="text-center mb-5"
            >
              <h2 className="display-3 fw-bold text-dark mb-4">
                Our <span className="text-gradient-blue">Story</span>
              </h2>
              <p className="fs-4 text-muted mx-auto" style={{ maxWidth: "600px" }}>
                Discover what drives us, our mission, and our vision for the future
              </p>
            </motion.div>

            {/* Tab Navigation */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6, delay: 0.2 }}
              viewport={{ once: true }}
              className="d-flex flex-wrap justify-content-center gap-3 mb-5"
            >
              {tabs.map((tab) => {
                const IconComponent = tab.icon
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`btn d-flex align-items-center gap-2 px-4 py-3 rounded-4 fw-semibold tab-button ${activeTab === tab.id ? `text-white active` : "btn-outline-secondary bg-white"
                      }`}
                    style={activeTab === tab.id ? { background: tab.gradient } : {}}
                  >
                    <IconComponent size={20} />
                    {tab.title}
                  </button>
                )
              })}
            </motion.div>

            {/* Tab Content */}
            <AnimatePresence mode="wait">
              {tabs.map(
                (tab) =>
                  activeTab === tab.id && (
                    <motion.div
                      key={tab.id}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: -20 }}
                      transition={{ duration: 0.5 }}
                    >
                      <div className="card border-0 shadow-lg overflow-hidden glass-effect">
                        <div className="row g-0">
                          <div className="col-lg-6">
                            <div className="card-body p-5 d-flex flex-column justify-content-center h-100">
                              <div className="mb-4">
                                <Quote className="text-muted mb-3" size={48} />
                                <h3 className="display-6 fw-bold text-dark mb-4">{tab.title}</h3>
                              </div>

                              <blockquote className="fs-5 text-muted mb-4 lh-base">{tab.content}</blockquote>

                              <div
                                className="rounded-pill"
                                style={{
                                  width: "80px",
                                  height: "4px",
                                  background: tab.gradient,
                                }}
                              ></div>
                            </div>
                          </div>

                          <div className="col-lg-6 position-relative">
                            <div
                              className="position-absolute top-0 start-0 w-100 h-100"
                              style={{ background: "linear-gradient(135deg, rgba(0,0,0,0.2), transparent)", zIndex: 1 }}
                            ></div>
                            <img
                              src={tab.image || "/placeholder.svg"}
                              alt={tab.title}
                              className="img-fluid w-100 h-100"
                              style={{ objectFit: "cover", minHeight: "400px" }}
                            />
                            <div
                              className="position-absolute bottom-0 end-0 rounded-circle"
                              style={{
                                width: "120px",
                                height: "120px",
                                background: tab.gradient,
                                opacity: 0.2,
                                filter: "blur(40px)",
                              }}
                            ></div>
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  ),
              )}
            </AnimatePresence>
          </div>
        </section>

        {/* CTA Section */}
        <section className="py-5" >
          <div className="container">
            <motion.div
              initial={{ opacity: 0, y: 30 }}
              whileInView={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
            >
              <div className="card border-0 shadow-lg overflow-hidden cta-gradient text-white position-relative" style={{ backgroundColor: '#5d57f4' }}>
                {/* Background Pattern */}
                <div className="position-absolute w-100 h-100 pattern-bg" style={{ opacity: 0.1 }}></div>

                {/* Floating Elements */}
                <div
                  className="position-absolute floating-element"
                  style={{
                    top: "40px",
                    left: "40px",
                    width: "80px",
                    height: "80px",
                    background: "rgba(251, 191, 36, 0.2)",
                    borderRadius: "50%",
                    filter: "blur(20px)",
                  }}
                ></div>
                <div
                  className="position-absolute floating-element"
                  style={{
                    bottom: "40px",
                    right: "40px",
                    width: "120px",
                    height: "120px",
                    background: "rgba(59, 130, 246, 0.2)",
                    borderRadius: "50%",
                    filter: "blur(20px)",
                  }}
                ></div>
                <div
                  className="position-absolute floating-element"
                  style={{
                    top: "50%",
                    left: "25%",
                    width: "60px",
                    height: "60px",
                    background: "rgba(139, 92, 246, 0.2)",
                    borderRadius: "50%",
                    filter: "blur(20px)",
                  }}
                ></div>

                <div
                  className="card-body text-center py-5 px-4 position-relative"
                  style={{ zIndex: 2, paddingTop: "120px", paddingBottom: "120px" }}
                >
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.6, delay: 0.2 }}
                    viewport={{ once: true }}
                  >
                    <div className="d-inline-flex align-items-center gap-2 glass-effect rounded-pill px-4 py-2 mb-4" >
                      <Sparkles className="text-warning" size={16} />
                      <span className="small fw-medium">Ready to Transform?</span>
                    </div>

                    <h2 className="display-3 fw-bold mb-4 text-light">
                      Transforming Ideas into <br></br> <span className="text-light text-blue" style={{ backgroundColor: '#5d57f4' }}>Digital Excellence!</span>
                    </h2>

                    <p className="fs-4 mb-5 mx-auto text-light" style={{ maxWidth: "700px", lineHeight: "1.6" }}>
                      At Zorvixe, we craft cutting-edge websites, powerful digital marketing strategies, and
                      smart business solutions that drive real results.
                    </p>
                    <button
                      className="btn btn-blue btn-lg px-5 py-3 rounded-pill fs-5 d-inline-flex align-items-center gap-2"
                      onClick={() => navigate('/contact_us')}
                    >
                      Let's Start Your Journey
                      <ArrowRight size={20} />
                    </button>

                  </motion.div>
                </div>
              </div>
            </motion.div>
          </div>
        </section>
      </div>
    </>
  )
}

export default AboutPage