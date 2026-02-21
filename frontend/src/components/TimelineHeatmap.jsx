import { useState } from 'react'

function scoreToColor(score) {
  if (score >= 80) return '#4ade80'
  if (score >= 60) return '#a3e635'
  if (score >= 40) return '#facc15'
  if (score >= 20) return '#fb923c'
  return '#f87171'
}

export default function TimelineHeatmap({ segments, onSeek }) {
  const [selected, setSelected] = useState(null)

  const handleClick = (seg, idx) => {
    setSelected(idx === selected ? null : idx)
    if (onSeek) onSeek(seg.start_time)
  }

  return (
    <div className="timeline-heatmap">
      <h3>Performance Timeline</h3>
      <div className="heatmap-bar">
        {segments.map((seg, i) => (
          <div
            key={i}
            className="heatmap-segment"
            style={{ backgroundColor: scoreToColor(seg.score) }}
            onClick={() => handleClick(seg, i)}
            title={`${seg.start_time.toFixed(1)}s - ${seg.end_time.toFixed(1)}s: ${seg.score}%`}
          >
            {Math.round(seg.score)}
          </div>
        ))}
      </div>
      {selected !== null && segments[selected] && (
        <div className="segment-details">
          <span>
            {segments[selected].start_time.toFixed(1)}s &ndash;{' '}
            {segments[selected].end_time.toFixed(1)}s:{' '}
            <strong>{segments[selected].score}%</strong>
          </span>
          {segments[selected].problem_joints.length > 0 && (
            <div className="problem-joints">
              Needs work: {
                segments[selected].problem_joints
                  .map(j => typeof j === 'object' && j.joint ? j.joint : j)
                  .join(', ')
              }
            </div>
          )}
        </div>
      )}
    </div>
  )
}
