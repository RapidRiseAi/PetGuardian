import { CONFIG } from "./config.js";

function normalizeBaseUrl(raw){
  return String(raw || "").trim().replace(/\/+$/,"");
}

function expandApiBase(raw){
  const base = normalizeBaseUrl(raw);
  if(!base) return [];
  const out = [base];
  const m = base.match(/^https:\/\/script\.google\.com\/macros\/s\/([^\/]+)\/exec(?:\?.*)?$/i);
  if(m){
    const id = m[1];
    for(let i=0;i<=2;i++) out.push(`https://script.google.com/macros/u/${i}/s/${id}/exec`);
    out.push(`https://script.google.com/macros/s/${id}/exec?authuser=-1`);
    out.push(`https://script.google.com/macros/u/0/s/${id}/exec?authuser=-1`);
  }
  return out;
}

function buildApiBaseCandidates(){
  const bases = [...expandApiBase(CONFIG.apiBaseUrl), ...expandApiBase(CONFIG.appsScriptExecUrl)];
  return bases.filter((v, i) => v && bases.indexOf(v) === i);
}

const API_BASE_CACHE_KEY = "pg_api_base_working_v2";
const LEGACY_API_BASE_CACHE_KEY = "pg_api_base_working";
const API_BASE_CACHE_MAX_AGE_MS = 1000 * 60 * 60 * 24 * 7;

function getApiBaseCacheSignature(){
  return buildApiBaseCandidates().map(normalizeBaseUrl).join("|");
}

let _apiBaseWorking = null;
export function getApiBaseWorking(){
  if(_apiBaseWorking) return _apiBaseWorking;
  try{
    const raw = localStorage.getItem(API_BASE_CACHE_KEY);
    if(raw){
      const parsed = JSON.parse(raw);
      const ageMs = Date.now() - Number(parsed?.savedAt || 0);
      const cachedSignature = String(parsed?.signature || "");
      const currentSignature = getApiBaseCacheSignature();
      const cachedUrl = normalizeBaseUrl(parsed?.url || "");
      if(cachedUrl && cachedSignature === currentSignature && ageMs >= 0 && ageMs <= API_BASE_CACHE_MAX_AGE_MS){
        _apiBaseWorking = cachedUrl;
      }
    }
  }catch(e){}
  try{ localStorage.removeItem(LEGACY_API_BASE_CACHE_KEY); }catch(e){}
  return _apiBaseWorking || normalizeBaseUrl(CONFIG.apiBaseUrl);
}

function setApiBaseWorking(url){
  const normalized = normalizeBaseUrl(url);
  _apiBaseWorking = normalized;
  try{
    localStorage.setItem(API_BASE_CACHE_KEY, JSON.stringify({
      url: normalized,
      signature: getApiBaseCacheSignature(),
      savedAt: Date.now()
    }));
  }catch(e){}
}

function jsonpOnce(baseUrl, params){
  return new Promise((resolve, reject) => {
    const cb = "pgCb_" + Math.random().toString(36).slice(2);
    const timeoutMs = CONFIG.apiTimeoutMs || 8000;
    const cacheBuster = Date.now().toString(36) + Math.random().toString(36).slice(2);
    const url = new URL(baseUrl);
    Object.entries(params || {}).forEach(([k,v]) => {
      if (v === undefined || v === null) return;
      url.searchParams.set(k, String(v));
    });
    url.searchParams.set("callback", cb);
    url.searchParams.set("_", cacheBuster);
    let done = false;
    const script = document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.referrerPolicy = "no-referrer";
    script.src = url.toString();
    const cleanup = () => {
      try { delete window[cb]; } catch (e) { window[cb] = undefined; }
      if (script && script.parentNode) script.parentNode.removeChild(script);
    };
    const timer = setTimeout(() => { if (done) return; done = true; cleanup(); reject(new Error("JSONP timeout")); }, timeoutMs);
    window[cb] = (data) => { if (done) return; done = true; clearTimeout(timer); cleanup(); resolve(data); };
    script.onerror = () => { if (done) return; done = true; clearTimeout(timer); cleanup(); reject(new Error("Network error loading: " + url.toString())); };
    (document.head || document.documentElement).appendChild(script);
  });
}

export async function jsonp(params){
  const candidates = buildApiBaseCandidates();
  let preferred = getApiBaseWorking();
  if(preferred){
    try {
      const prefNorm = normalizeBaseUrl(preferred);
      const match = candidates.some(c => normalizeBaseUrl(c) === prefNorm);
      if(!match) preferred = null;
    } catch(e){ preferred = null; }
  }
  if(preferred && !candidates.includes(preferred)) candidates.unshift(preferred);
  let lastErr = null;
  for(const base of candidates){
    try{ const res = await jsonpOnce(base, params); setApiBaseWorking(base); return res; }
    catch(err){ lastErr = err; }
  }
  throw (lastErr || new Error("API request failed"));
}
