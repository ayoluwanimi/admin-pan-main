import { BrowserRouter, Routes, Route } from "react-router-dom";
import "./App.css";
import VisitorPage from "./components/VisitorPage";
import AdminPanel from "./components/admin/AdminPanel";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<VisitorPage />} />
        <Route path="/admin" element={<AdminPanel />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
