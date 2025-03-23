import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export interface ViewState {
  center: [number, number];
  zoom: number;
  bearing: number;
  pitch: number;
  isAnimating: boolean;
}

export interface ViewStateStore extends ViewState {
  setCenter: (center: [number, number]) => void;
  setZoom: (zoom: number) => void;
  setBearing: (bearing: number) => void;
  setPitch: (pitch: number) => void;
  setViewState: (viewState: Partial<ViewState>) => void;
  startAnimation: () => void;
  stopAnimation: () => void;
  reset: () => void;
}

const initialState: ViewState = {
  center: [0, 0],
  zoom: 1,
  bearing: 0,
  pitch: 0,
  isAnimating: false
};

export const useViewStateStore = create<ViewStateStore>()(
  devtools(
    (set) => ({
      ...initialState,
      setCenter: (center) => set({ center }),
      setZoom: (zoom) => set({ zoom }),
      setBearing: (bearing) => set({ bearing }),
      setPitch: (pitch) => set({ pitch }),
      setViewState: (viewState) => set((state) => ({ ...state, ...viewState })),
      startAnimation: () => set({ isAnimating: true }),
      stopAnimation: () => set({ isAnimating: false }),
      reset: () => set(initialState)
    }),
    { name: 'view-state-store' }
  )
);

export const viewStateSelectors = {
  getCenter: (state: ViewState) => state.center,
  getZoom: (state: ViewState) => state.zoom,
  getBearing: (state: ViewState) => state.bearing,
  getPitch: (state: ViewState) => state.pitch,
  isAnimating: (state: ViewState) => state.isAnimating,
  hasChanges: (state: ViewState) => 
    state.center[0] !== initialState.center[0] ||
    state.center[1] !== initialState.center[1] ||
    state.zoom !== initialState.zoom ||
    state.bearing !== initialState.bearing ||
    state.pitch !== initialState.pitch
}; 