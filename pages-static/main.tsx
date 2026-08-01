import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Home from "../app/page";
import "../app/globals.css";

const root = document.getElementById("root");
if (!root) throw new Error("质量慧析 Pages 根节点缺失");

createRoot(root).render(
  <StrictMode>
    <Home />
  </StrictMode>,
);
