import { createSlice, PayloadAction } from "@reduxjs/toolkit";

interface AppState {
  isSoftware: boolean;
}

const initialState: AppState = {
  isSoftware: false,
};

const appSlice = createSlice({
  name: "app",
  initialState,
  reducers: {
    setIsSoftware: (state, action: PayloadAction<boolean>) => {
      state.isSoftware = action.payload;
    },
  },
});

export const { setIsSoftware } = appSlice.actions;
export default appSlice.reducer;

