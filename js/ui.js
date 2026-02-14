import { CONFIG, PRICES } from "./config.js";
import { state } from "./state.js";
import { money, clamp, daysBetween, addDaysIso, isPeakDate, bookingHasPeak, weightedDays, includedPetCount } from "./calc.js";
import { jsonp, getApiBaseWorking } from "./api.js";

const el = (id) => document.getElementById(id);
const stepState = { open: 1, pendingStay: state.pkg };


function isWalkMode(){ return state.pkg === "walk"; }
function selectedWalkDaysCount(){ return Math.max(0, state.walkDays.length); }
function getWalkBillingOption(){
  const raw = el("walkBillingOption")?.value || "once_off";
  return ["once_off","weekly_recurring","monthly_subscription"].includes(raw) ? raw : "once_off";
}











function setApiStatus(ok, msg){
  const dot = el("apiDot");
  const label = el("apiStatus");
  dot.classList.remove("ok","bad");
  dot.classList.add(ok ? "ok" : "bad");
  label.textContent = msg;
}

function stepIsComplete(step){
  if (step === 1){
    const hours = clamp(parseInt(el("hours")?.value || "4", 10), 1, 12);
    return !!state.pkg && (state.pkg !== "day" || hours >= 1);
  }
  if (step === 2){
    const zone = !!el("zone")?.value;
    if (isWalkMode()){
      return !!(el("walkStartDate")?.value || el("startDate")?.value) && zone;
    }
    return !!el("startDate")?.value && !!el("endDate")?.value && zone;
  }
  if (step === 3){
    const dogs = Math.max(0, parseInt(el("dogs")?.value || "0", 10));
    const cats = isWalkMode() ? 0 : Math.max(0, parseInt(el("cats")?.value || "0", 10));
    return (dogs + cats) >= 1;
  }
  if (step === 4){
    return !!state.selectedSitter;
  }
  return false;
}

function stepSummaryText(step){
  if (step === 1){
    const title = el("stayTitle")?.textContent || "Product";
    const hours = clamp(parseInt(el("hours")?.value || "4", 10), 1, 12);
    return (state.pkg === "day") ? `${title}, ${hours} hours` : title;
  }
  if (step === 2){
    const zone = el("zone")?.selectedOptions?.[0]?.textContent || "No zone";
    const start = el("startDate")?.value || "--";
    const end = el("endDate")?.value || "--";
    return `${start} to ${end}, ${zone}`;
  }
  if (step === 3){
    const dogs = Math.max(0, parseInt(el("dogs")?.value || "0", 10));
    const cats = isWalkMode() ? 0 : Math.max(0, parseInt(el("cats")?.value || "0", 10));
    return `Dogs ${dogs}, Cats ${cats}, Puppy care ${el("puppy")?.checked ? "on" : "off"}, Oral meds ${el("meds")?.checked ? "on" : "off"}`;
  }
  const addonCount = ["highcare","reactive","play","train","brush","homecare","concierge","pool","camera","bath","clean","pantry","meet"].filter((id) => !!el(id)?.checked).length;
  return `${addonCount} add-ons, ${state.selectedSitter ? "sitter selected" : "sitter not selected"}`;
}

function stepValidationMessage(step){
  if (step === 1) return stepIsComplete(step) ? "" : "Choose a product option to continue.";
  if (step === 2) return stepIsComplete(step) ? "" : "Add dates and select a zone.";
  if (step === 3) return stepIsComplete(step) ? "" : "Add at least one pet to continue.";
  return stepIsComplete(step) ? "" : "Select a sitter to continue.";
}

function setOpenStep(step){
  stepState.open = step;
  [1,2,3,4].forEach((n) => {
    const card = document.querySelector(`[data-step-card='${n}']`);
    if (!card) return;
    const isOpen = n === stepState.open;
    card.setAttribute("data-collapsed", isOpen ? "0" : "1");
    const toggle = card.querySelector("[data-step-toggle]");
    if (toggle) toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    const summary = card.querySelector(`[data-step-summary='${n}']`);
    const title = card.querySelector("h3")?.textContent || `Step ${n}`;
    if (summary){
      if (!isOpen){
        summary.innerHTML = `<span class="stepSummaryTitle">${escapeHtml(title)}</span><span class="stepSummaryText">${escapeHtml(stepSummaryText(n))}</span><button type="button" class="btn btnTertiary" data-step-edit="${n}">Edit</button>`;
      } else {
        summary.textContent = "";
      }
    }
  });
  refreshStepDoneState();
  document.querySelectorAll("[data-step-edit]").forEach((btn) => {
    btn.addEventListener("click", () => setOpenStep(Number(btn.getAttribute("data-step-edit"))));
  });
}

// Done-only accordion behavior: editing values never collapses a panel.
// A panel closes only on explicit Done, or when the user intentionally opens another step.
function completeStep(step){
  if (!stepIsComplete(step)){
    refreshStepDoneState();
    return;
  }
  const nextStep = Math.min(4, step + 1);
  setOpenStep(step < 4 ? nextStep : step);
}

function refreshStepDoneState(){
  [1,2,3,4].forEach((n) => {
    const doneBtn = document.querySelector(`[data-step-done='${n}']`);
    const hint = document.querySelector(`[data-step-hint='${n}']`);
    const valid = stepIsComplete(n);
    if (doneBtn) doneBtn.disabled = !valid;
    if (hint) hint.textContent = stepValidationMessage(n);
  });
}

async function pingApi(){
  try{
    const res = await jsonp({}); // no action returns online message
    state.apiOk = !!res && res.ok !== false;
    setApiStatus(true, "API: online");
  }catch(err){
    state.apiOk = false;
    setApiStatus(false, "API: check URL");
    try{ const b = document.getElementById("apiPillBtn"); if(b) b.title = String(err && err.message ? err.message : "API request failed"); }catch(e){}
    if (CONFIG.debug) console.error(err);
  }
}

