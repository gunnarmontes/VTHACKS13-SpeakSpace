// src/App.jsx
import React from "react";
import { Outlet } from "react-router-dom";
import AgentBridge from "./components/AgentBridge";

export default function App() {
  return (
    <>
      <AgentBridge />
      <Outlet />
    </>
  );
}
