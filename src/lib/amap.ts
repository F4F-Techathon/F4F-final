import type { Coordinates } from '@/data/types'
export interface MapBounds { contains(position: Coordinates): boolean }
export interface MapInstance {
  add(overlays: unknown): void
  remove(overlays: unknown): void
  on(event: string, handler: () => void): void
  setFitView(overlays?: unknown[], immediately?: boolean, padding?: number[], maxZoom?: number): void
  setCenter(center: Coordinates): void
  setZoomAndCenter(zoom: number, center: Coordinates, immediately?: boolean, duration?: number): void
  setStatus(status: { dragEnable: boolean; zoomEnable: boolean; touchZoom?: boolean; keyboardEnable?: boolean }): void
  lngLatToContainer(position: Coordinates): { getX(): number; getY(): number }
  getBounds(): MapBounds
  destroy(): void
}
export interface MarkerInstance { on(event: string, handler: () => void): void }
export interface Place { name: string; address: string; location: { lng: number; lat: number } }
interface GeoResult { position?: { lng: number; lat: number }; formattedAddress?: string; message?: string }
export interface AMapSDK {
  Map: new (el: HTMLElement, options: Record<string, unknown>) => MapInstance
  Marker: new (options: Record<string, unknown>) => MarkerInstance
  Circle: new (options: Record<string, unknown>) => unknown
  Pixel: new (x: number, y: number) => unknown
  PlaceSearch: new (options: Record<string, unknown>) => { search(keyword: string, callback: (status: string, result: { poiList?: { pois: Place[] } }) => void): void }
  Geolocation: new (options: Record<string, unknown>) => { getCurrentPosition(callback: (status: string, result: GeoResult) => void): void }
}
declare global { interface Window { AMap?: AMapSDK; _AMapSecurityConfig?: { securityJsCode?: string; serviceHost?: string }; __tonightAmapReady?: () => void } }
let pending: Promise<AMapSDK> | undefined

// The key comes from the server at run time (GET /api/config), never from the build, so one build runs with
// whatever key the deployment's .env holds.
type AMapConfig = { key: string; securityJsCode?: string; serviceHost?: string }
async function amapConfig(): Promise<AMapConfig | null> {
  const response = await fetch('/api/config', { cache: 'no-store' })
  if (!response.ok) throw new Error('地图配置读取失败，请检查网络后重试。')
  const config = (await response.json() as { amap?: AMapConfig | null }).amap
  return config && typeof config.key === 'string' && config.key ? config : null
}

// Loads the official SDK once, resetting after failure so the retry action works.
export function loadAMap(): Promise<AMapSDK> {
  if (window.AMap) return Promise.resolve(window.AMap)
  if (pending) return pending
  pending = amapConfig().catch(() => { throw new Error('地图配置读取失败，请检查网络后重试。') }).then((config) => {
    if (!config) throw new Error('地图暂未配置，可以先用滑卡挑选饭店。')
    return new Promise<AMapSDK>((resolve, reject) => {
      const script = document.createElement('script')
      const timer = setTimeout(() => fail('地图加载较慢，请检查网络后重试。'), 18000)
      function fail(message: string) { clearTimeout(timer); script.remove(); delete window.__tonightAmapReady; reject(new Error(message)) }
      window._AMapSecurityConfig = config.serviceHost ? { serviceHost: config.serviceHost } : { securityJsCode: config.securityJsCode }
      window.__tonightAmapReady = () => { clearTimeout(timer); delete window.__tonightAmapReady; if (window.AMap) resolve(window.AMap); else fail('地图暂时不可用，请重试。') }
      script.src = `https://webapi.amap.com/maps?v=2.0&key=${encodeURIComponent(config.key)}&plugin=AMap.PlaceSearch,AMap.Geolocation&callback=__tonightAmapReady`
      script.async = true
      script.onerror = () => fail('地图加载失败，仍可继续滑卡挑选饭店。')
      document.head.appendChild(script)
    })
  })
  // Any failure (no key, no config, the SDK not loading) lets the next call try again.
  pending.catch(() => { pending = undefined })
  return pending
}

// Resolve a spoken place through POI data, keeping ambiguous results available for user confirmation.
export async function findDiningPlaces(keyword: string): Promise<Place[]> {
  const AMap = await loadAMap()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('位置查找有点慢，再试一次吧。')), 12000)
    new AMap.PlaceSearch({ pageSize: 5, citylimit: false }).search(keyword, (status, result) => {
      clearTimeout(timer)
      const places = status === 'complete' ? result.poiList?.pois || [] : []
      if (places.length) resolve(places)
      else reject(new Error('还没找到这个位置，再说得具体一点吧。'))
    })
  })
}

// Nearby searches use a real GCJ-02 position instead of the demo map's fallback center.
export async function locateDiningCenter(): Promise<{ name: string; center: Coordinates }> {
  const AMap = await loadAMap()
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('还没确定你的位置，可以说一个附近的地名。')), 12000)
    new AMap.Geolocation({ enableHighAccuracy: true, timeout: 10000, convert: true }).getCurrentPosition((status, result) => {
      clearTimeout(timer)
      if (status === 'complete' && result.position) resolve({ name: result.formattedAddress || '当前位置', center: [result.position.lng, result.position.lat] })
      else reject(new Error('还没确定你的位置，可以说一个附近的地名。'))
    })
  })
}