function applyPricingFromSheet(p){
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };

  // Base
  PRICES.base.dayHourly = num(p.BASE_DAY_HOURLY, PRICES.base.dayHourly);
  PRICES.base.night = num(p.BASE_NIGHT, PRICES.base.night);
  PRICES.base.fullDay = num(p.BASE_FULLDAY, PRICES.base.fullDay);

  // Travel
  PRICES.travelPerDay.sabie = num(p.TRAVEL_SABIE, PRICES.travelPerDay.sabie);
  PRICES.travelPerDay.wr = num(p.TRAVEL_WR, PRICES.travelPerDay.wr);
  PRICES.travelPerDay.nel = num(p.TRAVEL_NEL, PRICES.travelPerDay.nel);

  // Controls
  PRICES.controls.includedPets = num(p.INCLUDED_PETS, PRICES.controls.includedPets);
  PRICES.controls.maxDailyCap = num(p.MAX_DAILY_CAP, PRICES.controls.maxDailyCap);
  PRICES.peakMultiplier = num(p.PEAK_MULTIPLIER, PRICES.peakMultiplier);

  PRICES.longStay.blockDays = num(p.DISCOUNT_BLOCK_DAYS, PRICES.longStay.blockDays);
  PRICES.longStay.factor = num(p.DISCOUNT_FACTOR, PRICES.longStay.factor);

  // Add-ons and fees
  PRICES.add.extraDogPerDay = num(p.ADD_EXTRA_DOG_PER_DAY, PRICES.add.extraDogPerDay);
  PRICES.add.extraCatPerDay = num(p.ADD_EXTRA_CAT_PER_DAY, PRICES.add.extraCatPerDay);

  PRICES.add.checkinPerDay = num(p.ADD_CHECKIN, PRICES.add.checkinPerDay);

  PRICES.add.updatesBasicPerDay = num(p.ADD_UPDATES_BASIC_PER_DAY, PRICES.add.updatesBasicPerDay);
  PRICES.add.updatesPhotosPerDay = num(p.ADD_UPDATES_PHOTOS_PER_DAY, PRICES.add.updatesPhotosPerDay);
  PRICES.add.updatesLogbookPerDay = num(p.ADD_UPDATES_LOGBOOK_PER_DAY, PRICES.add.updatesLogbookPerDay);

  PRICES.add.medsPerDay = num(p.ADD_ORAL_MEDS_PER_DAY, PRICES.add.medsPerDay);
  PRICES.add.puppyCarePerDay = num(p.ADD_PUPPY_CARE_PER_DAY, PRICES.add.puppyCarePerDay);
  PRICES.add.highcarePerDay = num(p.ADD_HIGHCARE_PER_DAY, PRICES.add.highcarePerDay);
  PRICES.add.reactivePerDay = num(p.ADD_REACTIVE_PER_DAY, PRICES.add.reactivePerDay);

  PRICES.add.homecarePerDay = num(p.ADD_HOMECARE_PER_DAY, PRICES.add.homecarePerDay);
  PRICES.add.conciergePerDay = num(p.ADD_HOME_CONCIERGE_PER_DAY, PRICES.add.conciergePerDay);

  PRICES.add.playPerDay = num(p.ADD_PLAY_PER_DAY, PRICES.add.playPerDay);
  PRICES.add.trainPerDay = num(p.ADD_TRAIN_PER_DAY, PRICES.add.trainPerDay);
  PRICES.add.brushPerDay = num(p.ADD_GROOM_BRUSH_PER_DAY, PRICES.add.brushPerDay);
  PRICES.add.poolPerDay = num(p.ADD_POOL_PER_DAY, PRICES.add.poolPerDay);

  PRICES.add.walkPerMinute = num(p.ADD_WALK_PER_MINUTE, PRICES.add.walkPerMinute);

  PRICES.add.pantryCreditPerDay = num(p.PANTRY_CREDIT_PER_DAY, PRICES.add.pantryCreditPerDay);

  PRICES.add.meetOneTime = num(p.ONE_MEET_AND_GREET, PRICES.add.meetOneTime);
  PRICES.add.keyTripOneTime = num(p.ADD_KEYTRIP_ONE_TIME, PRICES.add.keyTripOneTime);
  PRICES.add.petTaxiTripOneTime = num(p.ADD_PETTAXI_ONE_TIME, PRICES.add.petTaxiTripOneTime);
  PRICES.add.petTaxiKm = num(p.ADD_PETTAXI_PER_KM, PRICES.add.petTaxiKm);

  PRICES.add.bathOneTime = num(p.ADD_BATH_ONE_TIME, PRICES.add.bathOneTime);
  PRICES.add.cameraOneTime = num(p.ADD_CAMERA_ONE_TIME, PRICES.add.cameraOneTime);
  PRICES.add.cleanOneTime = num(p.ADD_CLEAN_ONE_TIME, PRICES.add.cleanOneTime);
}

async function fetchPricing(){
  try{
    const res = await jsonp({ action: "pricing" });
    if (res && res.ok && res.pricing){
      applyPricingFromSheet(res.pricing);
      state.pricingLoaded = true;
      renderPriceHints();
      recalc();
    }
  }catch(err){
    if (CONFIG.debug) console.error(err);
    state.pricingLoaded = false;
  }
}

async function fetchAvailability(){
  const start = el("startDate").value;
  const end = el("endDate").value;
  const zone = el("zone").value;
  const pkg = state.pkg;
  const availabilityPkg = (pkg === "walk") ? "day" : pkg;

  el("availabilityHint").textContent = "Checking sitter availability...";
  el("carouselHint").textContent = "Checking sitter availability...";

  try{
    const res = await jsonp({ action:"availability", start, end, zone, pkg: availabilityPkg });
    const staff = (res && res.ok && Array.isArray(res.staff)) ? res.staff : [];
    state.sitters = staff;
    state.carouselIndex = 0;

    if (!staff.length){
      el("sittersCountPill").textContent = "Sitters: 0";
      el("availabilityHint").textContent = "No sitters available for this range. Adjust dates, zone, or product option.";
      el("carouselHint").textContent = "No sitters available for this range.";
    } else {
      el("sittersCountPill").textContent = "Sitters: " + staff.length;
      el("availabilityHint").textContent = staff.length + " sitters available. Choose a sitter to continue.";
      el("carouselHint").textContent = "Use Prev/Next. Click the center card to select.";
    }

    // If current sitter not in list, clear selection
    if (state.selectedSitter && !staff.some(s => String(s.id) === String(state.selectedSitter.id))){
      state.selectedSitter = null;
      renderSelectedSitter();
    }

    renderCarousel();
  }catch(err){
    el("availabilityHint").textContent = "Availability could not load. Check API status at the top.";
    el("carouselHint").textContent = "Availability could not load. Check API status.";
    if (CONFIG.debug) console.error(err);
  }
}

function renderPriceHints(){
  el("dayHourlyOut").textContent = Math.round(PRICES.base.dayHourly);
  el("nightOut").textContent = Math.round(PRICES.base.night);
  el("fullOut").textContent = Math.round(PRICES.base.fullDay);

  el("travelOut").textContent = Math.round(PRICES.travelPerDay[el("zone").value] || 0);

  el("updBasicOut").textContent = Math.round(PRICES.add.updatesBasicPerDay);
  el("updPhotosOut").textContent = Math.round(PRICES.add.updatesPhotosPerDay);
  el("updLogOut").textContent = Math.round(PRICES.add.updatesLogbookPerDay);

  el("walkRateOut").textContent = Math.round(PRICES.add.walkPerMinute);
  el("checkinPriceOut").textContent = Math.round(PRICES.add.checkinPerDay);

  el("keyPriceOut").textContent = Math.round(PRICES.add.keyTripOneTime);
  el("taxiPriceOut").textContent = Math.round(PRICES.add.petTaxiTripOneTime);
  el("taxiKmPriceOut").textContent = Math.round(PRICES.add.petTaxiKm);
   syncConditionalAddOns();
  renderStaySummary();
   }

function renderWalkDays(){
  const holder = el("walkDays");
  if (!holder) return;
  const days = [
    ["mon","Mon"],["tue","Tue"],["wed","Wed"],["thu","Thu"],["fri","Fri"],["sat","Sat"],["sun","Sun"]
  ];
  holder.innerHTML = "";
  days.forEach(([value, label]) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "walkDayBtn" + (state.walkDays.includes(value) ? " active" : "");
    btn.textContent = label;
    btn.addEventListener("click", () => {
      if (state.walkDays.includes(value)) {
        state.walkDays = state.walkDays.filter(d => d !== value);
      } else {
        state.walkDays = [...state.walkDays, value];
      }
      renderWalkDays();
      recalc();
    });
    holder.appendChild(btn);
  });
}

