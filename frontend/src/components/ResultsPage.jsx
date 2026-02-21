import { useState } from 'react'
import ScoreDisplay from './ScoreDisplay'
import VideoPlayer from './VideoPlayer'
import TimelineHeatmap from './TimelineHeatmap'

export default function ResultsPage({ results, videos, onReset }) {
  const [seekTime, setSeekTime] = useState(null)

  return (
    <div className="results-page">
      <div className="results-top-bar">
        <button className="back-btn" onClick={onReset}>
          &larr; New Comparison
        </button>
      </div>

      <ScoreDisplay score={results.overall_score} />

      <VideoPlayer results={results} videos={videos} seekTime={seekTime} />

      <TimelineHeatmap
        segments={results.segment_scores}
        onSeek={(t) => setSeekTime(t)}
      />
    </div>
  )
}
