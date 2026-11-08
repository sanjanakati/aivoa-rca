import { configureStore, createSlice } from "@reduxjs/toolkit";

const incidentSlice = createSlice({
  name: "incidents",
  initialState: {
    current: null,
    history: [],
    loading: false,
    error: null,
  },
  reducers: {
    setCurrent: (state, action) => {
      state.current = action.payload;
    },
    setHistory: (state, action) => {
      state.history = action.payload;
    },
    setLoading: (state, action) => {
      state.loading = action.payload;
    },
    setError: (state, action) => {
      state.error = action.payload;
    },
  },
});

export const { setCurrent, setHistory, setLoading, setError } =
  incidentSlice.actions;

const store = configureStore({
  reducer: {
    incidents: incidentSlice.reducer,
  },
});
export default store;