function renderStaySummary(){
  const pkg = state.pkg;
  const hours = clamp(parseInt(el("hours")?.value || "4", 10), 1, 12);

  // Mirror hours in the stay modal label + main pill
  if (el("hoursModalOut")) el("hoursModalOut").textContent = String(hours);
  if (el("hoursOut")) el("hoursOut").textContent = String(hours);

  const iconEl = el("stayIcon");
  const titleEl = el("stayTitle");
  const subTextEl = el("staySubText");
  const hoursPill = el("stayHoursPill");
  const rateEl = el("stayRate");

  if (pkg === "day"){
    if (iconEl) iconEl.textContent = "⏱";
    if (titleEl) titleEl.textContent = "Day Visits";
    if (subTextEl) subTextEl.textContent = "Hourly care.";
    if (hoursPill) hoursPill.classList.remove("isHidden");
    if (rateEl) rateEl.textContent = `R${Math.round(PRICES.base.dayHourly)}/hour`;
    if (el("dayOnlyHint")) el("dayOnlyHint").textContent = "Day Visits: travel is charged per day (separate from check-ins)";
  } else if (pkg === "night"){
    if (iconEl) iconEl.textContent = "🌙";
    if (titleEl) titleEl.textContent = "Overnight";
    if (subTextEl) subTextEl.textContent = "6pm to 6am (12 hours).";
    if (hoursPill) hoursPill.classList.add("isHidden");
    if (rateEl) rateEl.textContent = `R${Math.round(PRICES.base.night)}/night`;
    if (el("dayOnlyHint")) el("dayOnlyHint").textContent = "Travel is charged per day by zone.";
  } else if (pkg === "full") {
    if (iconEl) iconEl.textContent = "🏠";
    if (titleEl) titleEl.textContent = "Full-time";
    if (subTextEl) subTextEl.textContent = "24h presence.";
    if (hoursPill) hoursPill.classList.add("isHidden");
    if (rateEl) rateEl.textContent = `R${Math.round(PRICES.base.fullDay)}/day`;
    if (el("dayOnlyHint")) el("dayOnlyHint").textContent = "Travel is charged per day by zone.";
  } else {
    if (iconEl) iconEl.textContent = "🐕";
    if (titleEl) titleEl.textContent = "Dog Walks";
    if (subTextEl) subTextEl.textContent = "Scheduled walks by week/day/time.";
    if (hoursPill) hoursPill.classList.add("isHidden");
    if (rateEl) rateEl.textContent = "R1/min/walk/dog";
    if (el("dayOnlyHint")) el("dayOnlyHint").textContent = "Travel estimate ranges from R0 to R50 per walk and is confirmed afterwards.";
  }
}


function currentUpdateTier(){
  const active = document.querySelector(".radioCard.active[data-upd]");
  return active ? active.getAttribute("data-upd") : "basic";
}

function setUpdateTier(tier){
  document.querySelectorAll(".radioCard[data-upd]").forEach(c => {
    c.classList.toggle("active", c.getAttribute("data-upd") === tier);
  });
  recalc();
}

function getUpdatePerDay(){
  const tier = currentUpdateTier();
  if (tier === "photos") return PRICES.add.updatesPhotosPerDay;
  if (tier === "logbook") return PRICES.add.updatesLogbookPerDay;
  return PRICES.add.updatesBasicPerDay;
}

function getNumber(id){
  const v = Number(el(id).value);
  return Number.isFinite(v) ? v : 0;
}

