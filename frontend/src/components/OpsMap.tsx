import { useEffect, useRef, useState } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import punjab from '../data/punjab.json'

export type MapTehsil = {
  name: string; ur: string; district: string; lat: number; lon: number; neighbors: string[]; farmers: number
  questions: number; ai: number; expert: number; waiting: number
  problems: { tag: string; name_en: string; count: number }[]
  outbreak: { id: number; disease_tag: string; name_en: string; cases: number; at: string } | null
}
export type MapQuestion = { id: number; tehsil: string; crop: string; channel: string; status: string; state: 'ai' | 'expert' | 'waiting'; problem: string | null; emergency: boolean; at: string }
export type MapDealer = { id: number; shop: string; name: string; tehsil: string; alerted: boolean; confirmed: boolean }
export type MapData = { tehsils: MapTehsil[]; questions: MapQuestion[]; dealers: MapDealer[] }
export type Layers = { farmers: boolean; questions: boolean; dealers: boolean; outbreaks: boolean }

export const STATE_COLOR = { ai: '#1B7A53', expert: '#1F5A93', waiting: '#C2700C', emergency: '#B42318' }

/** Spreads points around a tehsil centre on a sunflower spiral, so the same question always lands in the same place. */
function around(lat: number, lon: number, i: number, step: number) {
  const r = step * Math.sqrt(i + 0.6)
  const a = i * 2.39996
  return [lat + r * Math.sin(a) * 0.86, lon + r * Math.cos(a)] as [number, number]
}

const storeSvg = '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3 9 4.5 4h15L21 9"/><path d="M4 9v11h16V9"/><path d="M9 20v-6h6v6"/></svg>'

