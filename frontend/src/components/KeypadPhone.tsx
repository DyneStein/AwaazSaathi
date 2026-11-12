import { Phone, PhoneOff, ChevronUp, ChevronDown, Volume2, Mic, BellRing, Voicemail } from 'lucide-react'

export type PhoneKey = 'softL' | 'softR' | 'up' | 'down' | 'ok' | 'call' | 'end' | '0' | '1' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '*' | '#'
export type Lcd = {
  title?: string                       // small line under the status row
  lines: { text: string; big?: boolean; blink?: boolean; invert?: boolean }[]
  softL?: string
  softR?: string
  icon?: 'speaker' | 'rec' | 'ring' | 'voicemail' | null
  lit?: boolean
}

// A mouse click on a phone key must not take keyboard focus, or the next Enter would press that key again instead of the call key.
const keepFocus = (e: React.MouseEvent) => e.preventDefault()

const LETTERS: Record<string, string> = { '1': '', '2': 'abc', '3': 'def', '4': 'ghi', '5': 'jkl', '6': 'mno', '7': 'pqrs', '8': 'tuv', '9': 'wxyz', '*': '', '0': '', '#': '' }

/** A button phone (the kind most farmers carry): small LCD, soft keys, call and end keys, twelve number keys.
 *  The screen only shows what a real feature phone shows during a call. Everything else is heard, not read. */
export function KeypadPhone({ lcd, onKey, ringing = false, clock }: { lcd: Lcd; onKey: (k: PhoneKey) => void; ringing?: boolean; clock: string }) {
  const Icon = lcd.icon === 'speaker' ? Volume2 : lcd.icon === 'rec' ? Mic : lcd.icon === 'ring' ? BellRing : lcd.icon === 'voicemail' ? Voicemail : null
  return (
    <div dir="ltr" data-testid="keypad-phone" aria-label="Button phone" className={`kp-body relative shrink-0 w-[290px] rounded-[44px_44px_58px_58px] px-5 pt-5 pb-7 select-none ${ringing ? 'kp-ringing' : ''}`}>
      <div className="mx-auto h-1.5 w-14 rounded-full bg-black/55 shadow-[inset_0_1px_1px_rgba(0,0,0,.8)]" aria-hidden />
      <div className="mt-3 rounded-[16px] bg-[#0C1113] p-2.5 shadow-[inset_0_0_0_1px_rgba(255,255,255,.06)]">
        <div className="kp-lcd rounded-[7px] h-[150px] px-2.5 py-1.5 flex flex-col" data-lit={lcd.lit !== false} data-testid="lcd" role="status" aria-live="polite">
          <div className="flex items-center justify-between text-[10px] font-bold leading-none">
            <span className="flex items-end gap-[2px] h-2.5" aria-hidden>{[3, 5, 7, 9].map((h) => <i key={h} className="w-[3px] bg-current" style={{ height: h }} />)}</span>
            <span>{clock}</span>
            <span className="flex items-center gap-[1px]" aria-hidden><span className="h-2.5 w-5 border border-current p-[1px] flex gap-[1px]"><i className="flex-1 bg-current" /><i className="flex-1 bg-current" /><i className="flex-1 bg-current" /></span><i className="h-1 w-[2px] bg-current" /></span>
          </div>
          <div className="flex-1 min-h-0 flex flex-col justify-center gap-0.5 overflow-hidden">
            {lcd.title && <div className="text-[10.5px] font-bold uppercase tracking-wide opacity-75 flex items-center gap-1">{Icon && <Icon size={12} strokeWidth={2.6} className={lcd.icon === 'ring' || lcd.icon === 'rec' ? 'kp-blink' : ''} />}{lcd.title}</div>}
            {lcd.lines.map((l, i) => <div key={i} className={`truncate leading-tight ${l.big ? 'text-[19px] font-extrabold tracking-tight' : 'text-[12.5px] font-semibold'} ${l.blink ? 'kp-blink' : ''} ${l.invert ? 'bg-[#1B2A16] text-[#B7C6A0] px-1 -mx-1' : ''}`}>{l.text || ' '}</div>)}
          </div>
          <div className="flex justify-between text-[11px] font-bold leading-none pt-1"><span>{lcd.softL || ' '}</span><span>{lcd.softR || ' '}</span></div>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-x-3 gap-y-2">
        <button onMouseDown={keepFocus} onClick={() => onKey('softL')} aria-label={`Left soft key${lcd.softL ? `: ${lcd.softL}` : ''}`} className="kp-soft h-7 grid place-items-center"><span className="h-[3px] w-5 rounded bg-current opacity-80" /></button>
        <div className="row-span-2 h-[76px] w-[76px] rounded-full bg-gradient-to-b from-[#4A555C] to-[#2B3338] shadow-[0_2px_0_#0E1316,inset_0_1px_0_rgba(255,255,255,.15)] relative">
          <button onMouseDown={keepFocus} onClick={() => onKey('up')} aria-label="Up" className="absolute inset-x-4 top-0 h-6 grid place-items-center text-white/80"><ChevronUp size={16} /></button>
          <button onMouseDown={keepFocus} onClick={() => onKey('down')} aria-label="Down" className="absolute inset-x-4 bottom-0 h-6 grid place-items-center text-white/80"><ChevronDown size={16} /></button>
          <button onMouseDown={keepFocus} onClick={() => onKey('ok')} aria-label="Select" className="absolute inset-[22px] rounded-full bg-gradient-to-b from-[#E9ECEA] to-[#C9CFCB] shadow-[inset_0_1px_0_#fff,0_1px_0_#0E1316] active:translate-y-px" />
        </div>
        <button onMouseDown={keepFocus} onClick={() => onKey('softR')} aria-label={`Right soft key${lcd.softR ? `: ${lcd.softR}` : ''}`} className="kp-soft h-7 grid place-items-center"><span className="h-[3px] w-5 rounded bg-current opacity-80" /></button>
        <button onMouseDown={keepFocus} onClick={() => onKey('call')} aria-label="Call key" data-testid="key-call" className="kp-soft h-9 grid place-items-center !bg-none !bg-[#1E8A52] !text-white"><Phone size={17} strokeWidth={2.4} /></button>
        <button onMouseDown={keepFocus} onClick={() => onKey('end')} aria-label="End key" data-testid="key-end" className="kp-soft h-9 grid place-items-center !bg-none !bg-[#B42318] !text-white"><PhoneOff size={17} strokeWidth={2.4} /></button>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-x-3 gap-y-2.5">
        {(['1', '2', '3', '4', '5', '6', '7', '8', '9', '*', '0', '#'] as PhoneKey[]).map((k) => (
          <button key={k} onMouseDown={keepFocus} onClick={() => onKey(k)} aria-label={`Key ${k}`} data-testid={`key-${k}`} className="kp-key h-[42px] flex items-center justify-center gap-1.5">
            <span className="text-[21px] font-bold leading-none">{k}</span>
            {LETTERS[k] && <span className="text-[9.5px] font-semibold uppercase tracking-wider text-black/50 w-6 text-left">{LETTERS[k]}</span>}
          </button>))}
      </div>
      <div className="mx-auto mt-4 h-1 w-1 rounded-full bg-black/70" aria-hidden />
    </div>
  )
}