function recalc(){
  const walkMode = isWalkMode();
  const zone = el("zone").value;
  const travel = Number(PRICES.travelPerDay[zone] || 0);
  const billingOption = getWalkBillingOption();
  syncWalkBillingUI();

  // schedule values
  let start = el("startDate").value;
  let end = el("endDate").value;
  let days = daysBetween(start, end);
  let peakApplied = bookingHasPeak(start, end);
  let peakMult = peakApplied ? Number(PRICES.peakMultiplier || 1) : 1;

  const walkWeeksInput = clamp(parseInt(el("walkWeeks")?.value || "1", 10), 1, 12);
  const walkWeeks = (billingOption === "weekly_recurring") ? walkWeeksInput : 1;
  const walksPerDay = clamp(parseInt(el("walksPerDay")?.value || "1", 10), 1, 8);
  const walkMinutesPerWalk = clamp(parseInt(el("walkMinutesPerWalk")?.value || "30", 10), 5, 120);
  const walkTravelEstimatePerWalk = clamp(parseInt(el("walkTravelEstimatePerWalk")?.value || "25", 10), 0, 50);
  const selectedDays = selectedWalkDaysCount();
  const weeklyWalks = selectedDays * walksPerDay;
  const totalWalks = walkWeeks * weeklyWalks;
  const billedWalks = (billingOption === "monthly_subscription") ? (weeklyWalks * 4.3) : totalWalks;

  if (walkMode){
    start = el("walkStartDate").value || el("startDate").value;
    const autoEnd = addDaysIso(start, (walkWeeks * 7) - 1);
    end = autoEnd;
    el("startDate").value = start;
    el("endDate").value = end;
    days = Math.max(1, walkWeeks * 7);
    peakApplied = false;
    peakMult = 1;
    if (el("cats")) el("cats").value = "0";
    if (el("walkEndDateOut")) el("walkEndDateOut").textContent = end;
    if (el("walkTotalOut")) el("walkTotalOut").textContent = (billingOption === "monthly_subscription") ? billedWalks.toFixed(1) : String(totalWalks);
    if (el("walkTotalsSummary")) {
      el("walkTotalsSummary").textContent = (billingOption === "monthly_subscription")
        ? `Weekly walks: ${weeklyWalks}. Billed walks (4.3 weeks): ${billedWalks.toFixed(1)}.`
        : `Total walks: ${totalWalks}.`;
    }
    if (el("walkMinutesPerWalkOut")) el("walkMinutesPerWalkOut").textContent = String(walkMinutesPerWalk);
    if (el("walkTravelEstimateOut")) el("walkTravelEstimateOut").textContent = String(walkTravelEstimatePerWalk);
    if (el("walkWeeks")) el("walkWeeks").value = String(walkWeeks);
  }

  el("daysOut").textContent = String(walkMode ? ((billingOption === "monthly_subscription") ? billedWalks.toFixed(1) : totalWalks) : days);
  el("travelOut").textContent = String(Math.round(walkMode ? walkTravelEstimatePerWalk : travel));
  el("peakNote").textContent = walkMode ? "Walk schedule" : (peakApplied ? "Peak pricing" : "Standard dates");
  el("peakAppliedOut").textContent = walkMode
    ? "Walk mode: end date is auto-calculated from your billing option and schedule. Long-stay discounts are disabled."
    : (peakApplied ? "Peak dates detected in your booking range (June to July, or Dec to 15 Jan)." : "No peak dates detected in your booking range.");

  const dogs = Math.max(0, parseInt(el("dogs").value || "0", 10));
  const cats = walkMode ? 0 : Math.max(0, parseInt(el("cats").value || "0", 10));
  const { incDogs, incCats } = includedPetCount(dogs, cats);
  const extraDogs = Math.max(0, dogs - incDogs);
  const extraCats = Math.max(0, cats - incCats);
  const hours = clamp(parseInt(el("hours").value || "1", 10), 1, 12);
  el("hoursOut").textContent = String(hours);

  const puppy = !!el("puppy").checked;
  const meds = !!el("meds").checked;
  const walkMinRaw = clamp(parseInt(el("walkMinutes").value || "0", 10), 0, 600);
  const walkMin = walkMode ? 0 : walkMinRaw;
  el("walkMinutesOut").textContent = String(walkMin);
  const walkCostPerDay = walkMin * Number(PRICES.add.walkPerMinute || 0);
  el("walkCostOut").textContent = money(walkCostPerDay);
  const checkins = clamp(parseInt(el("checkins").value || "0", 10), 0, 20);
  el("checkinsOut").textContent = String(checkins);

  const highcare = !!el("highcare").checked;
  const reactive = !!el("reactive").checked;
  const play = !!el("play").checked;
  const train = !!el("train").checked;
  const brush = !!el("brush").checked;
  const homecare = !!el("homecare").checked;
  const concierge = !!el("concierge").checked;
  const pool = !!el("pool").checked;
  const camera = !!el("camera").checked;
  const bath = !!el("bath").checked;
  const clean = !!el("clean").checked;
  const pantry = !!el("pantry").checked;
  const keys = clamp(parseInt(el("keys").value || "0", 10), 0, 20);
  el("keysOut").textContent = String(keys);
  const taxi = clamp(parseInt(el("taxi").value || "0", 10), 0, 20);
  el("taxiOut").textContent = String(taxi);
  const taxiKm = Math.max(0, parseInt(el("taxiKm").value || "0", 10));
  const meet = !!el("meet").checked;

  let total = 0, deposit = 0, balance = 0, discountAmt = 0, baseTotal = 0, addonsTotal = 0, oneTime = 0;

  if (walkMode){
    const perWalkBase = dogs * walkMinutesPerWalk * 1;
    baseTotal = perWalkBase * billedWalks;
    addonsTotal = walkTravelEstimatePerWalk * billedWalks;
    oneTime = 0;
    total = baseTotal + addonsTotal;
  } else {
    let basePerDay = 0;
    if (state.pkg === "day") basePerDay = hours * Number(PRICES.base.dayHourly || 0);
    if (state.pkg === "night") basePerDay = Number(PRICES.base.night || 0);
    if (state.pkg === "full") basePerDay = Number(PRICES.base.fullDay || 0);

    const updatePerDay = getUpdatePerDay();
    const perDayAddOns =
      (updatePerDay) + (checkins * Number(PRICES.add.checkinPerDay || 0)) + walkCostPerDay +
      (meds ? Number(PRICES.add.medsPerDay || 0) : 0) + (puppy ? Number(PRICES.add.puppyCarePerDay || 0) : 0) +
      (highcare ? Number(PRICES.add.highcarePerDay || 0) : 0) + (reactive ? Number(PRICES.add.reactivePerDay || 0) : 0) +
      (play ? Number(PRICES.add.playPerDay || 0) : 0) + (train ? Number(PRICES.add.trainPerDay || 0) : 0) +
      (brush ? Number(PRICES.add.brushPerDay || 0) : 0) + (homecare ? Number(PRICES.add.homecarePerDay || 0) : 0) +
      (concierge ? Number(PRICES.add.conciergePerDay || 0) : 0) + (pool ? Number(PRICES.add.poolPerDay || 0) : 0) +
      (pantry ? -Number(PRICES.add.pantryCreditPerDay || 0) : 0) +
      (extraDogs * Number(PRICES.add.extraDogPerDay || 0)) + (extraCats * Number(PRICES.add.extraCatPerDay || 0));

    const perDaySubtotalPrePeak = basePerDay + travel + perDayAddOns;
    const perDayAfterPeak = perDaySubtotalPrePeak * peakMult;
    const cap = Number(PRICES.controls.maxDailyCap || 0);
    const cappedPerDay = (cap > 0) ? Math.min(cap, perDayAfterPeak) : perDayAfterPeak;
    const wDays = weightedDays(days);
    const stayTotal = cappedPerDay * wDays;

    oneTime = (meet ? Number(PRICES.add.meetOneTime || 0) : 0) + (keys * Number(PRICES.add.keyTripOneTime || 0)) +
      (taxi * Number(PRICES.add.petTaxiTripOneTime || 0)) + (taxiKm * Number(PRICES.add.petTaxiKm || 0)) +
      (bath ? Number(PRICES.add.bathOneTime || 0) : 0) + (camera ? Number(PRICES.add.cameraOneTime || 0) : 0) +
      (clean ? Number(PRICES.add.cleanOneTime || 0) : 0);

    total = stayTotal + oneTime;
    const noDiscountTotal = cappedPerDay * days + oneTime;
    discountAmt = Math.max(0, noDiscountTotal - total);
    baseTotal = (basePerDay * peakMult) * wDays;
    addonsTotal = ((perDayAddOns + travel) * peakMult) * wDays;
  }

  deposit = total * Number(CONFIG.depositPercent || 0.5);
  balance = total - deposit;
  el("totalOut").textContent = money(total);
  el("depositOut").textContent = money(deposit);
  el("balanceOut").textContent = money(balance);
  el("baseOut").textContent = money(baseTotal);
  el("addonsOut").textContent = money(addonsTotal);
  el("discountOut").textContent = discountAmt > 0 ? ("-" + money(discountAmt)) : money(0);
  el("oneTimeOut").textContent = money(oneTime);
  if (el("monthlyEstimateNote")) {
    el("monthlyEstimateNote").style.display = (walkMode && billingOption === "monthly_subscription") ? "" : "none";
  }
  el("bookingTotalOut").textContent = money(total);
  el("bookingDepositOut").textContent = money(deposit);
  el("bookingSitterOut").textContent = state.selectedSitter ? state.selectedSitter.name : "None";

  const warns = [];
  if (!state.selectedSitter) warns.push("Select a sitter to submit booking.");
  el("quoteWarnings").textContent = warns.join(" ");

  renderLineItems({
    walkMode, days, peakMult, discountAmt, travel, extraDogs, extraCats,
    updateTier: currentUpdateTier(), updatePerDay: getUpdatePerDay(), checkins, walkMin,
    meds, puppy, highcare, reactive, play, train, brush, homecare, concierge, pool, pantry,
    keys, taxi, taxiKm, meet, bath, camera, clean,
    walkWeeks, walksPerDay, walkMinutesPerWalk, totalWalks, dogs,
    billingOption, weeklyWalks, billedWalks, walkTravelEstimatePerWalk
  });
  refreshStepDoneState();
}


