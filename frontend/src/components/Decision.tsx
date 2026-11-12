import { CloudSun, BookOpenCheck, Quote } from 'lucide-react'
import { CROP_EN } from '../lib/api'
import { Meter, Reasons } from './ui'

/** Where an entry of the knowledge base comes from, said honestly. */
export function sourceLabel(e: { source?: string; reviewed_by?: string | null } | undefined) {
  if (!e) return ''
  if (e.source === 'promoted') return `Senior-approved expert answer${e.reviewed_by ? `, ${e.reviewed_by}` : ''}`
  return e.reviewed_by ? `Signed off by ${e.reviewed_by}` : 'Starter entry, awaiting agronomist sign-off'
}

/** "How the AI decided": every step, the source it used, the farmer's words that matched, and each spoken sentence traced. */
export function Decision({ result, started }: { result: any; started: boolean }) {
  const q = result?.query
  const ev = q?.understanding?.evidence
  const parts: any[] = q?.understanding?.answer_parts || []
  const answered = q?.status === 'answered_ai'
  const stages = [
    ['Phone line', 'Keypad choices', started || !!q],
    ['Speech to text', result?.stt_engine && result.stt_engine !== 'typed' ? result.stt_engine : 'On this laptop', !!q],
    ['Find a source', q ? `Match ${q.retrieval_score.toFixed(2)}` : 'Reviewed knowledge only', !!q],
    ['Safety rules', q ? (q.reasons.length ? 'Hand to a human' : 'Safe to answer') : 'Ten explicit checks', !!q],
    [answered ? 'Spoken answer' : 'Expert queue', q ? (answered ? 'Word for word from the source' : q.route === 'senior_only' ? 'Senior only' : 'Junior drafts, senior approves') : 'Or a human expert', !!q],
  ] as const
  return (
    <section className="surface p-5" dir="ltr" data-testid="decision">
      <h2 className="font-bold text-lg">How the AI decided</h2>
      <p className="text-sm text-muted mb-4">The AI never writes advice. It picks a reviewed answer, or hands the question to a human.</p>
      <ol className="space-y-1.5 mb-5">
        {stages.map(([k, d, on], i) => {
          const warn = i === 3 && q?.reasons?.length
          return <li key={k} className={`flex items-center gap-3 rounded-xl px-3 py-2 border text-sm ${on ? (warn ? 'border-warn/30 bg-warn-50' : 'border-field-200 bg-field-50') : 'border-line text-muted'}`}>
            <span className={`h-5 w-5 shrink-0 rounded-full text-[11px] font-bold grid place-items-center ${on ? (warn ? 'bg-warn text-white' : 'bg-field-800 text-white') : 'bg-line'}`}>{i + 1}</span>
            <span className="font-semibold">{k}</span><span className="ml-auto text-xs opacity-80 text-right">{d}</span>
          </li>
        })}
      </ol>
      {!q ? <p className="text-sm text-muted">Ask a question on either phone to see the transcript, the source and every safety check.</p> : (
        <div className="space-y-4">
          <div><div className="text-xs text-muted mb-1">What the farmer said</div><div className="urdu text-lg bg-field-50 border border-line rounded-xl px-3 py-1" data-testid="transcript">{q.transcript}</div></div>
          <div className="space-y-3">
            <Meter label="Match with the best source" value={q.retrieval_score} min={0.3} />
            {answered && <Meter label="Answer supported by that source" value={q.grounding} min={0.6} />}
          </div>
          <div><div className="text-xs text-muted mb-1.5">Safety checks</div><Reasons reasons={q.reasons} /></div>

          {ev?.kb_id && <div className="rounded-xl border border-line overflow-hidden">
            <div className="flex items-start gap-2.5 px-3 py-2.5 bg-field-50 border-b border-line">
              <BookOpenCheck size={17} className="text-field-700 mt-0.5 shrink-0" />
              <div className="min-w-0 flex-1"><div className="text-xs text-muted">{answered ? 'Source used' : 'Closest source (not used)'}, knowledge entry #{ev.kb_id}</div>
                <div className="font-semibold text-sm">{ev.title_en}</div><div className="text-xs text-muted">{sourceLabel(ev)}</div></div>
            </div>
            <div className="px-3 py-2.5">
              <div className="text-xs text-muted mb-1.5">The farmer’s words found in this source</div>
              {ev.terms?.length ? <div className="flex flex-wrap gap-1.5" dir="rtl">{ev.terms.map((t: string) => <span key={t} className="tag bg-field-100 text-field-900 urdu !leading-[1.9] text-[14px]">{t}</span>)}</div>
                : <div className="text-sm text-muted">None matched word for word.</div>}
            </div>
          </div>}

          {answered && parts.length > 0 && <div>
            <div className="text-xs text-muted mb-1.5 flex items-center gap-1.5"><Quote size={13} /> Every spoken sentence, traced</div>
            <ul className="space-y-2">{parts.map((p, i) => (
              <li key={i} className="rounded-xl border border-line px-3 py-2">
                <div className={`tag mb-1 ${p.from === 'knowledge' ? 'bg-field-100 text-field-800' : 'bg-sky-50 text-sky-800'}`}>{p.from === 'knowledge' ? `Knowledge entry #${p.kb_id}, word for word` : 'Weather rule, from today’s forecast'}</div>
                <div className="urdu text-[15px] !leading-[2]">{p.text}</div>
              </li>))}</ul>
          </div>}

          <div><div className="text-xs text-muted mb-1">Other sources considered</div>
            <ul className="divide-y divide-line">{q.retrieved.slice(answered ? 1 : 0).map((r: any) => <li key={r.kb_id} className="flex items-center justify-between gap-3 py-1.5 text-sm"><span>{r.title_en || <span className="urdu !leading-[1.9]">{r.title_ur}</span>}</span><span className="text-xs text-muted">{r.score.toFixed(2)}</span></li>)}</ul>
          </div>
          {q.understanding?.weather?.temp_c !== undefined && <div className="rounded-xl border border-line bg-field-50 px-3 py-2 text-sm flex items-start gap-2"><CloudSun size={16} className="text-field-700 mt-0.5 shrink-0" /><span>{q.tehsil} today: {Math.round(q.understanding.weather.temp_c)}°C, humidity {q.understanding.weather.humidity}%, rain chance {q.understanding.weather.rain_chance ?? 0}%.</span></div>}
          <div className="text-xs text-muted">Crop: {CROP_EN[q.crop] || 'not given'}. Tehsil: {q.tehsil}. Question #{q.id}.</div>
        </div>)}
    </section>
  )
}
