import { Route, Routes } from "react-router-dom";
import { EditorPage } from "./EditorPage.js";
import { HomePage } from "./HomePage.js";
import { PreviewPage } from "./PreviewPage.js";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<HomePage />} />
      <Route path="/editor" element={<EditorPage />} />
      <Route path="/preview" element={<PreviewPage />} />
    </Routes>
  );
}
