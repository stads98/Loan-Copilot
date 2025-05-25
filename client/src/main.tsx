import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Set page title
document.title = "Loan Processing Co-Pilot | Adler Capital";

createRoot(document.getElementById("root")!).render(<App />);
