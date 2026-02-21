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
        <h1>DanceCompare</h1>
        <p className="subtitle">Compare your dance moves with AI-powered pose analysis</p>
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
