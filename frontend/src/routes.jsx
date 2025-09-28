import { createBrowserRouter } from "react-router-dom";

import App from "./App";
import LoginPage from "./pages/Login";
import RegisterPage from "./pages/Register";
import NotFound from "./pages/NotFound";
import Dashboard from "./pages/Dashboard";
import ListingPage from "./pages/ListingPage";
import VoiceLive from "./pages/VoiceLive";             // ← add this

const routes = [
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <LoginPage /> },
      { path: "register", element: <RegisterPage /> },
      { path: "dashboard", element: <Dashboard /> },
      { path: "listing/:id", element: <ListingPage /> },
      { path: "voice", element: <VoiceLive /> },
      { path: "*", element: <NotFound /> },
    ],
  },
];

export const router = createBrowserRouter(routes);
