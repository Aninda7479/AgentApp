import { useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Nav from './components/Nav.jsx'
import Footer from './components/Footer.jsx'
import Home from './pages/Home.jsx'
import FaqPage from './pages/FaqPage.jsx'
import CliPage from './pages/CliPage.jsx'
import DesktopPage from './pages/DesktopPage.jsx'
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
  return (
    <>
      <ScrollManager />
      <Nav />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/cli" element={<CliPage />} />
          <Route path="/desktop" element={<DesktopPage />} />
          <Route path="/faq" element={<FaqPage />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </main>
      <Footer />
    </>
  )
}
