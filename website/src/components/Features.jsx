import { useState } from 'react'
import Reveal from './Reveal.jsx'
import { featureCategories } from '../data/features.jsx'
import FeatureShowcase from './FeatureShowcase.jsx'

export default function Features() {
  const [activeCat, setActiveCat] = useState('orchestration')
  const currentCategory = featureCategories.find((cat) => cat.id === activeCat)

  return (
    <>
      <div className="product-header">
        <p className="eyebrow">— Capabilities</p>
        <h2 className="product-h2">
          An agent, not a <em className="accent">chatbot</em>.
        </h2>
        <p className="subtext">
          SuperAgent plans, executes tools, and self-corrects in real-time — running natively on your hardware with your preferred LLM provider or local models.
        </p>
      </div>

      {/* Categories Tabs Selector */}
      <div className="features-cat-selector">
        {featureCategories.map((cat) => (
          <button
            key={cat.id}
            className={`cat-tab-btn ${activeCat === cat.id ? 'active' : ''}`}
            onClick={() => setActiveCat(cat.id)}
          >
            {cat.name}
          </button>
        ))}
      </div>

      {/* Description of current category */}
      {currentCategory && (
        <div className="category-description-box" key={activeCat + '-desc'}>
          <p>{currentCategory.desc}</p>
        </div>
      )}

      {/* Grid of features for active category */}
      <div className="feat-grid" key={activeCat + '-grid'}>
        {currentCategory &&
          currentCategory.features.map((f, i) => (
            <article className="feat" key={i}>
              <div className="ico">{f.icon}</div>
              <h3>{f.title}</h3>
              <p>{f.body}</p>
            </article>
          ))}
      </div>

      <FeatureShowcase />
    </>
  )
}
