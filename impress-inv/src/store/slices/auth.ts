import { createSlice, PayloadAction } from "@reduxjs/toolkit";

export interface AuthUser {
  id: number;
  name: string;
  email: string;
  role: string | null;
  permissions?: { id: number; name: string; operation: string }[];
}

interface AuthState {
  user: AuthUser | null;
  token: string | null;
  isAuthenticated: boolean;
}

const initialState: AuthState = {
  user: null,
  token: null,
  isAuthenticated: false,
};

const authSlice = createSlice({
  name: "auth",
  initialState,
  reducers: {
    setCredentials(state, action: PayloadAction<{ user: AuthUser; token: string }>) {
      state.user = action.payload.user;
      state.token = action.payload.token;
      state.isAuthenticated = true;
    },
    logoutUser(state) {
      state.user = null;
      state.token = null;
      state.isAuthenticated = false;
      if (typeof window !== "undefined") {
        localStorage.removeItem("token");
      }
    }
  },
});

export const { setCredentials, logoutUser } = authSlice.actions;
export default authSlice.reducer;
