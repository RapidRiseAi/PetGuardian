export const CONFIG = {
  apiBaseUrl: "https://petguardian-api.team-a6c.workers.dev",
  appsScriptExecUrl: "https://script.google.com/macros/s/AKfycbzfqeIQFLpa155Gf-454kbaSQUEw9RpiqISwnPbSkfYPV-aU6LZlbTbkG5jv-sHe6jp/exec",
  apiTimeoutMs: 9000,
  logoUrl: "logo.png",
  bgUrl: "bg.jpeg",
  facePreviews: ["face1.png", "face2.png", "face3.png"],
  depositPercent: 0.50,
  debug: false
};

export const PRICES = {
  base: { dayHourly: 60, night: 200, fullDay: 320 },
  travelPerDay: { sabie: 0, wr: 30, nel: 60 },
  peakMultiplier: 1.15,
  longStay: { blockDays: 10, factor: 0.9, capBlocks: 2 },
  controls: { includedPets: 1, maxDailyCap: 600 },
  add: {
    extraDogPerDay: 20,
    extraCatPerDay: 10,
    checkinPerDay: 50,
    updatesBasicPerDay: 0,
    updatesPhotosPerDay: 10,
    updatesLogbookPerDay: 25,
    medsPerDay: 30,
    puppyCarePerDay: 30,
    highcarePerDay: 100,
    reactivePerDay: 50,
    homecarePerDay: 30,
    conciergePerDay: 50,
    playPerDay: 10,
    trainPerDay: 25,
    brushPerDay: 15,
    poolPerDay: 30,
    walkPerMinute: 1,
    pantryCreditPerDay: 50,
    meetOneTime: 0,
    keyTripOneTime: 50,
    petTaxiTripOneTime: 150,
    petTaxiKm: 5,
    bathOneTime: 150,
    cameraOneTime: 100,
    cleanOneTime: 150
  }
};
