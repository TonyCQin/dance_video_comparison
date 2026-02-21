export default function ScoreDisplay({ score }) {
  let colorClass = 'score-poor'
  if (score >= 85) colorClass = 'score-excellent'
  else if (score >= 70) colorClass = 'score-good'
  else if (score >= 50) colorClass = 'score-fair'

  return (
    <div className="score-display">
      <div className={`score-value ${colorClass}`}>{Math.round(score)}</div>
      <div className="score-label">Overall Similarity Score</div>
    </div>
  )
}
