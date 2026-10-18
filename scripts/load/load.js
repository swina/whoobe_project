// k6 script (run by scripts/load/run.sh). One scenario after the other, so each figure is that endpoint alone.
// Environment: CORE (core-api URL), GATEWAY, KEY (API client key), EMAIL / PASSWORD (administrator), WEBSITE (id),
// PAGE (slug), CLASS (data class name), VUS, DURATION.
import http from 'k6/http'
import { check } from 'k6'

const VUS = Number(__ENV.VUS || 20)
const DURATION = __ENV.DURATION || '30s'
const SECONDS = parseInt(DURATION, 10)
const json = { headers: { 'content-type': 'application/json' } }

function scenario(name, exec, vus, index) {
  return { executor: 'constant-vus', vus, duration: DURATION, startTime: `${index * (SECONDS + 5)}s`, exec, tags: { name } }
}

export const options = {
  scenarios: {
    public_page: scenario('public_page', 'publicPage', VUS, 0),
    public_query: scenario('public_query', 'publicQuery', VUS, 1),
    client_data: scenario('client_data', 'clientData', VUS, 2),
    login: scenario('login', 'login', Math.max(2, Math.floor(VUS / 4)), 3),
  },
  // thresholds that never fail: they make k6 report each scenario separately in the summary
  thresholds: Object.fromEntries(
    ['public_page', 'public_query', 'client_data', 'login'].flatMap((s) => [
      [`http_req_duration{scenario:${s}}`, ['max>=0']],
      [`http_req_failed{scenario:${s}}`, ['rate>=0']],
      [`http_reqs{scenario:${s}}`, ['count>=0']],
    ]),
  ),
  summaryTrendStats: ['avg', 'med', 'p(90)', 'p(95)', 'p(99)', 'max'],
}

export function publicPage() {
  const r = http.get(`${__ENV.CORE}/public/page/${__ENV.PAGE}?websiteId=${__ENV.WEBSITE}`)
  check(r, { 'page 200': (x) => x.status === 200 })
}

export function publicQuery() {
  const r = http.post(`${__ENV.CORE}/public/data-objects/query`, JSON.stringify({ class: __ENV.CLASS, limit: 20 }), json)
  check(r, { 'query 200': (x) => x.status === 200 })
}

export function clientData() {
  const r = http.get(`${__ENV.GATEWAY}/client/v1/data/${__ENV.CLASS}?limit=20`, { headers: { authorization: `Bearer ${__ENV.KEY}` } })
  check(r, { 'client 200': (x) => x.status === 200 })
}

export function login() {
  const r = http.post(`${__ENV.CORE}/auth/login`, JSON.stringify({ email: __ENV.EMAIL, password: __ENV.PASSWORD }), json)
  check(r, { 'login 200': (x) => x.status === 200 })
}