function renderLineItems(ctx){
  const body = el("lineItemsBody");
  body.innerHTML = "";

  if (ctx.walkMode){
    const walkCountLabel = (ctx.billingOption === "monthly_subscription")
      ? `Billed walks (4.3 weeks): ${ctx.billedWalks.toFixed(1)}`
      : `${ctx.totalWalks} walk(s)`;
    const lines = [
      {
        title: "Dog walks base",
        meta: `${ctx.dogs} dog(s) x ${ctx.walkMinutesPerWalk} min x ${walkCountLabel}`,
        total: ctx.dogs * ctx.walkMinutesPerWalk * ctx.billedWalks
      },
      {
        title: "Estimated travel (R0–R50 per walk)",
        meta: `R${ctx.walkTravelEstimatePerWalk} per walk x ${walkCountLabel}`,
        total: ctx.walkTravelEstimatePerWalk * ctx.billedWalks
      }
    ];
    lines.forEach(li => {
      const wrap = document.createElement("div");
      wrap.className = "liRow";
      wrap.innerHTML = `<div><div class="liTitle">${escapeHtml(li.title)}</div><div class="liMeta">${escapeHtml(li.meta)}</div></div><div class="liAmt">${money(li.total)}</div>`;
      body.appendChild(wrap);
    });
    return;
  }

  const peakMult = ctx.peakMult || 1;
  const days = ctx.days || 1;

  const lines = [];

  // Per-day items
  const addLinePerDay = (title, unit, meta, total) => {
    if (!total || Math.abs(total) < 0.0001) return;
    lines.push({ title, meta, total });
  };

  const addLineOneTime = (title, meta, total) => {
    if (!total || Math.abs(total) < 0.0001) return;
    lines.push({ title, meta, total });
  };

  // Travel
  addLinePerDay(
    "Travel fee (zone)",
    ctx.travel,
    money(ctx.travel) + " x " + days + " day(s)" + (peakMult !== 1 ? " x peak" : ""),
    (ctx.travel * days * peakMult)
  );

  // Extra pets
  if (ctx.extraDogs > 0){
    addLinePerDay(
      "Additional dogs",
      PRICES.add.extraDogPerDay,
      "R" + Math.round(PRICES.add.extraDogPerDay) + "/day x " + ctx.extraDogs + " dog(s) x " + days + " day(s)" + (peakMult !== 1 ? " x peak" : ""),
      (ctx.extraDogs * PRICES.add.extraDogPerDay * days * peakMult)
    );
  }
  if (ctx.extraCats > 0){
    addLinePerDay(
      "Additional cats",
      PRICES.add.extraCatPerDay,
      "R" + Math.round(PRICES.add.extraCatPerDay) + "/day x " + ctx.extraCats + " cat(s) x " + days + " day(s)" + (peakMult !== 1 ? " x peak" : ""),
      (ctx.extraCats * PRICES.add.extraCatPerDay * days * peakMult)
    );
  }

  // Updates
  const updLabel = ctx.updateTier === "photos" ? "Updates: 2 photos per day" : (ctx.updateTier === "logbook" ? "Updates: full logbook" : "Updates: daily message");
  addLinePerDay(
    updLabel,
    ctx.updatePerDay,
    money(ctx.updatePerDay) + "/day x " + days + " day(s)" + (peakMult !== 1 ? " x peak" : ""),
    (ctx.updatePerDay * days * peakMult)
  );

  // Check-ins
  if (ctx.checkins > 0){
    const unit = Number(PRICES.add.checkinPerDay || 0);
    addLinePerDay(
      "Extra check-ins",
      unit,
      "R" + Math.round(unit) + "/day x " + ctx.checkins + " per day x " + days + " day(s)" + (peakMult !== 1 ? " x peak" : ""),
      (unit * ctx.checkins * days * peakMult)
    );
  }

  // Walks
  if (ctx.walkMin > 0){
    const unit = Number(PRICES.add.walkPerMinute || 0);
    addLinePerDay(
      "Walk time",
      unit,
      "R" + Math.round(unit) + "/min x " + ctx.walkMin + " min/day x " + days + " day(s)" + (peakMult !== 1 ? " x peak" : ""),
      (unit * ctx.walkMin * days * peakMult)
    );
  }

  // Toggles per day
  const togglePerDay = [
    ["Oral meds", ctx.meds, PRICES.add.medsPerDay],
    ["Puppy care", ctx.puppy, PRICES.add.puppyCarePerDay],
    ["High-care routine", ctx.highcare, PRICES.add.highcarePerDay],
    ["Reactive handling", ctx.reactive, PRICES.add.reactivePerDay],
    ["Play and enrichment", ctx.play, PRICES.add.playPerDay],
    ["Training reinforcement", ctx.train, PRICES.add.trainPerDay],
    ["Brush and coat care", ctx.brush, PRICES.add.brushPerDay],
    ["Plants and chores pack", ctx.homecare, PRICES.add.homecarePerDay],
    ["Home concierge", ctx.concierge, PRICES.add.conciergePerDay],
    ["Pool check", ctx.pool, PRICES.add.poolPerDay],
  ];
  togglePerDay.forEach(([label, on, price]) => {
    if (!on) return;
    const unit = Number(price || 0);
    addLinePerDay(
      label,
      unit,
      money(unit) + "/day x " + days + " day(s)" + (peakMult !== 1 ? " x peak" : ""),
      (unit * days * peakMult)
    );
  });

  // Pantry credit (negative)
  if (ctx.pantry){
    const unit = Number(PRICES.add.pantryCreditPerDay || 0);
    addLinePerDay(
      "Pantry use credit",
      -unit,
      "-" + money(unit) + "/day x " + days + " day(s)" + (peakMult !== 1 ? " x peak" : ""),
      (-unit * days * peakMult)
    );
  }

  // One-time items
  if (ctx.meet){
    addLineOneTime(
      "Meet and greet",
      money(Number(PRICES.add.meetOneTime || 0)) + " one-time",
      Number(PRICES.add.meetOneTime || 0)
    );
  }
  if (ctx.keys > 0){
    const unit = Number(PRICES.add.keyTripOneTime || 0);
    addLineOneTime(
      "Key pickup/drop-off",
      money(unit) + " x " + ctx.keys + " trip(s)",
      unit * ctx.keys
    );
  }
  if (ctx.taxi > 0){
    const unit = Number(PRICES.add.petTaxiTripOneTime || 0);
    addLineOneTime(
      "Pet taxi (base)",
      money(unit) + " x " + ctx.taxi + " trip(s)",
      unit * ctx.taxi
    );
  }
  if (ctx.taxiKm > 0){
    const unit = Number(PRICES.add.petTaxiKm || 0);
    addLineOneTime(
      "Pet taxi (distance)",
      "R" + Math.round(unit) + "/km x " + ctx.taxiKm + " km",
      unit * ctx.taxiKm
    );
  }
  if (ctx.bath){
    addLineOneTime(
      "Bath (basic)",
      money(Number(PRICES.add.bathOneTime || 0)) + " one-time",
      Number(PRICES.add.bathOneTime || 0)
    );
  }
  if (ctx.camera){
    addLineOneTime(
      "Pet camera setup/check",
      money(Number(PRICES.add.cameraOneTime || 0)) + " one-time",
      Number(PRICES.add.cameraOneTime || 0)
    );
  }
  if (ctx.clean){
    addLineOneTime(
      "Light clean and linen",
      money(Number(PRICES.add.cleanOneTime || 0)) + " one-time",
      Number(PRICES.add.cleanOneTime || 0)
    );
  }

  // Long stay discount line is already shown above, but user asked breakdown - so include here too
  if (ctx.discountAmt > 0){
    addLineOneTime(
      "Long-stay discount",
      "Auto applied by day blocks",
      -ctx.discountAmt
    );
  }

  if (!lines.length){
    body.innerHTML = '<div class="text-[12px] opacity-70">No add-ons selected yet.</div>';
    return;
  }

  lines.forEach(li => {
    const wrap = document.createElement("div");
    wrap.className = "liRow";
    const left = document.createElement("div");
    left.innerHTML = '<div class="liTitle"></div><div class="liMeta"></div>';
    left.querySelector(".liTitle").textContent = li.title;
    left.querySelector(".liMeta").textContent = li.meta;

    const amt = document.createElement("div");
    amt.className = "liAmt";
    const n = Number(li.total || 0);
    amt.textContent = (n < 0) ? ("-" + money(Math.abs(n))) : money(n);

    wrap.appendChild(left);
    wrap.appendChild(amt);
    body.appendChild(wrap);
  });
}

function openModal(id){ el(id).classList.add("active"); }
function closeModal(id){ el(id).classList.remove("active"); }

