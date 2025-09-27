// src/routes.jsx
import React from "react";
import { createBrowserRouter } from "react-router-dom";

// Import your pages
import App from "./App";
import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import ListingPage from "./pages/ListingPage";


const routes = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <LoginPage /> }, // default route
      { path: "register", element: <RegisterPage /> },
      { path: "dashboard", element: <Dashboard /> },   // <-- new route
      { path: "/listing/:id", element: <ListingPage /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
