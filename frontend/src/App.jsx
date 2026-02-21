import { useState } from 'react'
import UploadPage from './components/UploadPage'
import ResultsPage from './components/ResultsPage'
import './App.css'

function App() {
  const [results, setResults] = useState(null)
  const [videos, setVideos] = useState({ reference: null, attempt: null })

  const handleResults = (data, videoFiles) => {
    setResults(data)
    setVideos(videoFiles)
  }

  const handleReset = () => {
    setResults(null)
    setVideos({ reference: null, attempt: null })
  }

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-content">
          <div className="header-left">
            {results && (
              <button className="back-btn-top" onClick={handleReset}>
                &larr; New Comparison
              </button>
            )}
          </div>
          <div className="header-center">
            <h1>DanceCompare</h1>
            <p className="subtitle">AI-powered pose analysis</p>
          </div>
          <div className="header-right"></div>
        </div>
      </header>
      <main>
        {results ? (
          <ResultsPage
            results={results}
            videos={videos}
            onReset={handleReset}
          />
        ) : (
          <UploadPage onResults={handleResults} />
        )}
      </main>
    </div>
  )
}

export default App
