import { useState } from 'react'
import ScoreDisplay from './ScoreDisplay'
import VideoPlayer from './VideoPlayer'
import TimelineHeatmap from './TimelineHeatmap'

function ScoreDebugPanel({ results }) {
  if (!results || !results.segment_scores) return null;
  const angleRaw = results.debug?.segment_angle_sims_raw || [];
  const angleScaled = results.debug?.segment_angle_sims_scaled || [];
  const posRaw = results.debug?.segment_pos_sims_raw || [];
  const posScaled = results.debug?.segment_pos_sims_scaled || [];
  return (
    <div className="score-debug-panel" style={{
      background: '#181824',
      color: '#b4a0ff',
      borderRadius: 10,
      margin: '32px 0 0 0',
      padding: 24,
      boxShadow: '0 2px 16px #000a',
      maxWidth: 900,
      marginLeft: 'auto',
      marginRight: 'auto',
    }}>
      <h3 style={{marginTop:0, marginBottom:12, color:'#fff'}}>Score Debug Breakdown</h3>
      <div style={{fontSize:'1.05em', marginBottom:12}}>
        <strong>Overall Score:</strong> {results.overall_score}
      </div>
      <div style={{overflowX:'auto'}}>
        <table style={{width:'100%', borderCollapse:'collapse', fontSize:'0.95em'}}>
          <thead>
            <tr style={{background:'#23233a', color:'#b4a0ff'}}>
              <th style={{padding:'6px 10px', border:'1px solid #23233a'}}>Segment</th>
              <th style={{padding:'6px 10px', border:'1px solid #23233a'}}>Time Range (s)</th>
              <th style={{padding:'6px 10px', border:'1px solid #23233a'}}>Score</th>
              <th style={{padding:'6px 10px', border:'1px solid #23233a', backgroundColor: '#2a2a4a'}}>Angle Raw</th>
              <th style={{padding:'6px 10px', border:'1px solid #23233a', backgroundColor: '#2a2a4a'}}>Angle Scaled</th>
              <th style={{padding:'6px 10px', border:'1px solid #23233a', backgroundColor: '#2a3a2a'}}>Pos Diff (MSE)</th>
              <th style={{padding:'6px 10px', border:'1px solid #23233a', backgroundColor: '#2a3a2a'}}>Pos Scaled</th>
              <th style={{padding:'6px 10px', border:'1px solid #23233a'}}>Problem Joints</th>
            </tr>
          </thead>
          <tbody>
            {results.segment_scores.map((seg, i) => (
              <tr key={i} style={{background: i%2 ? '#15151e' : '#23233a'}}>
                <td style={{padding:'6px 10px', border:'1px solid #23233a', textAlign:'center'}}>{i+1}</td>
                <td style={{padding:'6px 10px', border:'1px solid #23233a', textAlign:'center'}}>
                  {seg.start_time.toFixed(2)} - {seg.end_time.toFixed(2)}
                </td>
                <td style={{padding:'6px 10px', border:'1px solid #23233a', textAlign:'center'}}>{seg.score}</td>
                <td style={{padding:'6px 10px', border:'1px solid #23233a', textAlign:'center', color:'#93c5fd', backgroundColor: '#1a1a2a'}}>
                  {angleRaw[i] !== undefined ? (angleRaw[i]*100).toFixed(1) : '-'}
                </td>
                <td style={{padding:'6px 10px', border:'1px solid #23233a', textAlign:'center', color:'#93c5fd', backgroundColor: '#1a1a2a'}}>
                  {angleScaled[i] !== undefined ? (angleScaled[i]*100).toFixed(1) : '-'}
                </td>
                <td style={{padding:'6px 10px', border:'1px solid #23233a', textAlign:'center', color:'#fbbf24', backgroundColor: '#1a1a1a'}}>
                  {posRaw[i] !== undefined ? posRaw[i].toFixed(4) : '-'}
                </td>
                <td style={{padding:'6px 10px', border:'1px solid #23233a', textAlign:'center', color:'#fbbf24', backgroundColor: '#1a1a1a'}}>
                  {posScaled[i] !== undefined ? (posScaled[i]*100).toFixed(1) : '-'}
                </td>
                <td style={{padding:'6px 10px', border:'1px solid #23233a', color:'#f87171'}}>
                  {seg.problem_joints && seg.problem_joints.length > 0 ? seg.problem_joints.join(', ') : <span style={{color:'#4ade80'}}>None</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:18, color:'#aaa', fontSize:'0.97em'}}>
        <strong>Column Definitions:</strong> Angle Raw = averaged weighted raw joint similarities (0-1). Angle Scaled = sigmoid-scaled angle similarity (0-1). Pos Diff = mean squared error of normalized positions. Pos Scaled = sigmoid-scaled position similarity (0-1).
      </div>
    </div>
  );
}

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

      <ScoreDebugPanel results={results} />
    </div>
  )
}
