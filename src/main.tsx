import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import "./index.css";
import { seedDefaultPresets } from "./lib/blendshape-defaults";

// Seed built-in blendshape presets on first run
seedDefaultPresets();

createRoot(document.getElementById("root")!).render(<App />);
