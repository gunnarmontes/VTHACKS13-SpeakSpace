// src/App.jsx
import React from "react";
import { Outlet, Link } from "react-router-dom";

export default function App() {
  return (
    <div>
      <Outlet />
    </div>
  );
}
