import { useState } from 'react'
import Reveal from './Reveal.jsx'
import { featureCategories } from '../data/features.jsx'
import FeatureShowcase from './FeatureShowcase.jsx'

export default function Features() {
  const [activeCat, setActiveCat] = useState('orchestration')

  const currentCategory = featureCategories.find((cat) => cat.id === activeCat)

  return (
    <>
      <Reveal className="sec-head">
        <p className="eyebrow">What it does</p>
        <h2 className="h-section">An agent, not a chatbot</h2>
        <p className="lead">
          SuperAgent plans, acts, and corrects itself across the tools you already use — then hands you the result.
        </p>
      </Reveal>

      {/* Categories Tabs Selector */}
      <Reveal className="features-cat-selector">
        {featureCategories.map((cat) => (
          <button
            key={cat.id}
            className={`cat-tab-btn ${activeCat === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCat(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </Reveal>

      {/* Description of current category */}
      {currentCategory && (
        <Reveal className="category-description-box" key={activeCat + '-desc'}>
          <p>{currentCategory.desc}</p>
        </Reveal>
      )}

      {/* Grid of features for active category */}
      <div className="feat-grid" style={{ marginBottom: '80px' }} key={activeCat + '-grid'}>
        {currentCategory &&
          currentCategory.features.map((f, i) => (
            <Reveal className="feat" key={i}>
              <div className="ico">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </Reveal>
          ))}
      </div>

      <FeatureShowcase />
    </>
  )
}