export function OpsMap({ data, layers, selected, onSelect, fresh }: {
  data: MapData | null; layers: Layers; selected: string | null; onSelect: (t: string | null) => void; fresh: Set<number>
}) {
  const box = useRef<HTMLDivElement>(null)
  const map = useRef<L.Map | null>(null)
  const groups = useRef<Record<string, L.LayerGroup>>({})
  const [tilesDown, setTilesDown] = useState(false)
  const select = useRef(onSelect); select.current = onSelect
  const fitted = useRef(false)
  const [zoom, setZoom] = useState(7)

  useEffect(() => {
    if (!box.current || map.current) return
    const m = L.map(box.current, { zoomControl: false, attributionControl: true, minZoom: 6, maxZoom: 12, zoomSnap: 0.25, worldCopyJump: false })
    L.control.zoom({ position: 'topright' }).addTo(m)
    let errors = 0
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 12, className: 'ops-tiles',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors | Boundaries: geoBoundaries',
    }).on('tileerror', () => { if (++errors > 4) setTilesDown(true) }).on('tileload', () => setTilesDown(false)).addTo(m)
    // Built-in outlines: the map still reads without internet.
    L.geoJSON((punjab as any).province, { interactive: false, style: { color: '#0E4D35', weight: 2, fill: false, opacity: 0.55 } }).addTo(m)
    groups.current = { districts: L.layerGroup().addTo(m), outbreaks: L.layerGroup().addTo(m), farmers: L.layerGroup().addTo(m), questions: L.layerGroup().addTo(m), dealers: L.layerGroup().addTo(m), labels: L.layerGroup().addTo(m) }
    m.fitBounds([[28.3, 70.1], [32.3, 74.6]])
    m.on('click', () => select.current(null))
    m.on('zoomend', () => setZoom(m.getZoom()))
    map.current = m
    const ro = new ResizeObserver(() => m.invalidateSize())
    ro.observe(box.current)
    return () => { ro.disconnect(); m.remove(); map.current = null }
  }, [])

  useEffect(() => {
    const g = groups.current
    if (!map.current || !data) return
    Object.values(g).forEach((x) => x.clearLayers())
    if (!fitted.current && data.tehsils.length) {
      fitted.current = true
      map.current.fitBounds(L.latLngBounds(data.tehsils.map((t) => [t.lat, t.lon] as [number, number])).pad(0.12))
    }
    const z = map.current.getZoom()
    // Keep question dots the same number of pixels from the tehsil centre at every zoom.
    const step = 0.028 * Math.pow(2, 7.3 - z)
    // When zoomed out, label only the busiest tehsil of each district so names do not pile up.
    const top: Record<string, string> = {}
    data.tehsils.forEach((t) => { const c = data.tehsils.find((x) => x.name === top[t.district]); if (!c || t.farmers > c.farmers) top[t.district] = t.name })
    const byDistrict: Record<string, { q: number; outbreak: boolean }> = {}
    data.tehsils.forEach((t) => {
      const d = (byDistrict[t.district] ||= { q: 0, outbreak: false })
      d.q += t.questions; d.outbreak ||= !!t.outbreak
    })
    const maxQ = Math.max(1, ...Object.values(byDistrict).map((d) => d.q))
    L.geoJSON((punjab as any).districts, {
      style: (f) => {
        const d = byDistrict[f?.properties.name]
        const share = d ? d.q / maxQ : 0
        return d?.outbreak
          ? { color: '#B42318', weight: 1.2, fillColor: '#B42318', fillOpacity: 0.1, opacity: 0.7 }
          : { color: '#6E8A79', weight: 0.8, fillColor: '#1B7A53', fillOpacity: d ? 0.05 + share * 0.2 : 0.015, opacity: 0.6, dashArray: d ? undefined : '2 3' }
      },
      onEachFeature: (f, layer) => layer.bindTooltip(f.properties.name, { sticky: true, direction: 'top', className: 'ops-tip' }),
    }).addTo(g.districts)

    const at = Object.fromEntries(data.tehsils.map((t) => [t.name, t]))
    if (layers.outbreaks) data.tehsils.filter((t) => t.outbreak).forEach((t) => {
      L.circle([t.lat, t.lon], { radius: 16000, color: '#B42318', weight: 1.5, fillColor: '#B42318', fillOpacity: 0.12, className: 'ops-pulse', interactive: false }).addTo(g.outbreaks)
      t.neighbors.forEach((n) => { const o = at[n]; if (o) L.polyline([[t.lat, t.lon], [o.lat, o.lon]], { color: '#B42318', weight: 1.4, dashArray: '4 5', opacity: 0.7, interactive: false }).addTo(g.outbreaks) })
    })
    if (layers.farmers) data.tehsils.filter((t) => t.farmers > 0).forEach((t) => {
      const on = selected === t.name
      L.circleMarker([t.lat, t.lon], { radius: 9 + Math.sqrt(t.farmers) * 4.2, color: on ? '#082E20' : '#0E4D35', weight: on ? 3 : 1.5, fillColor: '#E3EFE8', fillOpacity: 0.85 })
        .on('click', (e) => { L.DomEvent.stopPropagation(e); select.current(t.name) })
        .bindTooltip(`<b>${t.name}</b><br>${t.farmers} registered farmers`, { direction: 'top', className: 'ops-tip' }).addTo(g.farmers)
    })
    data.tehsils.filter((t) => z >= 8.5 || top[t.district] === t.name || t.name === selected).forEach((t) => {
      L.marker([t.lat, t.lon], { interactive: false, icon: L.divIcon({ className: 'ops-label', html: `<span>${t.name}</span>`, iconSize: [0, 0] }) }).addTo(g.labels)
    })
    if (layers.questions) {
      const idx: Record<string, number> = {}
      ;[...data.questions].reverse().forEach((q) => {
        const t = at[q.tehsil]; if (!t) return
        const i = (idx[q.tehsil] = (idx[q.tehsil] ?? 3) + 1)
        const color = q.emergency ? STATE_COLOR.emergency : STATE_COLOR[q.state]
        L.circleMarker(around(t.lat, t.lon, i, step), { radius: 5, color: '#fff', weight: 1.5, fillColor: color, fillOpacity: 1, className: fresh.has(q.id) ? 'ops-new' : '' })
          .on('click', (e) => { L.DomEvent.stopPropagation(e); select.current(q.tehsil) })
          .bindTooltip(`<b>Question #${q.id}</b><br>${q.problem || 'Problem not identified'}<br>${q.state === 'ai' ? 'Answered by the AI' : q.state === 'expert' ? 'Answered by an agronomist' : 'With the agronomists'}`, { direction: 'top', className: 'ops-tip' })
          .addTo(g.questions)
      })
    }
    if (layers.dealers) {
      const seen: Record<string, number> = {}
      data.dealers.forEach((d) => {
        const t = at[d.tehsil]; if (!t) return
        const i = (seen[d.tehsil] = (seen[d.tehsil] ?? -1) + 1)
        const tone = d.confirmed ? 'ok' : d.alerted ? 'alert' : ''
        L.marker([t.lat - 0.09 - i * 0.075, t.lon + 0.13], { icon: L.divIcon({ className: `ops-dealer ${tone}`, html: storeSvg, iconSize: [24, 24] }) })
          .on('click', (e) => { L.DomEvent.stopPropagation(e); select.current(d.tehsil) })
          .bindTooltip(`<b>${d.shop}</b><br>${d.tehsil}${d.confirmed ? '<br>Stock confirmed' : d.alerted ? '<br>Alert sent, not confirmed yet' : ''}`, { direction: 'top', className: 'ops-tip' })
          .addTo(g.dealers)
      })
    }
  }, [data, layers, selected, fresh, zoom])

  // Fly to the selected tehsil.
  useEffect(() => {
    const t = data?.tehsils.find((x) => x.name === selected)
    if (t && map.current) map.current.flyTo([t.lat, t.lon], Math.max(map.current.getZoom(), 8.5), { duration: 0.6 })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected])

  return (
    <div className="relative h-full w-full">
      <div ref={box} className="ops-map h-full w-full" data-testid="ops-map" role="application" aria-label="Map of Punjab with farmers, questions, dealers and outbreaks" />
      {tilesDown && <div className="absolute left-3 top-3 z-[500] rounded-lg bg-white/95 border border-line px-2.5 py-1.5 text-xs text-muted">No internet: street map hidden, district outlines are built in.</div>}
    </div>
  )
}
