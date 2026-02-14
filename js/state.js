export const createInitialState = () => ({
  pkg: "day",
  walkDays: ["mon", "wed", "fri"],
  selectedSitter: null,
  sitters: [],
  carouselIndex: 0,
  apiOk: false,
  pricingLoaded: false
});

export const state = createInitialState();

export function resetState() {
  Object.assign(state, createInitialState());
}