function resetWalkMinutesAddon(){
  const walkSlider = el("walkMinutes");
  if (walkSlider) walkSlider.value = "0";
  if (el("walkMinutesOut")) el("walkMinutesOut").textContent = "0";
  if (el("walkCostOut")) el("walkCostOut").textContent = money(0);
}

function syncModeUI(){
  const walkMode = isWalkMode();
  if (el("dateRangeFields")) el("dateRangeFields").style.display = walkMode ? "none" : "";
  if (el("walkScheduleFields")) el("walkScheduleFields").style.display = walkMode ? "" : "none";
  syncWalkBillingUI();
  if (el("catsField")) el("catsField").style.display = walkMode ? "none" : "";
  if (el("travelLabel")) el("travelLabel").textContent = walkMode ? "Travel estimate per walk" : "Travel per day";
  if (el("daysLabel")) el("daysLabel").textContent = walkMode ? "Walks" : "Days";
  if (el("baseRowLabel")) el("baseRowLabel").textContent = walkMode ? "Walks base" : "Base stay";
  if (el("discountRowLabel")) el("discountRowLabel").textContent = walkMode ? "Discount" : "Long-stay discount";
  if (el("discountHint")) el("discountHint").textContent = walkMode ? "Discounts are disabled for Dog Walks" : "Long-stay discount applies automatically";
  document.querySelectorAll("[data-walk-hide='1']").forEach(node => {
    node.style.display = walkMode ? "none" : "";
  });
  if (walkMode && (el("tab-home")?.style.display !== "none" || el("tab-transport")?.style.display !== "none" || el("tab-discounts")?.style.display !== "none")){
    setTab("care");
  }
}

function syncWalkBillingUI(){
  const walkMode = isWalkMode();
  const billingOption = getWalkBillingOption();
  if (el("walkWeeksField")) el("walkWeeksField").style.display = (walkMode && billingOption === "weekly_recurring") ? "" : "none";
  if (el("walkTravelEstimateField")) el("walkTravelEstimateField").style.display = walkMode ? "" : "none";
  if (billingOption !== "weekly_recurring" && el("walkWeeks")) el("walkWeeks").value = "1";
}

function syncConditionalAddOns(){
  const show = (state.pkg === "day" || state.pkg === "night");
  const card = el("cardCheckins");
  if (card) card.style.display = show ? "" : "none";

  if (!show){
    const inp = el("checkins");
    if (inp) inp.value = "0";
    if (el("checkinsOut")) el("checkinsOut").textContent = "0";
  }
}

function setPkg(pkg){
  state.pkg = pkg;

  // Highlight stay cards inside the stay modal
  selectStayCard(pkg);

  // Hour slider only relevant for day visits
  const hoursEl = el("hours");
  if (hoursEl){
    hoursEl.disabled = (pkg !== "day");
    hoursEl.style.opacity = (pkg === "day") ? "1" : "0.35";
  }

  if (pkg === "walk") resetWalkMinutesAddon();

  syncModeUI();
  syncConditionalAddOns();
  renderStaySummary();
  fetchAvailability();
  recalc();
}


function selectStayCard(pkg){
  stepState.pendingStay = pkg;
  document.querySelectorAll(".stayCard").forEach((c) => c.classList.toggle("active", c.getAttribute("data-pkg") === pkg));
  const confirmBtn = el("btnConfirmStay");
  if (confirmBtn) confirmBtn.disabled = !pkg;
}

function confirmStaySelection(){
  if (!stepState.pendingStay) return;
  setPkg(stepState.pendingStay);
  closeModal("modalStay");
}

function renderSelectedSitter(){
  const sitter = state.selectedSitter;
  if (!sitter){
    el("selectedSitterName").textContent = "No sitter selected";
    el("selectedSitterMeta").textContent = "Choose a sitter to continue";
    el("sitterBtnTitle").textContent = "Choose sitter";
    el("sitterBtnSub").textContent = "Verified selection required";
    return;
  }
  el("selectedSitterName").textContent = sitter.name || "Selected sitter";
  const rating = sitter.rating ? ("Rating " + sitter.rating) : "Verified sitter";
  el("selectedSitterMeta").textContent = rating;
  el("sitterBtnTitle").textContent = "Sitter selected";
  el("sitterBtnSub").textContent = sitter.name || "Change sitter";
  recalc();
}

function normalizedSitter(s){
  return {
    id: s.id ?? s.staffId ?? s.email ?? s.name,
    name: s.name ?? s.fullName ?? "Sitter",
    rating: s.rating ?? s.score ?? "",
    role: s.role ?? s.title ?? "Pet Sitter",
    verified: (s.verified ?? s.idVerified ?? true),
    background: (s.backgroundChecked ?? s.background ?? false),
    bio: s.bio ?? s.description ?? s.notes ?? "Calm, reliable care with safety-first routines.",
    photoUrl: s.photoUrl ?? s.photo ?? s.image ?? ""
  };
}

function renderCarousel(){
  const vp = el("carouselViewport");
  vp.innerHTML = "";

  const staff = (state.sitters || []).map(normalizedSitter);
  if (!staff.length){
    el("carouselHint").textContent = "No sitters available for this range.";
    return;
  }

  const idx = clamp(state.carouselIndex, 0, staff.length - 1);
  state.carouselIndex = idx;

  // Prepare 3 cards: prev, current, next
  const positions = [
    { offset: -1, scale: 0.86, opacity: 0.50, z: 1, index: (idx - 1 + staff.length) % staff.length },
    { offset: 0,  scale: 1.00, opacity: 1.00, z: 3, index: idx },
    { offset: 1,  scale: 0.86, opacity: 0.50, z: 1, index: (idx + 1) % staff.length }
  ];

  positions.forEach(pos => {
    const sitter = staff[pos.index];
    const card = document.createElement("div");
    card.className = "sCard";
    card.style.setProperty("--offset", String(pos.offset));
    card.style.setProperty("--scale", String(pos.scale));
    card.style.setProperty("--opacity", String(pos.opacity));
    card.style.setProperty("--z", String(pos.z));

    card.innerHTML = `
      <div class="img">
        ${sitter.photoUrl
          ? `<img src="${sitter.photoUrl}" alt="${escapeHtml(sitter.name)}">`
          : `<div style="height:100%; display:flex; align-items:center; justify-content:center; color:rgba(255,255,255,0.55); font-weight:800;">No photo</div>`
        }
      </div>
      <div class="body">
        <div class="sName">${escapeHtml(sitter.name)}</div>
        <div class="sMeta">${escapeHtml(sitter.role)}${sitter.rating ? " · Rating " + escapeHtml(String(sitter.rating)) : ""}</div>
        <div class="sMeta" style="opacity:.88;">${escapeHtml(sitter.bio).slice(0, 90)}${sitter.bio && sitter.bio.length > 90 ? "..." : ""}</div>
        <div class="tags">
          <span class="tag">Verified</span>
          ${sitter.background ? '<span class="tag">Background checked</span>' : '<span class="tag">Safe booking</span>'}
        </div>
      </div>
    `;

    card.addEventListener("click", () => {
      if (pos.offset === 0){
        state.selectedSitter = sitter;
        renderSelectedSitter();
        closeModal("modalSitters");
      } else {
        // Move carousel
        if (pos.offset < 0) prevSitter();
        if (pos.offset > 0) nextSitter();
      }
    });

    vp.appendChild(card);
  });

  el("carouselHint").textContent = "Click the center card to select. Use Prev/Next to browse.";
}

