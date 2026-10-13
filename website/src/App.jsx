import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import FaqPage from './pages/FaqPage.jsx'
import CliPage from './pages/CliPage.jsx'
import DesktopPage from './pages/DesktopPage.jsx'
import ExtensionPage from './pages/ExtensionPage.jsx'
import NotFound from './pages/NotFound.jsx'

// On navigation: jump to the hash target if present, otherwise scroll to top.
function ScrollManager() {
  const { pathname, hash } = useLocation()
  useEffect(() => {
    if (hash) {
      const el = document.getElementById(hash.slice(1))
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        return
      }
    }
    window.scrollTo({ top: 0 })
  }, [pathname, hash])
  return null
}

export default function App() {
  // Page-wide scroll progress thread (optimized without layout thrashing)
  useEffect(() => {
    const thread = document.querySelector('[data-page-thread]')
    if (!thread) return

    let ticking = false
    let docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)

    const updateDocH = () => {
      docH = Math.max(1, document.documentElement.scrollHeight - window.innerHeight)
    }

    const onScroll = () => {
      if (ticking) return
      ticking = true
      requestAnimationFrame(() => {
        const pct = Math.min(1, Math.max(0, window.scrollY / docH))
        thread.style.transform = `scaleY(${pct})`
        ticking = false
      })
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', updateDocH, { passive: true })
    window.addEventListener('load', updateDocH, { passive: true })
    updateDocH()

    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', updateDocH)
      window.removeEventListener('load', updateDocH)
    }
  }, [])

  return (
    <>
      <div className="page-thread" aria-hidden="true" data-page-thread />
      <div className="cursor-accent" aria-hidden="true" data-cursor />
      <ScrollManager />
      <Nav />
      <main id="main-content">
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cli" element={<CliPage />} />
          <Route path="/desktop" element={<DesktopPage />} />
          <Route path="/extension" element={<ExtensionPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