function prevSitter(){
  if (!state.sitters || !state.sitters.length) return;
  state.carouselIndex = (state.carouselIndex - 1 + state.sitters.length) % state.sitters.length;
  renderCarousel();
}
function nextSitter(){
  if (!state.sitters || !state.sitters.length) return;
  state.carouselIndex = (state.carouselIndex + 1) % state.sitters.length;
  renderCarousel();
}

function escapeHtml(str){
  return String(str || "").replace(/[&<>"']/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[s]));
}

function setTab(tab){
  document.querySelectorAll("#addonTabs .tab").forEach(t => t.classList.toggle("active", t.getAttribute("data-tab") === tab));
  ["care","home","transport","discounts"].forEach(name => {
    const pane = el("tab-" + name);
    if (pane) pane.style.display = (name === tab) ? "" : "none";
  });
}

function stepperAdjust(id, dir){
  const input = el(id);
  const min = Number.isFinite(Number(input.min)) ? Number(input.min) : 0;
  const max = Number.isFinite(Number(input.max)) && input.max !== "" ? Number(input.max) : 999;
  const v = clamp(parseInt(input.value || "0", 10) + dir, min, max);
  input.value = String(v);
  // mirror output text
  if (id === "checkins") el("checkinsOut").textContent = String(v);
  if (id === "keys") el("keysOut").textContent = String(v);
  if (id === "taxi") el("taxiOut").textContent = String(v);
  if (id === "hours") el("hoursOut").textContent = String(v);
  refreshStepDoneState();
  recalc();
}

function copyQuote(){
  const start = el("startDate").value;
  const end = el("endDate").value;
  const zone = el("zone").value;
  const dogs = el("dogs").value;
  const cats = el("cats").value;
  const total = el("totalOut").textContent;
  const sitter = state.selectedSitter ? state.selectedSitter.name : "None";

  const text =
`PetGuardian Care Quote
Product options: ${state.pkg}
Dates: ${start} to ${end}
Zone: ${zone}
Pets: Dogs ${dogs}${isWalkMode() ? "" : `, Cats ${cats}`}
Sitter: ${sitter}
Total estimate: ${total}`;

  navigator.clipboard.writeText(text).then(() => {
    el("btnCopy").textContent = "Copied";
    setTimeout(() => el("btnCopy").textContent = "Copy Quote", 1100);
  }).catch(() => {
    alert("Copy failed. Your browser may block clipboard access.");
  });
}

function openBooking(){
  el("bookingResult").textContent = "";
  openModal("modalBooking");
  recalc();
}

async function submitBooking(){
  const sitter = state.selectedSitter;
  if (!sitter){
    el("bookingResult").textContent = "Please select a sitter first.";
    return;
  }

  const customerName = el("customerName").value.trim();
  const customerPhone = el("customerPhone").value.trim();
  const customerEmail = el("customerEmail").value.trim();
  const customerAddress = el("customerAddress").value.trim();
  const customerNotes = el("customerNotes").value.trim();

  if (!customerName || !customerPhone || !customerEmail){
    el("bookingResult").textContent = "Please fill name, phone, and email.";
    return;
  }

  // Build selections JSON (small, but informative)
  const selections = {
    pkg: state.pkg,
    hours: Number(el("hours").value || 0),
    zone: el("zone").value,
    pets: { dogs: Number(el("dogs").value||0), cats: isWalkMode() ? 0 : Number(el("cats").value||0) },
    updateTier: currentUpdateTier(),
    checkinsPerDay: Number(el("checkins").value||0),
    walkMinutesPerDay: isWalkMode() ? 0 : Number(el("walkMinutes").value||0),
    toggles: {
      meds: el("meds").checked,
      puppy: el("puppy").checked,
      highcare: el("highcare").checked,
      reactive: el("reactive").checked,
      play: el("play").checked,
      train: el("train").checked,
      brush: el("brush").checked,
      homecare: el("homecare").checked,
      concierge: el("concierge").checked,
      pool: el("pool").checked,
      pantry: el("pantry").checked
    },
    transport: {
      keys: Number(el("keys").value||0),
      taxiTrips: Number(el("taxi").value||0),
      taxiKm: Number(el("taxiKm").value||0),
      meet: el("meet").checked,
      bath: el("bath").checked,
      camera: el("camera").checked,
      clean: el("clean").checked
    }
  };
  if (isWalkMode()){
    const billingOption = getWalkBillingOption();
    const selectedDaysCount = selectedWalkDaysCount();
    const walksPerSelectedDay = Number(el("walksPerDay").value || 1);
    const weeklyWalks = selectedDaysCount * walksPerSelectedDay;
    const weeks = billingOption === "weekly_recurring" ? Number(el("walkWeeks").value || 1) : 1;
    const billedWalks = billingOption === "monthly_subscription" ? (weeklyWalks * 4.3) : (weeklyWalks * weeks);
    selections.walkSchedule = {
      billingOption,
      startDate: el("walkStartDate").value || el("startDate").value,
      weeks,
      daysSelected: state.walkDays,
      walksPerSelectedDay,
      timeWindow: el("walkTimeWindow").value,
      minutesPerWalk: Number(el("walkMinutesPerWalk").value || 30),
      weeklyWalks,
      billedWalks,
      totalWalks: billedWalks,
      travelEstimatePerWalk: Number(el("walkTravelEstimatePerWalk").value || 25)
    };
  }

  const start = el("startDate").value;
  const end = el("endDate").value;
  const days = daysBetween(start, end);

  const totalNum = Number(el("totalOut").textContent.replace(/[^0-9]/g,"")) || 0;
  const depositNum = Number(el("depositOut").textContent.replace(/[^0-9]/g,"")) || 0;
  const balanceNum = Number(el("balanceOut").textContent.replace(/[^0-9]/g,"")) || 0;

  el("bookingResult").textContent = "Submitting booking request...";

  try{
    const walkSchedule = isWalkMode() ? (selections.walkSchedule || {}) : {};
    const res = await jsonp({
      action: "booking",
      ts: new Date().toISOString(),
      customerName, customerPhone, customerEmail,
      customerAddress, customerNotes,
      sitterId: sitter.id,
      sitterName: sitter.name,
      zone: el("zone").value,
      zoneLabel: el("zone").value,
      pkg: state.pkg,
      start, end,
      days,
      billingOption: walkSchedule.billingOption || "",
      weeklyWalks: walkSchedule.weeklyWalks ?? "",
      billedWalks: walkSchedule.billedWalks ?? "",
      travelEstimatePerWalk: walkSchedule.travelEstimatePerWalk ?? "",
      minutesPerWalk: walkSchedule.minutesPerWalk ?? "",
      walkDaysSelected: (walkSchedule.daysSelected || []).join(","),
      walksPerSelectedDay: walkSchedule.walksPerSelectedDay ?? "",
      weeks: walkSchedule.weeks ?? "",
      total: totalNum,
      deposit: depositNum,
      balance: balanceNum,
      selectionsJson: JSON.stringify(selections),
      walkScheduleJson: isWalkMode() ? JSON.stringify(walkSchedule) : ""
    });

    if (res && res.ok){
      el("bookingResult").textContent = "Booking request sent successfully.";
      // refresh availability (sitters may be blocked automatically)
      fetchAvailability();
    } else {
      el("bookingResult").textContent = "Booking failed: " + (res && res.error ? res.error : "Unknown error");
    }
  }catch(err){
    el("bookingResult").textContent = "Booking failed. Check API status and try again.";
    if (CONFIG.debug) console.error(err);
  }
}

function wire(){
  document.querySelectorAll("[data-step-toggle]").forEach((btn) => {
    btn.addEventListener("click", () => setOpenStep(Number(btn.getAttribute("data-step-toggle"))));
  });
  document.querySelectorAll("[data-step-done]").forEach((btn) => {
    btn.addEventListener("click", () => completeStep(Number(btn.getAttribute("data-step-done"))));
  });

  // Top buttons
  el("btnPricingInfo").addEventListener("click", () => openModal("modalPricing"));
  el("btnClosePricing").addEventListener("click", () => closeModal("modalPricing"));

  // API status pill test (helps diagnose mobile issues)
  const apiBtn = document.getElementById("apiPillBtn");
  if (apiBtn){
    apiBtn.addEventListener("click", () => {
      const baseRaw = getApiBaseWorking() || (CONFIG.apiBaseUrl || "").trim();
      if (!baseRaw) return;
      const base = baseRaw.startsWith("http") ? baseRaw : ("https://" + baseRaw);
      const u = new URL(base);
      u.searchParams.set("action", "pricing");
      u.searchParams.set("_", Date.now().toString(36));
      // Open a simple JSON response (no callback) so it's easy to verify on any device
      const testUrl = u.toString();
      try {
        const w = window.open(testUrl, "_blank");
        if (!w) window.location.href = testUrl;
      } catch(e){
        window.location.href = testUrl;
      }
    });
  }

  el("btnOpenStay").addEventListener("click", () => {
    selectStayCard(state.pkg);
    openModal("modalStay");
  });
  el("btnCloseStay").addEventListener("click", () => closeModal("modalStay"));
  el("btnCancelStay").addEventListener("click", () => closeModal("modalStay"));
  el("btnConfirmStay").addEventListener("click", confirmStaySelection);
  document.querySelectorAll(".stayCard").forEach((card) => {
    card.addEventListener("click", () => selectStayCard(card.getAttribute("data-pkg")));
    card.addEventListener("dblclick", () => {
      selectStayCard(card.getAttribute("data-pkg"));
      confirmStaySelection();
    });
  });


  el("btnOpenAddons").addEventListener("click", () => openModal("modalAddons"));
  el("btnCloseAddons").addEventListener("click", () => closeModal("modalAddons"));

  el("btnOpenSitters").addEventListener("click", () => openModal("modalSitters"));
  el("btnCloseSitters").addEventListener("click", () => closeModal("modalSitters"));

  el("btnPrev").addEventListener("click", prevSitter);
  el("btnNext").addEventListener("click", nextSitter);
  el("btnSelectCenter").addEventListener("click", () => {
    const staff = (state.sitters || []).map(normalizedSitter);
    if (!staff.length) return;
    const sitter = normalizedSitter(state.sitters[state.carouselIndex] || staff[0]);
    state.selectedSitter = sitter;
    renderSelectedSitter();
    closeModal("modalSitters");
  });

  el("btnCopy").addEventListener("click", copyQuote);
  el("btnOpenBooking").addEventListener("click", openBooking);
  el("btnRequestBooking").addEventListener("click", openBooking);

  el("btnCloseBooking").addEventListener("click", () => closeModal("modalBooking"));
  el("btnSubmitBooking").addEventListener("click", submitBooking);

  // Change sitter shortcut
  el("btnChangeSitter").addEventListener("click", () => openModal("modalSitters"));

  // Package selection
  document.querySelectorAll(".pkgBtn").forEach(b => {
    b.addEventListener("click", () => setPkg(b.getAttribute("data-pkg")));
  });

  // Inputs that change availability
  ["startDate","endDate","zone","walkStartDate","walkWeeks","walksPerDay","walkTimeWindow","walkBillingOption"].forEach(id => {
    el(id).addEventListener("change", () => {
      renderPriceHints();
      recalc();
      fetchAvailability();
    });
  });

  // Inputs that affect price
  ["hours","dogs","cats","walkMinutes","taxiKm","walkMinutesPerWalk","walkTravelEstimatePerWalk"].forEach(id => {
    el(id).addEventListener("input", () => {
      if (id === "hours"){
        el("hoursOut").textContent = el("hours").value;
        if (el("hoursModalOut")) el("hoursModalOut").textContent = el("hours").value;
        renderStaySummary();
      }
      if (id === "walkMinutes"){
        el("walkMinutesOut").textContent = el("walkMinutes").value;
        el("walkCostOut").textContent = money(Number(el("walkMinutes").value) * Number(PRICES.add.walkPerMinute||0));
      }
      if (id === "walkMinutesPerWalk"){
        el("walkMinutesPerWalkOut").textContent = el("walkMinutesPerWalk").value;
      }
      recalc();
    });
  });

  ["puppy","meds","highcare","reactive","play","train","brush","homecare","concierge","pool","camera","bath","clean","pantry","meet"].forEach(id => {
    el(id).addEventListener("change", recalc);
  });

  // Add-on tabs
  document.querySelectorAll("#addonTabs .tab").forEach(t => {
    t.addEventListener("click", () => setTab(t.getAttribute("data-tab")));
  });

  // Update method selection
  document.querySelectorAll(".radioCard[data-upd]").forEach(c => {
    c.addEventListener("click", () => setUpdateTier(c.getAttribute("data-upd")));
  });

  // Steppers
  document.querySelectorAll("[data-stepper]").forEach(btn => {
    btn.addEventListener("click", () => stepperAdjust(btn.getAttribute("data-stepper"), Number(btn.getAttribute("data-dir"))));
  });

  // Numeric stepper input manual typing
  ["checkins","keys","taxi","dogs","cats"].forEach(id => {
    el(id).addEventListener("input", () => {
      const min = Number.isFinite(Number(el(id).min)) ? Number(el(id).min) : 0;
      const max = Number.isFinite(Number(el(id).max)) && el(id).max !== "" ? Number(el(id).max) : 999;
      el(id).value = String(clamp(parseInt(el(id).value || "0", 10), min, max));
      if (id === "checkins") el("checkinsOut").textContent = el(id).value;
      if (id === "keys") el("keysOut").textContent = el(id).value;
      if (id === "taxi") el("taxiOut").textContent = el(id).value;
      refreshStepDoneState();
      recalc();
    });
  });

  // Close modals when clicking outside modal content
  ["modalPricing","modalAddons","modalSitters","modalBooking","modalStay"].forEach(mid => {
    el(mid).addEventListener("click", (e) => {
      if (e.target === el(mid)) closeModal(mid);
    });
  });
}

function setDefaultDates(){
  const now = new Date();
  const yyyy = now.getFullYear();
  const mm = String(now.getMonth() + 1).padStart(2,"0");
  const dd = String(now.getDate()).padStart(2,"0");
  const today = `${yyyy}-${mm}-${dd}`;
  el("startDate").value = today;
  el("endDate").value = today;
  if (el("walkStartDate")) el("walkStartDate").value = today;
}

export async function boot(){
  // Ensure logo is used
  document.querySelector(".logoWrap img").src = CONFIG.logoUrl;

  // Preview faces on button
  (CONFIG.facePreviews || []).slice(0,3).forEach((src, i) => {
    const img = document.getElementById("facePrev" + i);
    if (img) img.src = src;
  });

  setDefaultDates();
  renderWalkDays();
  wire();
  setOpenStep(1);
  selectStayCard(state.pkg);

  await pingApi();
  await fetchPricing();
  renderPriceHints();
  await fetchAvailability();
  syncModeUI();
  renderSelectedSitter();
  recalc();
}
